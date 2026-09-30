import { timingSafeEqual } from 'node:crypto'
import db from '@/lib/db'
import { handler, requireAdmin } from '@/lib/auth'
import { clientIp, rateLimit, resetLimit } from '@/lib/ratelimit'

/** Role changes need an admin session plus ADMIN_PROMOTE_CODE. Unset means disabled. */
function codeMatches(supplied: unknown): boolean {
  const expected = process.env.ADMIN_PROMOTE_CODE
  if (!expected || typeof supplied !== 'string') return false
  const a = Buffer.from(supplied)
  const b = Buffer.from(expected)
  // timingSafeEqual throws on different lengths.
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

    // Throttle code guesses; only wrong codes count.
    const limitKey = `promote:${clientIp(req)}:${admin.id}`
    const limited = rateLimit(limitKey, 5, 10 * 60_000)
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
    resetLimit(limitKey)

    const target = db.prepare('SELECT id, email, role FROM profiles WHERE id = ?').get(id) as
      { id: string; email: string; role: string } | undefined
    if (!target) return Response.json({ error: 'User not found' }, { status: 404 })

    // Don't let admins lock themselves out.
    if (target.id === admin.id && role === 'student') {
      return Response.json({ error: 'You cannot remove your own admin role' }, { status: 400 })
    }
    // Keep at least one admin.
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
