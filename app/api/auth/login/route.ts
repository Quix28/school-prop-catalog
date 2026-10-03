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
    // Key on IP and email; IP alone can be spoofed.
    const key = `login:${clientIp(req)}:${normalized}`

    const limited = rateLimit(key)
    if (!limited.ok) {
      return Response.json({ error: 'Too many failed attempts. Try again later.' },
        { status: 429, headers: { 'Retry-After': String(limited.retryAfterSeconds) } })
    }

    const row = db.prepare(
      'SELECT id, email, full_name, role, password_hash, verified_at, disabled_at FROM profiles WHERE email = ?'
    ).get(normalized) as
      { id: string; email: string; full_name: string | null; role: 'student' | 'admin';
        password_hash: string; verified_at: string | null; disabled_at: string | null } | undefined

    // Same error for unknown user and wrong password.
    const invalid = Response.json({ error: 'Invalid email or password' }, { status: 401 })
    if (!row) return invalid
    if (!(await verifyPassword(password, row.password_hash))) return invalid

    // Only after the password check, so it reveals nothing.
    if (!row.verified_at) {
      return Response.json({
        error: 'Confirm your email address first. Check your inbox for the link.',
        unverified: true,
      }, { status: 403 })
    }

    if (row.disabled_at) {
      return Response.json({ error: 'This account has been deactivated. Contact an admin.' }, { status: 403 })
    }

    resetLimit(key)
    const { token, expires } = createSession(row.id)
    ;(await cookies()).set(SESSION_COOKIE, token, sessionCookieOptions(expires))

    return Response.json({
      user: { id: row.id, email: row.email, full_name: row.full_name, role: row.role },
    })
  })
}
