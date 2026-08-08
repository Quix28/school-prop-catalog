import Database from 'better-sqlite3'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'

// Keep the database off the SD card if you can — point DATA_DIR at a USB SSD.
// SD cards wear out under write load and a Pi's rootfs is the worst place for a DB.
export const DATA_DIR = process.env.DATA_DIR || join(process.cwd(), 'data')
export const UPLOAD_DIR = join(DATA_DIR, 'uploads')

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
    created_by         TEXT REFERENCES profiles(id) ON DELETE SET NULL
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

// Expired sessions are dead weight; clearing them at startup is enough at this scale.
db.prepare(`DELETE FROM sessions WHERE expires_at < datetime('now')`).run()

export default db
