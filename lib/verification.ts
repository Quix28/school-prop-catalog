import { createHash, randomBytes } from 'node:crypto'
import db, { sqlTime } from './db'
import { hashPassword, verifyPassword } from './auth'

const TOKEN_HOURS = 24
const RESET_MINUTES = 60

/** Tokens are stored hashed. */
export const hashToken = (token: string) => createHash('sha256').update(token).digest('hex')

/** New confirmation token; returns the raw value for the email. */
export function issueVerificationToken(userId: string): string {
  const token = randomBytes(32).toString('hex')
  const expires = sqlTime(new Date(Date.now() + TOKEN_HOURS * 3_600_000))
  db.prepare(`
    UPDATE profiles SET verify_token_hash = ?, verify_expires_at = ?, updated_at = datetime('now')
     WHERE id = ?
  `).run(hashToken(token), expires, userId)
  return token
}

export type ConfirmResult = { id: string } | 'invalid' | 'wrong_password'

/**
 * Activates an account. Needs the token and the sign-up password: anyone can overwrite an
 * unconfirmed sign-up, so the link alone could activate a stranger's password.
 */
export async function confirmAccount(token: string, password: string): Promise<ConfirmResult> {
  const tokenHash = hashToken(token)
  const row = db.prepare(`
    SELECT id, password_hash FROM profiles
     WHERE verify_token_hash = ? AND verify_expires_at > datetime('now') AND verified_at IS NULL
  `).get(tokenHash) as { id: string; password_hash: string } | undefined

  if (!row) return 'invalid'
  if (!(await verifyPassword(password, row.password_hash))) return 'wrong_password'

  // Re-check the token: a re-signup during the hash above replaces it.
  const info = db.prepare(`
    UPDATE profiles
       SET verified_at = datetime('now'), verify_token_hash = NULL, verify_expires_at = NULL,
           updated_at = datetime('now')
     WHERE id = ? AND verify_token_hash = ? AND verified_at IS NULL
  `).run(row.id, tokenHash)

  return info.changes === 1 ? { id: row.id } : 'invalid'
}

/** New reset token; replaces any previous one. */
export function issueResetToken(userId: string): string {
  const token = randomBytes(32).toString('hex')
  const expires = sqlTime(new Date(Date.now() + RESET_MINUTES * 60_000))
  db.prepare(`
    UPDATE profiles SET reset_token_hash = ?, reset_expires_at = ?, updated_at = datetime('now')
     WHERE id = ?
  `).run(hashToken(token), expires, userId)
  return token
}

/** Sets the password from a single-use reset token and ends all sessions. */
export async function resetPassword(token: string, password: string): Promise<boolean> {
  const passwordHash = await hashPassword(password)
  const row = db.prepare(`
    UPDATE profiles
       SET password_hash = ?, reset_token_hash = NULL, reset_expires_at = NULL,
           updated_at = datetime('now')
     WHERE reset_token_hash = ? AND reset_expires_at > datetime('now') AND verified_at IS NOT NULL
    RETURNING id
  `).get(passwordHash, hashToken(token)) as { id: string } | undefined

  if (!row) return false
  db.prepare('DELETE FROM sessions WHERE user_id = ?').run(row.id)
  return true
}
