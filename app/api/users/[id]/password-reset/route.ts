import db from '@/lib/db'
import { handler, requireAdmin, requireAdminCode } from '@/lib/auth'
import { rateLimit } from '@/lib/ratelimit'
import { mailConfigured, sendPasswordResetEmail } from '@/lib/mail'
import { issueResetToken } from '@/lib/verification'

/** Emails the user a reset link. The admin never sees or sets the password. */
export function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handler(async () => {
    const admin = await requireAdmin()
    const { id } = await params
    const { code } = await req.json().catch(() => ({}))
    requireAdminCode(req, admin.id, code)
    const user = db.prepare(`
      SELECT email FROM profiles WHERE id = ? AND verified_at IS NOT NULL AND disabled_at IS NULL
    `).get(id) as { email: string } | undefined
    if (!user) {
      return Response.json({ error: 'Only active, confirmed accounts can be sent a link' }, { status: 400 })
    }

    const limited = rateLimit(`admin-reset:${id}`, 3, 15 * 60_000)
    if (!limited.ok) {
      return Response.json({ error: 'A link was just sent. Try again in a few minutes.' }, { status: 429 })
    }
    if (!mailConfigured()) {
      return Response.json({ error: 'The server cannot send email right now.' }, { status: 503 })
    }

    await sendPasswordResetEmail(user.email, issueResetToken(id))
    return Response.json({ ok: true, message: `Reset link sent to ${user.email}.` })
  })
}
