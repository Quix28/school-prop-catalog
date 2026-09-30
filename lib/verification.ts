import { createHash, randomBytes } from 'node:crypto'
import db, { sqlTime } from './db'
import { hashPassword, verifyPassword } from './auth'

const TOKEN_HOURS = 24
// Short, because a reset link is as good as the password for as long as it lives.
const RESET_MINUTES = 60

/** Stored as a SHA-256 hash so a leaked database cannot be used to activate accounts. */
export const hashToken = (token: string) => createHash('sha256').update(token).digest('hex')

/** Issues a fresh token for a profile and returns the raw value to put in the email. */
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
 * Activates an account. Needs the emailed token *and* the password chosen at sign-up:
 * an unconfirmed sign-up can be overwritten by anyone (so nobody can squat an address), and
 * without the password check the real owner's click would activate a stranger's password.
 * Single use: the hash is cleared on success.
 */
export async function confirmAccount(token: string, password: string): Promise<ConfirmResult> {
  const tokenHash = hashToken(token)
  const row = db.prepare(`
    SELECT id, password_hash FROM profiles
     WHERE verify_token_hash = ? AND verify_expires_at > datetime('now') AND verified_at IS NULL
  `).get(tokenHash) as { id: string; password_hash: string } | undefined

  if (!row) return 'invalid'
  if (!(await verifyPassword(password, row.password_hash))) return 'wrong_password'

  // Re-check the token in the UPDATE: a re-signup during the password hash above replaces
  // both the password and the token, and must not be activated by this older link.
  const info = db.prepare(`
    UPDATE profiles
       SET verified_at = datetime('now'), verify_token_hash = NULL, verify_expires_at = NULL,
           updated_at = datetime('now')
     WHERE id = ? AND verify_token_hash = ? AND verified_at IS NULL
  `).run(row.id, tokenHash)

  return info.changes === 1 ? { id: row.id } : 'invalid'
}

/** Issues a password-reset token for a confirmed account; the previous one stops working. */
export function issueResetToken(userId: string): string {
  const token = randomBytes(32).toString('hex')
  const expires = sqlTime(new Date(Date.now() + RESET_MINUTES * 60_000))
  db.prepare(`
    UPDATE profiles SET reset_token_hash = ?, reset_expires_at = ?, updated_at = datetime('now')
     WHERE id = ?
  `).run(hashToken(token), expires, userId)
  return token
}

/**
 * Sets a new password from a reset link. Checking and spending the token is one UPDATE, so
 * the link works exactly once. Every session is ended too: if the password was reset because
 * someone else knew it, their session must not outlive the change.
 */
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
