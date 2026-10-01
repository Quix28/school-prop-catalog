import db, { holdsDuring, today } from '@/lib/db'
import { handler, requireAdmin } from '@/lib/auth'
import { parseItemInput } from '@/lib/items'

type Params = { params: Promise<{ id: string }> }

export function PATCH(req: Request, { params }: Params) {
  return handler(async () => {
    await requireAdmin()
    const { id } = await params
    const parsed = parseItemInput(await req.json().catch(() => ({})))
    if ('error' in parsed) return Response.json({ error: parsed.error }, { status: 400 })

    // Most units booked on any day from today on (the peak falls on today or on a start date).
    const { peak } = db.prepare(`
      WITH days(d) AS (
        SELECT @today
        UNION SELECT start_date FROM reservations
         WHERE item_id = @id AND status IN ('pending','approved','checked_out') AND start_date > @today
      )
      SELECT COALESCE(MAX((SELECT SUM(r.quantity) FROM reservations r
                            WHERE r.item_id = @id AND ${holdsDuring('d', 'd')})), 0) AS peak
        FROM days
    `).get({ id, today: today() }) as { peak: number }
    if (parsed.item.quantity_total < peak) {
      return Response.json(
        { error: `${peak} are booked on the same day, so the quantity can't go below that.` },
        { status: 409 })
    }

    const info = db.prepare(`
      UPDATE items
         SET name = @name, description = @description, category = @category,
             subcategory = @subcategory, quantity_total = @quantity_total,
             quantity_available = @quantity_total, condition = @condition, notes = @notes,
             image_url = @image_url, updated_at = datetime('now')
       WHERE id = @id AND deleted_at IS NULL
    `).run({ ...parsed.item, id })
    if (info.changes === 0) return Response.json({ error: 'Item not found' }, { status: 404 })
    return Response.json({ ok: true })
  })
}

export function DELETE(_req: Request, { params }: Params) {
  return handler(async () => {
    await requireAdmin()
    const { id } = await params

    // Keep the record of who has it.
    const open = db.prepare(`
      SELECT 1 FROM reservations
       WHERE item_id = ? AND status IN ('pending','approved','checked_out') LIMIT 1
    `).get(id)
    if (open) {
      return Response.json(
        { error: 'This item has open reservations. Reject, cancel or return them first.' },
        { status: 409 })
    }

    // Soft delete keeps reservation history.
    const info = db.prepare(`
      UPDATE items SET deleted_at = datetime('now'), updated_at = datetime('now')
       WHERE id = ? AND deleted_at IS NULL
    `).run(id)
    if (info.changes === 0) return Response.json({ error: 'Item not found' }, { status: 404 })
    return Response.json({ ok: true })
  })
}
