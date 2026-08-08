import { cookies } from 'next/headers'
import db from '@/lib/db'
import {
  createSession, handler, hashPassword, newId, SESSION_COOKIE, sessionCookieOptions,
} from '@/lib/auth'
import { clientIp, rateLimit } from '@/lib/ratelimit'

// The old client-side signup enforced these in the browser only, so anyone could register
// any address by calling the API directly. Both rules now live on the server.
const ALLOWED_DOMAIN = process.env.ALLOWED_EMAIL_DOMAIN || 'robcol.k12.tr'
const MIN_PASSWORD_LENGTH = 6

export function POST(req: Request) {
  return handler(async () => {
    // Registration is unauthenticated and public — cap it so the box can't be flooded.
    const limited = rateLimit(`signup:${clientIp(req)}`, 5, 60 * 60_000)
    if (!limited.ok) {
      return Response.json({ error: 'Too many sign-up attempts. Try again later.' },
        { status: 429, headers: { 'Retry-After': String(limited.retryAfterSeconds) } })
    }

    const { email, password, fullName } = await req.json().catch(() => ({}))

    if (typeof email !== 'string' || typeof password !== 'string') {
      return Response.json({ error: 'Email and password are required' }, { status: 400 })
    }

    const normalized = email.trim().toLowerCase()
    if (!normalized.endsWith(`@${ALLOWED_DOMAIN}`)) {
      return Response.json({ error: `Only @${ALLOWED_DOMAIN} email addresses can register` },
        { status: 403 })
    }
    if (password.length < MIN_PASSWORD_LENGTH) {
      return Response.json({ error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters` },
        { status: 400 })
    }

    const existing = db.prepare('SELECT 1 FROM profiles WHERE email = ?').get(normalized)
    if (existing) {
      return Response.json({ error: 'An account with that email already exists' }, { status: 409 })
    }

    const id = newId()
    db.prepare(`
      INSERT INTO profiles (id, email, full_name, role, password_hash)
      VALUES (?, ?, ?, 'student', ?)
    `).run(id, normalized, typeof fullName === 'string' && fullName.trim() ? fullName.trim() : null,
           await hashPassword(password))

    const { token, expires } = createSession(id)
    ;(await cookies()).set(SESSION_COOKIE, token, sessionCookieOptions(expires))

    return Response.json({ user: { id, email: normalized, role: 'student' } }, { status: 201 })
  })
}
