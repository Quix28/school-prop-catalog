import db from '@/lib/db'
import { handler, newId, requireAdmin, requireUser } from '@/lib/auth'
import type { Item } from '@/lib/types'

type ItemRow = Omit<Item, 'additional_images'> & { additional_images: string | null }

/** additional_images was a Postgres text[]; in SQLite it is a JSON string. */
function toItem(row: ItemRow): Item {
  return {
    ...row,
    additional_images: row.additional_images ? JSON.parse(row.additional_images) : null,
  }
}

export function GET() {
  return handler(async () => {
    await requireUser()
    const rows = db.prepare('SELECT * FROM items ORDER BY name').all() as ItemRow[]
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

    const row = db.prepare('SELECT * FROM items WHERE id = ?').get(id) as ItemRow
    return Response.json({ item: toItem(row) }, { status: 201 })
  })
}
