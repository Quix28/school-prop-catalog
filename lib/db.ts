import Database from 'better-sqlite3'
import { mkdirSync, readdirSync, rmSync, statSync } from 'node:fs'
import { join } from 'node:path'

// Set DATA_DIR to an absolute path in production: the standalone server runs from
// .next/standalone, which every build replaces.
// turbopackIgnore stops the build tracer copying the whole project into the standalone output.
export const DATA_DIR = process.env.DATA_DIR || join(/* turbopackIgnore: true */ process.cwd(), 'data')
export const UPLOAD_DIR = join(/* turbopackIgnore: true */ DATA_DIR, 'uploads')

// next build loads this module in several workers at once, and setting up a new database file
// from parallel processes can fail with SQLITE_BUSY. The build only needs the schema, so it
// gets an in-memory database and never touches DATA_DIR.
const building = process.env.NEXT_PHASE === 'phase-production-build'
if (!building) mkdirSync(UPLOAD_DIR, { recursive: true })

const db = new Database(building ? ':memory:' : join(DATA_DIR, 'catalog.db'))

// WAL: reads don't wait for writes.
db.pragma('journal_mode = WAL')
db.pragma('foreign_keys = ON')

db.exec(`
  CREATE TABLE IF NOT EXISTS profiles (
    id            TEXT PRIMARY KEY,
    email         TEXT NOT NULL UNIQUE,
    full_name     TEXT,
    role          TEXT NOT NULL DEFAULT 'student' CHECK (role IN ('student','admin')),
    password_hash TEXT NOT NULL,
    -- Null until the email is confirmed; unconfirmed accounts can't sign in.
    verified_at        TEXT,
    verify_token_hash  TEXT,
    verify_expires_at  TEXT,
    -- Pending password reset.
    reset_token_hash   TEXT,
    reset_expires_at   TEXT,
    -- Deactivated accounts can't sign in.
    disabled_at        TEXT,
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
    -- Soft delete keeps reservation history.
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

  -- Admin-editable settings, JSON-encoded values.
  CREATE TABLE IF NOT EXISTS settings (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
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

// Add columns missing from older databases. IMMEDIATE takes the write lock up front.
db.transaction(() => {
  for (const [table, col] of [
    ['profiles', 'verified_at'],
    ['profiles', 'verify_token_hash'],
    ['profiles', 'verify_expires_at'],
    ['profiles', 'reset_token_hash'],
    ['profiles', 'reset_expires_at'],
    ['profiles', 'disabled_at'],
    ['items', 'deleted_at'],
  ] as const) {
    const columns = (db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[])
    if (!columns.some(c => c.name === col)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${col} TEXT`)
  }
}).immediate()

// Accounts from before email confirmation existed count as confirmed.
db.exec(`
  UPDATE profiles SET verified_at = created_at
   WHERE verified_at IS NULL AND verify_token_hash IS NULL
`)

db.prepare(`DELETE FROM sessions WHERE expires_at < datetime('now')`).run()

// Drop sign-ups never confirmed, so nobody can squat an address.
db.prepare(`
  DELETE FROM profiles
   WHERE verified_at IS NULL AND verify_expires_at IS NOT NULL
     AND verify_expires_at < datetime('now','-7 days')
`).run()

// Delete day-old uploads no item uses (abandoned Add Item forms). Production server only,
// never during build or dev.
if (process.env.NODE_ENV === 'production' && !building) {
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

/** Today in server time, as YYYY-MM-DD. */
export const today = () =>
  new Date(Date.now() - new Date().getTimezoneOffset() * 60_000).toISOString().slice(0, 10)

/** A Date in SQLite datetime('now') format, so text comparisons work. */
export const sqlTime = (d: Date) => d.toISOString().slice(0, 19).replace('T', ' ')

/**
 * SQL: reservation `r` holds units during [start, end], given as SQL expressions (needs @today).
 * Overdue checkouts hold through today.
 */
export const holdsDuring = (start = '@start', end = '@end') => `
  r.status IN ('pending','approved','checked_out')
  AND r.start_date <= ${end}
  AND (CASE WHEN r.status = 'checked_out' THEN max(r.end_date, @today) ELSE r.end_date END) >= ${start}
`

export default db
