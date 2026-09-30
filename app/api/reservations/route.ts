import db, { HOLDS_DURING, today } from '@/lib/db'
import { handler, newId, requireUser } from '@/lib/auth'

/** A real calendar date in YYYY-MM-DD. Date.parse alone rolls 2026-02-31 over to March 3. */
const isDate = (s: unknown): s is string =>
  typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s)
  && !isNaN(Date.parse(s)) && new Date(s).toISOString().startsWith(s)

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
    const { start_date: start, end_date: end } = body
    if (!itemId || !isDate(start) || !isDate(end)) {
      return Response.json({ error: 'Item and both dates are required' }, { status: 400 })
    }
    const now = today()
    if (start < now) {
      return Response.json({ error: 'Start date cannot be in the past' }, { status: 400 })
    }
    if (end < start) {
      return Response.json({ error: 'End date cannot be before the start date' }, { status: 400 })
    }

    const item = db.prepare('SELECT quantity_total FROM items WHERE id = ? AND deleted_at IS NULL')
      .get(itemId) as { quantity_total: number } | undefined
    if (!item) return Response.json({ error: 'Item not found' }, { status: 404 })

    const quantity = Number.isFinite(Number(body.quantity))
      ? Math.max(1, Math.floor(Number(body.quantity)))
      : 1

    // Check against what is free for these dates, not total stock — otherwise the same unit
    // can be booked over and over. No await between this read and the insert below, and
    // better-sqlite3 is synchronous, so there is no window for two requests to both pass.
    // ponytail: sums every reservation touching the range, so with quantity > 1 two bookings
    // that never overlap each other still both count. Conservative, never overbooks; switch to
    // a per-day peak if items with large quantities start getting refused wrongly.
    const { held } = db.prepare(`
      SELECT COALESCE(SUM(r.quantity), 0) AS held FROM reservations r
       WHERE r.item_id = @itemId AND ${HOLDS_DURING}
    `).get({ itemId, start, end, today: now }) as { held: number }
    const available = item.quantity_total - held
    if (quantity > available) {
      return Response.json(
        { error: available > 0
            ? `Only ${available} available for those dates`
            : 'Already booked for those dates' },
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
