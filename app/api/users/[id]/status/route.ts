import db from '@/lib/db'
import { handler, requireAdmin, requireAdminCode } from '@/lib/auth'

/** Deactivates or reactivates a student. Deactivating also signs them out. */
export function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handler(async () => {
    const admin = await requireAdmin()
    const { id } = await params
    const { disabled, code } = await req.json().catch(() => ({}))
    if (typeof disabled !== 'boolean') {
      return Response.json({ error: 'disabled must be true or false' }, { status: 400 })
    }
    requireAdminCode(req, admin.id, code)

    const target = db.prepare('SELECT role FROM profiles WHERE id = ?').get(id) as
      { role: string } | undefined
    if (!target) return Response.json({ error: 'User not found' }, { status: 404 })
    if (id === admin.id || target.role !== 'student') {
      return Response.json({ error: 'Remove the admin role first' }, { status: 400 })
    }

    db.transaction(() => {
      db.prepare(`
        UPDATE profiles SET disabled_at = CASE WHEN ? THEN datetime('now') END,
               updated_at = datetime('now')
         WHERE id = ?
      `).run(disabled ? 1 : 0, id)
      if (disabled) db.prepare('DELETE FROM sessions WHERE user_id = ?').run(id)
    })()
    return Response.json({ ok: true })
  })
}
