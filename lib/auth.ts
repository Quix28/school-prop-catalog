import { randomBytes, randomUUID, scrypt as _scrypt, timingSafeEqual } from 'node:crypto'
import { promisify } from 'node:util'
import { cookies } from 'next/headers'
import db, { sqlTime } from './db'
import { clientIp, rateLimit, resetLimit } from './ratelimit'

const scrypt = promisify(_scrypt) as (pw: string, salt: Buffer, len: number) => Promise<Buffer>

export const SESSION_COOKIE = 'session'
const SESSION_DAYS = 30
export const MIN_PASSWORD_LENGTH = 6

/** Set COOKIE_SECURE=true behind HTTPS; browsers drop Secure cookies over plain http. */
export function sessionCookieOptions(expires: Date) {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: process.env.COOKIE_SECURE === 'true',
    path: '/',
    expires,
  }
}

// scrypt is built into Node: no native build on ARM.
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16)
  const key = await scrypt(password, salt, 64)
  return `${salt.toString('hex')}:${key.toString('hex')}`
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [saltHex, keyHex] = stored.split(':')
  if (!saltHex || !keyHex) return false
  const key = await scrypt(password, Buffer.from(saltHex, 'hex'), 64)
  const expected = Buffer.from(keyHex, 'hex')
  return key.length === expected.length && timingSafeEqual(key, expected)
}

export type SessionUser = {
  id: string
  email: string
  full_name: string | null
  role: 'student' | 'admin'
}

export function createSession(userId: string): { token: string; expires: Date } {
  const token = randomBytes(32).toString('hex')
  const expires = new Date(Date.now() + SESSION_DAYS * 86_400_000)
  db.prepare('INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)')
    .run(token, userId, sqlTime(expires))
  return { token, expires }
}

export function destroySession(token: string) {
  db.prepare('DELETE FROM sessions WHERE token = ?').run(token)
}

/** The signed-in user from the session cookie, or null. */
export async function getUser(): Promise<SessionUser | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value
  if (!token) return null
  const row = db.prepare(`
    SELECT p.id, p.email, p.full_name, p.role
      FROM sessions s JOIN profiles p ON p.id = s.user_id
     WHERE s.token = ? AND s.expires_at > datetime('now') AND p.disabled_at IS NULL
  `).get(token) as SessionUser | undefined
  return row ?? null
}

/** Throws a Response for route handlers to return directly. */
export async function requireUser(): Promise<SessionUser> {
  const user = await getUser()
  if (!user) throw new Response(JSON.stringify({ error: 'Not signed in' }), { status: 401 })
  return user
}

/** Server-side admin check; the pages' redirects are only for convenience. */
export async function requireAdmin(): Promise<SessionUser> {
  const user = await requireUser()
  if (user.role !== 'admin') {
    throw new Response(JSON.stringify({ error: 'Admins only' }), { status: 403 })
  }
  return user
}

/**
 * Settings and every action on a user account also need ADMIN_PROMOTE_CODE, so an unattended
 * admin session is not enough. Unset means those actions are disabled.
 */
export function requireAdminCode(req: Request, adminId: string, code: unknown) {
  // Throttle guesses; only wrong codes count.
  const key = `admin-code:${clientIp(req)}:${adminId}`
  const limited = rateLimit(key, 5, 10 * 60_000)
  if (!limited.ok) {
    throw Response.json({ error: 'Too many incorrect codes. Try again later.' },
      { status: 429, headers: { 'Retry-After': String(limited.retryAfterSeconds) } })
  }
  const expected = process.env.ADMIN_PROMOTE_CODE
  if (!expected) {
    throw Response.json(
      { error: 'Disabled: ADMIN_PROMOTE_CODE is not set on the server.' }, { status: 503 })
  }
  const a = Buffer.from(typeof code === 'string' ? code : '')
  const b = Buffer.from(expected)
  // timingSafeEqual throws on different lengths.
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    throw Response.json({ error: 'Incorrect confirmation code' }, { status: 403 })
  }
  resetLimit(key)
}

export const newId = () => randomUUID()

/** Wraps a handler so thrown Responses (401/403) become the reply. */
export function handler(fn: () => Promise<Response>): Promise<Response> {
  return fn().catch(e => {
    if (e instanceof Response) return e
    // Log it; never send internal error details to the client.
    console.error(e)
    return Response.json({ error: 'Server error' }, { status: 500 })
  })
}
