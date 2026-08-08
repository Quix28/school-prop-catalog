import { randomBytes, randomUUID, scrypt as _scrypt, timingSafeEqual } from 'node:crypto'
import { promisify } from 'node:util'
import { cookies } from 'next/headers'
import db from './db'

const scrypt = promisify(_scrypt) as (pw: string, salt: Buffer, len: number) => Promise<Buffer>

export const SESSION_COOKIE = 'session'
const SESSION_DAYS = 30

/**
 * Cookie flags. `Secure` is env-driven because a Secure cookie is silently dropped over
 * plain http:// — set COOKIE_SECURE=true once TLS is terminated in front of the app.
 */
export function sessionCookieOptions(expires: Date) {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: process.env.COOKIE_SECURE === 'true',
    path: '/',
    expires,
  }
}

// scrypt ships with Node — no bcrypt/argon2 native build to fight with on ARM.
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
  // Constant-time compare so a wrong password can't be narrowed by timing.
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
    .run(token, userId, expires.toISOString())
  return { token, expires }
}

export function destroySession(token: string) {
  db.prepare('DELETE FROM sessions WHERE token = ?').run(token)
}

/** The signed-in user, or null. Reads the httpOnly cookie — never trusts client input. */
export async function getUser(): Promise<SessionUser | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value
  if (!token) return null
  const row = db.prepare(`
    SELECT p.id, p.email, p.full_name, p.role
      FROM sessions s JOIN profiles p ON p.id = s.user_id
     WHERE s.token = ? AND s.expires_at > datetime('now')
  `).get(token) as SessionUser | undefined
  return row ?? null
}

/** Throws a Response for route handlers to return directly. */
export async function requireUser(): Promise<SessionUser> {
  const user = await getUser()
  if (!user) throw new Response(JSON.stringify({ error: 'Not signed in' }), { status: 401 })
  return user
}

/**
 * Admin gate enforced on the server. The old Supabase version checked the role in the
 * browser and redirected, which any user could bypass by calling the API directly.
 */
export async function requireAdmin(): Promise<SessionUser> {
  const user = await requireUser()
  if (user.role !== 'admin') {
    throw new Response(JSON.stringify({ error: 'Admins only' }), { status: 403 })
  }
  return user
}

export const newId = () => randomUUID()

/** Wraps a handler so thrown Responses (401/403) become the reply. */
export function handler(fn: () => Promise<Response>): Promise<Response> {
  return fn().catch(e => {
    if (e instanceof Response) return e
    console.error(e)
    return Response.json({ error: e?.message || 'Server error' }, { status: 500 })
  })
}
