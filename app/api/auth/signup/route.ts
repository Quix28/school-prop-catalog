import db from '@/lib/db'
import { handler, hashPassword, MIN_PASSWORD_LENGTH, newId } from '@/lib/auth'
import { clientIp, rateLimit } from '@/lib/ratelimit'
import { mailConfigured, sendVerificationEmail } from '@/lib/mail'
import { issueVerificationToken } from '@/lib/verification'

// Enforced on the server; the form's checks can be bypassed.
const ALLOWED_DOMAIN = process.env.ALLOWED_EMAIL_DOMAIN || 'robcol.k12.tr'
// Whole-address match: endsWith accepted "<x@evil.com>@school.tr".
const EMAIL_RE = new RegExp(`^[a-z0-9._%+-]+@${ALLOWED_DOMAIN.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`)

const tooMany = (retryAfterSeconds: number) =>
  Response.json({ error: 'Too many sign-up attempts. Try again later.' },
    { status: 429, headers: { 'Retry-After': String(retryAfterSeconds) } })

export function POST(req: Request) {
  return handler(async () => {
    // No mail, no sign-up.
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

    // Counted after validation. Per-IP is loose: a whole class shares one network.
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
      // Unconfirmed: overwrite rather than 409, so nobody can squat an address. Confirming
      // needs this password, so a stranger's overwrite can't be activated by the owner.
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

    // No session until the email is confirmed.
    return Response.json({ pending: true, email: normalized }, { status: 201 })
  })
}
