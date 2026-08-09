import db from '@/lib/db'
import { handler, newId, requireAdmin, requireUser } from '@/lib/auth'
import type { Item } from '@/lib/types'

type ItemRow = Omit<Item, 'additional_images'> & { additional_images: string | null; held: number }

/** Reservation statuses that hold a unit out of circulation until they end or are cancelled. */
export const HELD_STATUSES = ['pending', 'approved', 'checked_out'] as const

/** additional_images was a Postgres text[]; in SQLite it is a JSON string. */
function toItem(row: ItemRow): Item {
  const { held, ...rest } = row
  return {
    ...rest,
    // Availability is derived, not stored: the stored column drifted because nothing ever
    // decremented it. total minus units currently held is always correct by construction.
    quantity_available: Math.max(0, row.quantity_total - held),
    additional_images: row.additional_images ? JSON.parse(row.additional_images) : null,
  }
}

export function GET() {
  return handler(async () => {
    await requireUser()
    const rows = db.prepare(`
      SELECT i.*,
             COALESCE((SELECT SUM(r.quantity) FROM reservations r
                        WHERE r.item_id = i.id
                          AND r.status IN ('pending','approved','checked_out')), 0) AS held
        FROM items i
       ORDER BY i.name
    `).all() as ItemRow[]
    return Response.json({ items: rows.map(toItem) })
  })
}

export function POST(req: Request) {
  return handler(async () => {
    const admin = await requireAdmin()
    const body = await req.json().catch(() => ({}))

    const name = typeof body.name === 'string' ? body.name.trim() : ''
    if (!name) return Response.json({ error: 'Name is required' }, { status: 400 })

    const category = body.category === 'costume' ? 'costume' : 'prop'
    // Never trust a client-supplied number: NaN or a negative would corrupt availability.
    const total = Number.isFinite(Number(body.quantity_total))
      ? Math.max(1, Math.floor(Number(body.quantity_total)))
      : 1

    const id = newId()
    db.prepare(`
      INSERT INTO items (id, name, description, category, subcategory,
                         quantity_total, quantity_available, image_url, notes, created_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id, name,
      body.description?.trim() || null,
      category,
      body.subcategory?.trim() || null,
      total, total,
      body.image_url?.trim() || null,
      body.notes?.trim() || null,
      admin.id,
    )

    // A brand-new item holds nothing yet, so held is 0.
    const row = db.prepare('SELECT *, 0 AS held FROM items WHERE id = ?').get(id) as ItemRow
    return Response.json({ item: toItem(row) }, { status: 201 })
  })
}
