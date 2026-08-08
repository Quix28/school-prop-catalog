import { timingSafeEqual } from 'node:crypto'
import db from '@/lib/db'
import { handler, requireAdmin } from '@/lib/auth'
import { clientIp, rateLimit } from '@/lib/ratelimit'

/**
 * Changing someone's role needs an admin session *and* a separate confirmation code, so a
 * borrowed or forgotten session cannot quietly mint new admins.
 *
 * The code lives in ADMIN_PROMOTE_CODE, not in this file — the repository is public, and a
 * literal here would be readable by anyone. Unset means the feature is off rather than open.
 */
function codeMatches(supplied: unknown): boolean {
  const expected = process.env.ADMIN_PROMOTE_CODE
  if (!expected || typeof supplied !== 'string') return false
  const a = Buffer.from(supplied)
  const b = Buffer.from(expected)
  // Compare lengths separately; timingSafeEqual throws on a mismatch.
  return a.length === b.length && timingSafeEqual(a, b)
}

export function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handler(async () => {
    const admin = await requireAdmin()
    const { id } = await params
    const { role, code } = await req.json().catch(() => ({}))

    if (role !== 'admin' && role !== 'student') {
      return Response.json({ error: 'Role must be admin or student' }, { status: 400 })
    }

    // A 4-digit code is guessable in a few thousand tries, so throttle attempts even though
    // the caller is already an authenticated admin.
    const limited = rateLimit(`promote:${clientIp(req)}:${admin.id}`, 5, 10 * 60_000)
    if (!limited.ok) {
      return Response.json({ error: 'Too many incorrect codes. Try again later.' },
        { status: 429, headers: { 'Retry-After': String(limited.retryAfterSeconds) } })
    }

    if (!process.env.ADMIN_PROMOTE_CODE) {
      return Response.json(
        { error: 'Role changes are disabled: ADMIN_PROMOTE_CODE is not set on the server.' },
        { status: 503 })
    }
    if (!codeMatches(code)) {
      return Response.json({ error: 'Incorrect confirmation code' }, { status: 403 })
    }

    const target = db.prepare('SELECT id, email, role FROM profiles WHERE id = ?').get(id) as
      { id: string; email: string; role: string } | undefined
    if (!target) return Response.json({ error: 'User not found' }, { status: 404 })

    // Demoting yourself is how you lock yourself out of the panel you are standing in.
    if (target.id === admin.id && role === 'student') {
      return Response.json({ error: 'You cannot remove your own admin role' }, { status: 400 })
    }
    // And the last admin leaving means nobody can ever approve a reservation again.
    if (target.role === 'admin' && role === 'student') {
      const { n } = db.prepare(`SELECT COUNT(*) AS n FROM profiles WHERE role = 'admin'`)
        .get() as { n: number }
      if (n <= 1) {
        return Response.json({ error: 'This is the only admin — promote someone else first' },
          { status: 400 })
      }
    }

    db.prepare(`UPDATE profiles SET role = ?, updated_at = datetime('now') WHERE id = ?`)
      .run(role, id)

    return Response.json({ ok: true, id, role })
  })
}
