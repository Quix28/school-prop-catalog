import db from '@/lib/db'
import { handler } from '@/lib/auth'
import { clientIp, rateLimit } from '@/lib/ratelimit'
import { mailConfigured, sendVerificationEmail } from '@/lib/mail'
import { issueVerificationToken } from '@/lib/verification'

export function POST(req: Request) {
  return handler(async () => {
    const { email } = await req.json().catch(() => ({}))
    if (typeof email !== 'string') {
      return Response.json({ error: 'Email is required' }, { status: 400 })
    }
    const normalized = email.trim().toLowerCase()

    const limited = rateLimit(`resend:${clientIp(req)}:${normalized}`, 3, 15 * 60_000)
    if (!limited.ok) {
      return Response.json({ error: 'Too many requests. Try again in a few minutes.' },
        { status: 429, headers: { 'Retry-After': String(limited.retryAfterSeconds) } })
    }
    if (!mailConfigured()) {
      return Response.json({ error: 'The server cannot send email right now.' }, { status: 503 })
    }

    const row = db.prepare('SELECT id, verified_at FROM profiles WHERE email = ?')
      .get(normalized) as { id: string; verified_at: string | null } | undefined

    // Always answer the same way. Saying "no such account" here would turn this endpoint
    // into a way to discover which school addresses are registered.
    const generic = Response.json({
      ok: true,
      message: 'If that address needs confirming, a new link is on its way.',
    })

    if (!row || row.verified_at) return generic

    // Issuing a new token invalidates the previous one, so an old link in an inbox stops working.
    const token = issueVerificationToken(row.id)
    try {
      await sendVerificationEmail(normalized, token)
    } catch (e) {
      console.error('resend failed:', e)
    }
    return generic
  })
}
