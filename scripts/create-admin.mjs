#!/usr/bin/env node
// Creates or promotes an admin:
//   node --env-file=.env.local scripts/create-admin.mjs
// Without --env-file, DATA_DIR is ignored. The password is prompted, never an argument.

import { createInterface } from 'node:readline/promises'
import { randomUUID, scrypt as _scrypt, randomBytes } from 'node:crypto'
import { promisify } from 'node:util'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import Database from 'better-sqlite3'

const scrypt = promisify(_scrypt)

const DATA_DIR = process.env.DATA_DIR || join(process.cwd(), 'data')
mkdirSync(DATA_DIR, { recursive: true })
const db = new Database(join(DATA_DIR, 'catalog.db'))
db.pragma('journal_mode = WAL')

// Same schema as the app, so this works before the server has run.
db.exec(`
  CREATE TABLE IF NOT EXISTS profiles (
    id            TEXT PRIMARY KEY,
    email         TEXT NOT NULL UNIQUE,
    full_name     TEXT,
    role          TEXT NOT NULL DEFAULT 'student' CHECK (role IN ('student','admin')),
    password_hash TEXT NOT NULL,
    verified_at        TEXT,
    verify_token_hash  TEXT,
    verify_expires_at  TEXT,
    created_at    TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
  );
`)

/**
 * Prompts on a TTY, otherwise reads piped lines:
 *   printf 'a@b.tr\nName\npw\npw\n' | node scripts/create-admin.mjs
 */
let ask
if (process.stdin.isTTY) {
  const rl = createInterface({ input: process.stdin, output: process.stdout })
  ask = async (q) => (await rl.question(q)).trim()
  process.on('exit', () => rl.close())
} else {
  const chunks = []
  for await (const c of process.stdin) chunks.push(c)
  const lines = Buffer.concat(chunks).toString().split('\n')
  ask = async (q) => { process.stdout.write(q); return (lines.shift() ?? '').trim() }
}

const email = (await ask('Admin email: ')).toLowerCase()
if (!/^[a-z0-9._%+-]+@[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(email)) { console.error('\nThat does not look like an email address.'); process.exit(1) }

const fullName = await ask('\nFull name (optional): ')
const password = await ask('\nPassword (min 6 chars): ')
if (password.length < 6) { console.error('\nPassword must be at least 6 characters.'); process.exit(1) }
const again = await ask('\nConfirm password: ')
if (password !== again) { console.error('\nPasswords do not match.'); process.exit(1) }

const salt = randomBytes(16)
const key = await scrypt(password, salt, 64)
const hash = `${salt.toString('hex')}:${key.toString('hex')}`

const existing = db.prepare('SELECT id FROM profiles WHERE email = ?').get(email)
if (existing) {
  // Shell access is proof enough: mark verified.
  db.prepare(`UPDATE profiles SET role = 'admin', password_hash = ?, verified_at = COALESCE(verified_at, datetime('now')), verify_token_hash = NULL, updated_at = datetime('now') WHERE id = ?`)
    .run(hash, existing.id)
  console.log(`\nExisting account ${email} promoted to admin and password reset.`)
} else {
  db.prepare(`INSERT INTO profiles (id, email, full_name, role, password_hash, verified_at) VALUES (?, ?, ?, 'admin', ?, datetime('now'))`)
    .run(randomUUID(), email, fullName || null, hash)
  console.log(`\nAdmin account created: ${email}`)
}

console.log('Sign in at /admin-login')
