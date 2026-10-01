import db from '@/lib/db'
import { handler } from '@/lib/auth'
import { clientIp, rateLimit } from '@/lib/ratelimit'
import { mailConfigured, sendPasswordResetEmail } from '@/lib/mail'
import { issueResetToken } from '@/lib/verification'

export function POST(req: Request) {
  return handler(async () => {
    const { email } = await req.json().catch(() => ({}))
    if (typeof email !== 'string') {
      return Response.json({ error: 'Email is required' }, { status: 400 })
    }
    const normalized = email.trim().toLowerCase()

    const limited = rateLimit(`forgot:${clientIp(req)}:${normalized}`, 3, 15 * 60_000)
    if (!limited.ok) {
      return Response.json({ error: 'Too many requests. Try again in a few minutes.' },
        { status: 429, headers: { 'Retry-After': String(limited.retryAfterSeconds) } })
    }
    if (!mailConfigured()) {
      return Response.json({ error: 'The server cannot send email right now.' }, { status: 503 })
    }

    const row = db.prepare('SELECT id FROM profiles WHERE email = ? AND verified_at IS NOT NULL AND disabled_at IS NULL')
      .get(normalized) as { id: string } | undefined

    // Not awaited and same reply either way, so timing reveals nothing. Unconfirmed accounts
    // get no link: signing up again replaces their password.
    if (row) {
      sendPasswordResetEmail(normalized, issueResetToken(row.id))
        .catch(e => console.error('password reset email failed:', e))
    }
    return Response.json({
      ok: true,
      message: 'If an account uses that address, a reset link is on its way.',
    })
  })
}
