import db from '@/lib/db'
import { handler, requireAdmin } from '@/lib/auth'

export function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  return handler(async () => {
    await requireAdmin()
    const { id } = await params
    // reservations.item_id is ON DELETE CASCADE, so a deleted item takes its bookings with it.
    const info = db.prepare('DELETE FROM items WHERE id = ?').run(id)
    if (info.changes === 0) return Response.json({ error: 'Item not found' }, { status: 404 })
    return Response.json({ ok: true })
  })
}
