import db, { today } from '@/lib/db'
import { handler, requireAdmin } from '@/lib/auth'
import { csvCell, ITEM_FIELDS } from '@/lib/items'

export function GET() {
  return handler(async () => {
    await requireAdmin()
    const rows = db.prepare(`
      SELECT ${ITEM_FIELDS.join(', ')} FROM items WHERE deleted_at IS NULL ORDER BY name
    `).all() as Record<string, unknown>[]

    const lines = [ITEM_FIELDS.join(','), ...rows.map(r => ITEM_FIELDS.map(f => csvCell(r[f])).join(','))]
    // BOM so Excel reads UTF-8 (Turkish characters) correctly.
    return new Response('﻿' + lines.join('\r\n') + '\r\n', {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="items-${today()}.csv"`,
        'Cache-Control': 'no-store',
      },
    })
  })
}
