import db, { today } from '@/lib/db'
import { handler, requireAdmin } from '@/lib/auth'

/** A consistent snapshot of the database. Contains password hashes: admins only. */
export function GET() {
  return handler(async () => {
    await requireAdmin()
    return new Response(new Uint8Array(db.serialize()), {
      headers: {
        'Content-Type': 'application/vnd.sqlite3',
        'Content-Disposition': `attachment; filename="catalog-${today()}.db"`,
        'Cache-Control': 'no-store',
      },
    })
  })
}
