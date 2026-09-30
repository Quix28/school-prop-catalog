import db from '@/lib/db'
import { handler, requireAdmin } from '@/lib/auth'

export function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handler(async () => {
    await requireAdmin()
    const { id } = await params

    // Deleting a prop someone has checked out would erase the only record of who has it.
    const open = db.prepare(`
      SELECT 1 FROM reservations
       WHERE item_id = ? AND status IN ('pending','approved','checked_out') LIMIT 1
    `).get(id)
    if (open) {
      return Response.json(
        { error: 'This item has open reservations. Reject, cancel or return them first.' },
        { status: 409 })
    }

    // Soft delete: the item leaves the catalog, but past reservations keep pointing at it.
    const info = db.prepare(`
      UPDATE items SET deleted_at = datetime('now'), updated_at = datetime('now')
       WHERE id = ? AND deleted_at IS NULL
    `).run(id)
    if (info.changes === 0) return Response.json({ error: 'Item not found' }, { status: 404 })
    return Response.json({ ok: true })
  })
}
