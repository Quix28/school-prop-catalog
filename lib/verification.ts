import { createHash, randomBytes } from 'node:crypto'
import db from './db'

const TOKEN_HOURS = 24

/** Stored as a SHA-256 hash so a leaked database cannot be used to activate accounts. */
export const hashToken = (token: string) => createHash('sha256').update(token).digest('hex')

/** Issues a fresh token for a profile and returns the raw value to put in the email. */
export function issueVerificationToken(userId: string): string {
  const token = randomBytes(32).toString('hex')
  const expires = new Date(Date.now() + TOKEN_HOURS * 3_600_000).toISOString()
  db.prepare(`
    UPDATE profiles SET verify_token_hash = ?, verify_expires_at = ?, updated_at = datetime('now')
     WHERE id = ?
  `).run(hashToken(token), expires, userId)
  return token
}

export type PendingProfile = { id: string; email: string }

/**
 * Consumes a token. Single use: the hash is cleared on success, so a link forwarded to
 * someone else after the fact is worthless.
 */
export function consumeVerificationToken(token: string): PendingProfile | null {
  const row = db.prepare(`
    SELECT id, email FROM profiles
     WHERE verify_token_hash = ? AND verify_expires_at > datetime('now') AND verified_at IS NULL
  `).get(hashToken(token)) as PendingProfile | undefined

  if (!row) return null

  db.prepare(`
    UPDATE profiles
       SET verified_at = datetime('now'), verify_token_hash = NULL, verify_expires_at = NULL,
           updated_at = datetime('now')
     WHERE id = ?
  `).run(row.id)

  return row
}
