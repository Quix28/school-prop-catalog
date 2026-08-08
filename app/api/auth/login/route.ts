import { cookies } from 'next/headers'
import db from '@/lib/db'
import {
  createSession, handler, SESSION_COOKIE, sessionCookieOptions, verifyPassword,
} from '@/lib/auth'
import { clientIp, rateLimit, resetLimit } from '@/lib/ratelimit'

export function POST(req: Request) {
  return handler(async () => {
    const { email, password } = await req.json().catch(() => ({}))
    if (typeof email !== 'string' || typeof password !== 'string') {
      return Response.json({ error: 'Email and password are required' }, { status: 400 })
    }

    const normalized = email.trim().toLowerCase()
    // Key on IP *and* email: forwarded-for headers are spoofable if the app is reachable
    // directly, so IP alone would be a weak throttle for password guessing.
    const key = `login:${clientIp(req)}:${normalized}`

    const limited = rateLimit(key)
    if (!limited.ok) {
      return Response.json({ error: 'Too many failed attempts. Try again later.' },
        { status: 429, headers: { 'Retry-After': String(limited.retryAfterSeconds) } })
    }

    const row = db.prepare(
      'SELECT id, email, full_name, role, password_hash FROM profiles WHERE email = ?'
    ).get(normalized) as
      { id: string; email: string; full_name: string | null; role: 'student' | 'admin'; password_hash: string } | undefined

    // One generic message for "no such user" and "wrong password" — a distinct reply would
    // let anyone enumerate which school addresses have accounts.
    const invalid = Response.json({ error: 'Invalid email or password' }, { status: 401 })
    if (!row) return invalid
    if (!(await verifyPassword(password, row.password_hash))) return invalid

    resetLimit(key)
    const { token, expires } = createSession(row.id)
    ;(await cookies()).set(SESSION_COOKIE, token, sessionCookieOptions(expires))

    return Response.json({
      user: { id: row.id, email: row.email, full_name: row.full_name, role: row.role },
    })
  })
}
