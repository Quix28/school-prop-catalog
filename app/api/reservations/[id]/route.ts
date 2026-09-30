import db from '@/lib/db'
import { handler, requireUser } from '@/lib/auth'

/**
 * The states each status may be entered from. Enforced in the UPDATE itself, not just a prior
 * read, so a stale admin page or two admins acting at once cannot revive a cancelled request,
 * and a student cannot cancel a prop they are already holding.
 */
const ALLOWED_FROM: Record<string, string[]> = {
  approved: ['pending'],
  rejected: ['pending'],
  checked_out: ['approved'],
  returned: ['checked_out'],
  cancelled: ['pending', 'approved'],
}

export function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handler(async () => {
    const user = await requireUser()
    const { id } = await params
    const { status } = await req.json().catch(() => ({}))

    const from = typeof status === 'string' ? ALLOWED_FROM[status] : undefined
    if (!from) return Response.json({ error: 'Unknown status' }, { status: 400 })

    const row = db.prepare('SELECT user_id FROM reservations WHERE id = ?').get(id) as
      { user_id: string } | undefined
    if (!row) return Response.json({ error: 'Reservation not found' }, { status: 404 })

    // A student may only cancel, and only their own. Everything in the review workflow is
    // admin-only — the old version enforced this nowhere on the server.
    if (status === 'cancelled') {
      if (row.user_id !== user.id && user.role !== 'admin') {
        return Response.json({ error: 'Not your reservation' }, { status: 403 })
      }
    } else if (user.role !== 'admin') {
      return Response.json({ error: 'Admins only' }, { status: 403 })
    }

    // Each step stamps only its own timestamp, so checkout and return keep who reviewed it.
    const info = db.prepare(`
      UPDATE reservations
         SET status = @status,
             reviewed_at    = CASE WHEN @status IN ('approved','rejected') THEN datetime('now') ELSE reviewed_at END,
             reviewed_by    = CASE WHEN @status IN ('approved','rejected') THEN @by ELSE reviewed_by END,
             checked_out_at = CASE WHEN @status = 'checked_out' THEN datetime('now') ELSE checked_out_at END,
             returned_at    = CASE WHEN @status = 'returned' THEN datetime('now') ELSE returned_at END
       WHERE id = @id AND status IN (SELECT value FROM json_each(@from))
    `).run({ status, by: user.id, id, from: JSON.stringify(from) })

    if (info.changes === 0) {
      return Response.json(
        { error: 'This reservation has already changed. Refresh to see its current status.' },
        { status: 409 })
    }
    return Response.json({ ok: true })
  })
}
