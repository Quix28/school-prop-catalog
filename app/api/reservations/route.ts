import db, { holdsDuring, today } from '@/lib/db'
import { handler, newId, requireUser } from '@/lib/auth'
import { addDays, dayCount, isDate, plural } from '@/lib/dates'
import { getSettings } from '@/lib/settings'

/**
 * Your reservations; admins get everyone's, with the requester's email. LEFT JOINs so a
 * reservation whose item or account was deleted outside the app still shows up.
 */
export function GET() {
  return handler(async () => {
    const user = await requireUser()

    const rows = user.role === 'admin'
      ? db.prepare(`
          SELECT r.*, i.name AS item_name, i.image_url AS item_image, p.email AS user_email
            FROM reservations r
            LEFT JOIN items i    ON i.id = r.item_id
            LEFT JOIN profiles p ON p.id = r.user_id
           ORDER BY r.requested_at DESC
        `).all()
      : db.prepare(`
          SELECT r.*, i.name AS item_name, i.image_url AS item_image
            FROM reservations r
            LEFT JOIN items i ON i.id = r.item_id
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

    // Booking rules from Settings. Admins are exempt.
    if (user.role !== 'admin') {
      const s = getSettings()
      const refuse = (error: string) => Response.json({ error }, { status: 400 })
      if (s.min_notice_days && start < addDays(now, s.min_notice_days)) {
        return refuse(`Book at least ${plural(s.min_notice_days, 'day')} ahead`)
      }
      if (s.max_reservation_days && dayCount(start, end) > s.max_reservation_days) {
        return refuse(`A reservation can be at most ${plural(s.max_reservation_days, 'day')}`)
      }
      const blocked = s.blackouts.find(b => b.start <= end && b.end >= start)
      if (blocked) {
        return refuse(`${blocked.label || 'Those dates'} (${blocked.start} to ${blocked.end}) can't be booked`)
      }
      if (s.max_items_per_student) {
        const { open } = db.prepare(`
          SELECT COALESCE(SUM(quantity), 0) AS open FROM reservations
           WHERE user_id = ? AND status IN ('pending','approved','checked_out')
        `).get(user.id) as { open: number }
        if (open + quantity > s.max_items_per_student) {
          return refuse(`You can have at most ${plural(s.max_items_per_student, 'item')} reserved at a time`)
        }
      }
    }

    // Units free for these dates. Synchronous check-then-insert, so no race.
    // Sums all overlapping bookings, so it can refuse too early when quantity > 1.
    // Switch to a per-day peak if that happens.
    const { held } = db.prepare(`
      SELECT COALESCE(SUM(r.quantity), 0) AS held FROM reservations r
       WHERE r.item_id = @itemId AND ${holdsDuring()}
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
    // user_id always comes from the session.
    db.prepare(`
      INSERT INTO reservations (id, item_id, user_id, quantity, start_date, end_date, status, purpose)
      VALUES (?, ?, ?, ?, ?, ?, 'pending', ?)
    `).run(id, itemId, user.id, quantity, start, end, body.purpose?.trim() || null)

    return Response.json({ id }, { status: 201 })
  })
}
