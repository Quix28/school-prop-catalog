import db from '@/lib/db'
import { handler, hashPassword, MIN_PASSWORD_LENGTH, newId } from '@/lib/auth'
import { clientIp, rateLimit } from '@/lib/ratelimit'
import { mailConfigured, sendVerificationEmail } from '@/lib/mail'
import { issueVerificationToken } from '@/lib/verification'

// Enforced here, not in the browser: the form's copy of these rules can be bypassed.
const ALLOWED_DOMAIN = process.env.ALLOWED_EMAIL_DOMAIN || 'robcol.k12.tr'
// A whole-string match on a plain address. An endsWith check alone accepts
// "<x@evil.com>@school.tr", which mail libraries deliver to x@evil.com.
const EMAIL_RE = new RegExp(`^[a-z0-9._%+-]+@${ALLOWED_DOMAIN.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`)

const tooMany = (retryAfterSeconds: number) =>
  Response.json({ error: 'Too many sign-up attempts. Try again later.' },
    { status: 429, headers: { 'Retry-After': String(retryAfterSeconds) } })

export function POST(req: Request) {
  return handler(async () => {
    // Refuse rather than create accounts nobody can ever confirm.
    if (!mailConfigured()) {
      return Response.json(
        { error: 'Sign-up is unavailable: the server cannot send confirmation email.' },
        { status: 503 })
    }

    const { email, password, fullName } = await req.json().catch(() => ({}))
    if (typeof email !== 'string' || typeof password !== 'string') {
      return Response.json({ error: 'Email and password are required' }, { status: 400 })
    }

    const normalized = email.trim().toLowerCase()
    if (!EMAIL_RE.test(normalized)) {
      return Response.json({ error: `Only @${ALLOWED_DOMAIN} email addresses can register` },
        { status: 403 })
    }
    if (password.length < MIN_PASSWORD_LENGTH) {
      return Response.json({ error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters` },
        { status: 400 })
    }

    // Counted only once the request is valid, so typos don't use up anyone's quota. The
    // per-address limit stops inbox flooding; the per-IP one is loose because a whole class
    // registers from the same school network (or the same 'unknown' without TRUST_PROXY).
    const perEmail = rateLimit(`signup:${normalized}`, 3, 15 * 60_000)
    if (!perEmail.ok) return tooMany(perEmail.retryAfterSeconds)
    const perIp = rateLimit(`signup-ip:${clientIp(req)}`, 60, 60 * 60_000)
    if (!perIp.ok) return tooMany(perIp.retryAfterSeconds)

    const existing = db.prepare(
      'SELECT id, verified_at FROM profiles WHERE email = ?'
    ).get(normalized) as { id: string; verified_at: string | null } | undefined

    let userId: string

    if (existing?.verified_at) {
      return Response.json({ error: 'An account with that email already exists' }, { status: 409 })
    } else if (existing) {
      // The address was registered but never confirmed, so nobody has proven they own it.
      // Overwrite it instead of returning 409: otherwise anyone could permanently block a
      // classmate from signing up just by submitting their address first. Confirming needs
      // this password too, so an overwrite by a stranger cannot be activated by the owner.
      db.prepare(`
        UPDATE profiles SET password_hash = ?, full_name = ?, updated_at = datetime('now')
         WHERE id = ?
      `).run(await hashPassword(password),
             typeof fullName === 'string' && fullName.trim() ? fullName.trim() : null,
             existing.id)
      userId = existing.id
    } else {
      userId = newId()
      db.prepare(`
        INSERT INTO profiles (id, email, full_name, role, password_hash)
        VALUES (?, ?, ?, 'student', ?)
      `).run(userId, normalized,
             typeof fullName === 'string' && fullName.trim() ? fullName.trim() : null,
             await hashPassword(password))
    }

    const token = issueVerificationToken(userId)
    try {
      await sendVerificationEmail(normalized, token)
    } catch (e) {
      console.error('verification email failed:', e)
      return Response.json({ error: 'Could not send the confirmation email. Try again shortly.' },
        { status: 502 })
    }

    // Deliberately no session: the account is inert until the link in the email is opened,
    // which is the whole point — only the inbox owner can activate it.
    return Response.json({ pending: true, email: normalized }, { status: 201 })
  })
}
