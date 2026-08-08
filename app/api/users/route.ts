import db from '@/lib/db'
import { handler, requireAdmin } from '@/lib/auth'

/** Every account, with how many reservations each has ever made. Admins only. */
export function GET() {
  return handler(async () => {
    await requireAdmin()
    const users = db.prepare(`
      SELECT p.id, p.email, p.full_name, p.role, p.created_at,
             COUNT(r.id) AS reservation_count
        FROM profiles p
        LEFT JOIN reservations r ON r.user_id = p.id
       GROUP BY p.id
       ORDER BY p.role DESC, p.email
    `).all()
    // password_hash is deliberately never selected.
    return Response.json({ users })
  })
}
