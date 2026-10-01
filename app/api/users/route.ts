import db from '@/lib/db'
import { handler, requireAdmin } from '@/lib/auth'

/** All accounts with reservation counts. Admins only. */
export function GET() {
  return handler(async () => {
    await requireAdmin()
    const users = db.prepare(`
      SELECT p.id, p.email, p.full_name, p.role, p.created_at, p.disabled_at,
             p.verified_at IS NOT NULL AS verified,
             COUNT(r.id) AS reservation_count,
             COALESCE(SUM(r.status IN ('pending','approved','checked_out')), 0) AS open_count
        FROM profiles p
        LEFT JOIN reservations r ON r.user_id = p.id
       GROUP BY p.id
       ORDER BY p.role DESC, p.email
    `).all()
    return Response.json({ users })
  })
}
