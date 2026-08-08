import db from '@/lib/db'
import { handler, hashPassword, newId } from '@/lib/auth'
import { clientIp, rateLimit } from '@/lib/ratelimit'
import { mailConfigured, sendVerificationEmail } from '@/lib/mail'
import { issueVerificationToken } from '@/lib/verification'

// Enforced here, not in the browser: the form's copy of these rules can be bypassed.
const ALLOWED_DOMAIN = process.env.ALLOWED_EMAIL_DOMAIN || 'robcol.k12.tr'
const MIN_PASSWORD_LENGTH = 6

export function POST(req: Request) {
  return handler(async () => {
    const limited = rateLimit(`signup:${clientIp(req)}`, 5, 60 * 60_000)
    if (!limited.ok) {
      return Response.json({ error: 'Too many sign-up attempts. Try again later.' },
        { status: 429, headers: { 'Retry-After': String(limited.retryAfterSeconds) } })
    }

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
    if (!normalized.endsWith(`@${ALLOWED_DOMAIN}`)) {
      return Response.json({ error: `Only @${ALLOWED_DOMAIN} email addresses can register` },
        { status: 403 })
    }
    if (password.length < MIN_PASSWORD_LENGTH) {
      return Response.json({ error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters` },
        { status: 400 })
    }

    const existing = db.prepare(
      'SELECT id, verified_at FROM profiles WHERE email = ?'
    ).get(normalized) as { id: string; verified_at: string | null } | undefined

    let userId: string

    if (existing?.verified_at) {
      return Response.json({ error: 'An account with that email already exists' }, { status: 409 })
    } else if (existing) {
      // The address was registered but never confirmed, so nobody has proven they own it.
      // Overwrite it instead of returning 409: otherwise anyone could permanently block a
      // classmate from signing up just by submitting their address first.
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
