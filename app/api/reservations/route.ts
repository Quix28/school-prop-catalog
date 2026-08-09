import db from '@/lib/db'
import { handler, newId, requireUser } from '@/lib/auth'

/**
 * GET returns your own reservations. Admins get everyone's, with the requester's email —
 * the two implicit Supabase joins (`select('*, items(name, image_url)')` and the separate
 * profiles fetch) become explicit SQL joins here.
 */
export function GET() {
  return handler(async () => {
    const user = await requireUser()

    const rows = user.role === 'admin'
      ? db.prepare(`
          SELECT r.*, i.name AS item_name, i.image_url AS item_image, p.email AS user_email
            FROM reservations r
            JOIN items i    ON i.id = r.item_id
            JOIN profiles p ON p.id = r.user_id
           ORDER BY r.requested_at DESC
        `).all()
      : db.prepare(`
          SELECT r.*, i.name AS item_name, i.image_url AS item_image
            FROM reservations r
            JOIN items i ON i.id = r.item_id
           WHERE r.user_id = ?
           ORDER BY r.requested_at DESC
        `).all(user.id)

    return Response.json({ reservations: rows })
  })
}

export function POST(req: Request) {
  return handler(async () => {
    const user = await requireUser()
    const body = await req.json().catch(() => ({}))

    const itemId = typeof body.item_id === 'string' ? body.item_id : ''
    const start = typeof body.start_date === 'string' ? body.start_date : ''
    const end = typeof body.end_date === 'string' ? body.end_date : ''
    if (!itemId || !start || !end) {
      return Response.json({ error: 'Item and both dates are required' }, { status: 400 })
    }
    if (end < start) {
      return Response.json({ error: 'End date cannot be before the start date' }, { status: 400 })
    }

    const item = db.prepare('SELECT quantity_total FROM items WHERE id = ?').get(itemId) as
      { quantity_total: number } | undefined
    if (!item) return Response.json({ error: 'Item not found' }, { status: 404 })

    const quantity = Number.isFinite(Number(body.quantity))
      ? Math.max(1, Math.floor(Number(body.quantity)))
      : 1

    // Check against what is actually free, not total stock — otherwise the same unit can be
    // booked over and over. No await between this read and the insert below, and better-sqlite3
    // is synchronous, so there is no window for two requests to both pass the check.
    const { held } = db.prepare(`
      SELECT COALESCE(SUM(quantity), 0) AS held FROM reservations
       WHERE item_id = ? AND status IN ('pending','approved','checked_out')
    `).get(itemId) as { held: number }
    const available = item.quantity_total - held
    if (quantity > available) {
      return Response.json(
        { error: available > 0 ? `Only ${available} available` : 'None available' },
        { status: 400 })
    }

    const id = newId()
    // user_id comes from the session, never from the request body — otherwise a student
    // could file a reservation in someone else's name.
    db.prepare(`
      INSERT INTO reservations (id, item_id, user_id, quantity, start_date, end_date, status, purpose)
      VALUES (?, ?, ?, ?, ?, ?, 'pending', ?)
    `).run(id, itemId, user.id, quantity, start, end, body.purpose?.trim() || null)

    return Response.json({ id }, { status: 201 })
  })
}
