import db from '@/lib/db'
import { handler, requireUser } from '@/lib/auth'

const ADMIN_STATUSES = ['approved', 'rejected', 'checked_out', 'returned'] as const

export function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handler(async () => {
    const user = await requireUser()
    const { id } = await params
    const { status } = await req.json().catch(() => ({}))

    const row = db.prepare('SELECT user_id, status FROM reservations WHERE id = ?').get(id) as
      { user_id: string; status: string } | undefined
    if (!row) return Response.json({ error: 'Reservation not found' }, { status: 404 })

    // A student may only cancel, and only their own. Everything in the review workflow is
    // admin-only — the old version enforced this nowhere on the server.
    if (status === 'cancelled') {
      if (row.user_id !== user.id && user.role !== 'admin') {
        return Response.json({ error: 'Not your reservation' }, { status: 403 })
      }
      db.prepare(`UPDATE reservations SET status = 'cancelled' WHERE id = ?`).run(id)
      return Response.json({ ok: true })
    }

    if (!ADMIN_STATUSES.includes(status)) {
      return Response.json({ error: 'Unknown status' }, { status: 400 })
    }
    if (user.role !== 'admin') {
      return Response.json({ error: 'Admins only' }, { status: 403 })
    }

    // Stamp the matching timestamp for the state being entered.
    const now = new Date().toISOString()
    db.prepare(`
      UPDATE reservations
         SET status = ?,
             reviewed_at = ?,
             reviewed_by = ?,
             checked_out_at = CASE WHEN ? = 'checked_out' THEN ? ELSE checked_out_at END,
             returned_at    = CASE WHEN ? = 'returned'    THEN ? ELSE returned_at    END
       WHERE id = ?
    `).run(status, now, user.id, status, now, status, now, id)

    return Response.json({ ok: true })
  })
}
