import db, { holdsDuring, today } from '@/lib/db'
import { handler, newId, requireAdmin, requireUser } from '@/lib/auth'
import { INSERT_ITEM_SQL, parseItemInput } from '@/lib/items'
import type { Item } from '@/lib/types'

type ItemRow = Omit<Item, 'additional_images'> & { additional_images: string | null; held: number }

/** additional_images is stored as a JSON string. */
function toItem(row: ItemRow): Item {
  const { held, ...rest } = row
  return {
    ...rest,
    // Derived, not stored: units free today. Date ranges are checked when reserving.
    quantity_available: Math.max(0, row.quantity_total - held),
    additional_images: row.additional_images ? JSON.parse(row.additional_images) : null,
  }
}

export function GET() {
  return handler(async () => {
    await requireUser()
    const now = today()
    const rows = db.prepare(`
      SELECT i.*,
             COALESCE((SELECT SUM(r.quantity) FROM reservations r
                        WHERE r.item_id = i.id AND ${holdsDuring()}), 0) AS held
        FROM items i
       WHERE i.deleted_at IS NULL
       ORDER BY i.name
    `).all({ start: now, end: now, today: now }) as ItemRow[]
    return Response.json({ items: rows.map(toItem) })
  })
}

export function POST(req: Request) {
  return handler(async () => {
    const admin = await requireAdmin()
    const parsed = parseItemInput(await req.json().catch(() => ({})))
    if ('error' in parsed) return Response.json({ error: parsed.error }, { status: 400 })

    const id = newId()
    db.prepare(INSERT_ITEM_SQL).run({ ...parsed.item, id, created_by: admin.id })

    const row = db.prepare('SELECT *, 0 AS held FROM items WHERE id = ?').get(id) as ItemRow
    return Response.json({ item: toItem(row) }, { status: 201 })
  })
}
