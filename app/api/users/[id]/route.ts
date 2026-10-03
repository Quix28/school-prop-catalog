import db from '@/lib/db'
import { handler, requireAdmin, requireAdminCode } from '@/lib/auth'

export function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handler(async () => {
    const admin = await requireAdmin()
    const { id } = await params
    const { role, code } = await req.json().catch(() => ({}))

    if (role !== 'admin' && role !== 'student') {
      return Response.json({ error: 'Role must be admin or student' }, { status: 400 })
    }

    requireAdminCode(req, admin.id, code)

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

/**
 * Deletes a student. With ?force=true, also deletes their reservations, as long as every one
 * is finished (returned, cancelled or rejected). Open reservations always block it.
 */
export function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handler(async () => {
    const admin = await requireAdmin()
    const { id } = await params
    const { code } = await req.json().catch(() => ({}))
    requireAdminCode(req, admin.id, code)
    const target = db.prepare('SELECT role FROM profiles WHERE id = ?').get(id) as
      { role: string } | undefined
    if (!target) return Response.json({ error: 'User not found' }, { status: 404 })
    if (id === admin.id || target.role !== 'student') {
      return Response.json({ error: 'Remove the admin role first' }, { status: 400 })
    }
    const { total, open } = db.prepare(`
      SELECT COUNT(*) AS total,
             COALESCE(SUM(status IN ('pending','approved','checked_out')), 0) AS open
        FROM reservations WHERE user_id = ?
    `).get(id) as { total: number; open: number }
    if (open > 0) {
      return Response.json(
        { error: 'This account has open reservations. Resolve them first, or deactivate it.' },
        { status: 409 })
    }
    if (total > 0 && new URL(req.url).searchParams.get('force') !== 'true') {
      return Response.json(
        { error: 'This account has reservation history. Deactivate it, or force delete it.' },
        { status: 409 })
    }
    // Reservations and sessions go with it (ON DELETE CASCADE).
    db.prepare('DELETE FROM profiles WHERE id = ?').run(id)
    return Response.json({ ok: true })
  })
}
