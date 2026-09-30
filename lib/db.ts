import Database from 'better-sqlite3'
import { mkdirSync, readdirSync, rmSync, statSync } from 'node:fs'
import { join } from 'node:path'

// Keep the database off the SD card if you can — point DATA_DIR at a USB SSD.
// SD cards wear out under write load and a Pi's rootfs is the worst place for a DB.
// turbopackIgnore: a cwd-based path makes the build tracer copy the entire project (.env.local,
// .git, this database) into .next/standalone, which the deploy then ships to the Pi.
export const DATA_DIR = process.env.DATA_DIR || join(/* turbopackIgnore: true */ process.cwd(), 'data')
export const UPLOAD_DIR = join(/* turbopackIgnore: true */ DATA_DIR, 'uploads')

mkdirSync(UPLOAD_DIR, { recursive: true })

const db = new Database(join(DATA_DIR, 'catalog.db'))

// WAL lets readers run while a write is in progress — worth it even at school scale.
db.pragma('journal_mode = WAL')
db.pragma('foreign_keys = ON')

db.exec(`
  CREATE TABLE IF NOT EXISTS profiles (
    id            TEXT PRIMARY KEY,
    email         TEXT NOT NULL UNIQUE,
    full_name     TEXT,
    role          TEXT NOT NULL DEFAULT 'student' CHECK (role IN ('student','admin')),
    password_hash TEXT NOT NULL,
    -- Null until the address is proven: the account exists but cannot sign in.
    verified_at        TEXT,
    verify_token_hash  TEXT,
    verify_expires_at  TEXT,
    created_at    TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS items (
    id                 TEXT PRIMARY KEY,
    name               TEXT NOT NULL,
    description        TEXT,
    category           TEXT NOT NULL CHECK (category IN ('prop','costume')),
    subcategory        TEXT,
    quantity_total     INTEGER NOT NULL DEFAULT 1,
    quantity_available INTEGER NOT NULL DEFAULT 1,
    image_url          TEXT,
    additional_images  TEXT,                      -- JSON array, mirrors the old text[] column
    condition          TEXT CHECK (condition IN ('excellent','good','fair','poor')),
    notes              TEXT,
    created_at         TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at         TEXT NOT NULL DEFAULT (datetime('now')),
    created_by         TEXT REFERENCES profiles(id) ON DELETE SET NULL,
    -- Soft delete: a hard delete would cascade away the reservation history of the item.
    deleted_at         TEXT
  );

  CREATE TABLE IF NOT EXISTS reservations (
    id              TEXT PRIMARY KEY,
    item_id         TEXT NOT NULL REFERENCES items(id) ON DELETE CASCADE,
    user_id         TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    quantity        INTEGER NOT NULL DEFAULT 1,
    start_date      TEXT NOT NULL,
    end_date        TEXT NOT NULL,
    status          TEXT NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending','approved','rejected','checked_out','returned','cancelled')),
    purpose         TEXT,
    admin_notes     TEXT,
    requested_at    TEXT NOT NULL DEFAULT (datetime('now')),
    reviewed_at     TEXT,
    reviewed_by     TEXT REFERENCES profiles(id) ON DELETE SET NULL,
    checked_out_at  TEXT,
    returned_at     TEXT
  );

  CREATE TABLE IF NOT EXISTS sessions (
    token      TEXT PRIMARY KEY,
    user_id    TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    expires_at TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_res_user   ON reservations(user_id);
  CREATE INDEX IF NOT EXISTS idx_res_status ON reservations(status);
  CREATE INDEX IF NOT EXISTS idx_items_name ON items(name);
`)

// --- migrations for databases created before a column existed ---
// SQLite has no ADD COLUMN IF NOT EXISTS, so check the table shape first. IMMEDIATE takes the
// write lock before that check: `next build` loads this module in several processes at once,
// and two of them both adding the column would crash the second.
db.transaction(() => {
  for (const [table, col] of [
    ['profiles', 'verified_at'],
    ['profiles', 'verify_token_hash'],
    ['profiles', 'verify_expires_at'],
    ['items', 'deleted_at'],
  ] as const) {
    const columns = (db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[])
    if (!columns.some(c => c.name === col)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${col} TEXT`)
  }
}).immediate()

// Accounts that predate verification are grandfathered in, otherwise the existing admin
// would be locked out by an upgrade. Only rows with no pending token qualify.
db.exec(`
  UPDATE profiles SET verified_at = created_at
   WHERE verified_at IS NULL AND verify_token_hash IS NULL
`)

// Expired sessions are dead weight; clearing them at startup is enough at this scale.
db.prepare(`DELETE FROM sessions WHERE expires_at < datetime('now')`).run()

// Unclaimed signups must not squat an address forever — otherwise registering
// someone else's email would permanently block the real owner from ever signing up.
db.prepare(`
  DELETE FROM profiles
   WHERE verified_at IS NULL AND verify_expires_at IS NOT NULL
     AND verify_expires_at < datetime('now','-7 days')
`).run()

// A photo uploaded from an Add Item form that was then abandoned is referenced by nothing.
// Sweep those when the real server starts; the age check leaves alone any form that might
// still be open. Not during `next build` or in dev, which run this module against your local
// data folder, where deleting files would be a surprise.
if (process.env.NODE_ENV === 'production' && process.env.NEXT_PHASE !== 'phase-production-build') {
  const refs = (db.prepare('SELECT image_url, additional_images FROM items').all() as
    { image_url: string | null; additional_images: string | null }[])
    .map(r => `${r.image_url} ${r.additional_images}`).join(' ')
  const cutoff = Date.now() - 86_400_000
  for (const name of readdirSync(UPLOAD_DIR)) {
    const path = join(UPLOAD_DIR, name)
    const info = statSync(path)
    if (info.isFile() && info.mtimeMs < cutoff && !refs.includes(name)) rmSync(path, { force: true })
  }
}

/** Today in the server's timezone, as the YYYY-MM-DD string reservations are stored in. */
export const today = () =>
  new Date(Date.now() - new Date().getTimezoneOffset() * 60_000).toISOString().slice(0, 10)

/** A Date in SQLite's datetime('now') format, so text comparisons against it are correct. */
export const sqlTime = (d: Date) => d.toISOString().slice(0, 19).replace('T', ' ')

/**
 * SQL condition: reservation `r` holds units at some point in [@start, @end] (inclusive dates).
 * A checked-out item past its end date is overdue but still physically out, so it keeps
 * holding through today until an admin marks it returned.
 */
export const HOLDS_DURING = `
  r.status IN ('pending','approved','checked_out')
  AND r.start_date <= @end
  AND (CASE WHEN r.status = 'checked_out' THEN max(r.end_date, @today) ELSE r.end_date END) >= @start
`

export default db
