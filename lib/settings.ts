import db from './db'
import { isDate } from './dates'

export type Blackout = { start: string; end: string; label: string }

/** Admin-editable settings. For the numeric limits, 0 means no limit. */
export type Settings = {
  site_name: string
  allowed_email_domain: string
  announcement: string
  max_reservation_days: number
  min_notice_days: number
  max_items_per_student: number
  blackouts: Blackout[]
}

const DEFAULTS: Settings = {
  site_name: 'Robert College Prop & Costume Catalog',
  allowed_email_domain: process.env.ALLOWED_EMAIL_DOMAIN || 'robcol.k12.tr',
  announcement: '',
  max_reservation_days: 0,
  min_notice_days: 0,
  max_items_per_student: 0,
  blackouts: [],
}

/** Stored values over the defaults. */
export function getSettings(): Settings {
  const rows = db.prepare('SELECT key, value FROM settings').all() as { key: string; value: string }[]
  const stored: Record<string, unknown> = Object.fromEntries(rows.map(r => [r.key, JSON.parse(r.value)]))
  return Object.fromEntries(
    Object.entries(DEFAULTS).map(([key, fallback]) => [key, stored[key] ?? fallback])
  ) as Settings
}

const text = (v: unknown, max: number) => typeof v === 'string' ? v.trim().slice(0, max) : ''
const limit = (v: unknown) => {
  const n = Number(v)
  return Number.isInteger(n) && n >= 0 && n <= 1000 ? n : null
}

/** Validates the admin form. */
export function parseSettings(input: Record<string, unknown>): { settings: Settings } | { error: string } {
  const site_name = text(input.site_name, 100)
  if (!site_name) return { error: 'Site name is required' }

  const allowed_email_domain = text(input.allowed_email_domain, 100).toLowerCase()
  if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(allowed_email_domain)) {
    return { error: 'Allowed email domain must look like school.k12.tr' }
  }

  const max_reservation_days = limit(input.max_reservation_days)
  const min_notice_days = limit(input.min_notice_days)
  const max_items_per_student = limit(input.max_items_per_student)
  if (max_reservation_days === null || min_notice_days === null || max_items_per_student === null) {
    return { error: 'Limits must be whole numbers from 0 to 1000' }
  }

  if (!Array.isArray(input.blackouts) || input.blackouts.length > 100) {
    return { error: 'Blocked dates must be a list of up to 100 ranges' }
  }
  const blackouts: Blackout[] = []
  for (const b of input.blackouts as Record<string, unknown>[]) {
    if (!isDate(b?.start) || !isDate(b?.end) || b.end < b.start) {
      return { error: 'Each blocked range needs a start and end date, end not before start' }
    }
    blackouts.push({ start: b.start, end: b.end, label: text(b.label, 100) })
  }

  return {
    settings: {
      site_name, allowed_email_domain, announcement: text(input.announcement, 500),
      max_reservation_days, min_notice_days, max_items_per_student, blackouts,
    },
  }
}

export function saveSettings(settings: Settings) {
  const upsert = db.prepare(`
    INSERT INTO settings (key, value) VALUES (?, ?)
    ON CONFLICT (key) DO UPDATE SET value = excluded.value
  `)
  db.transaction(() => {
    for (const [key, value] of Object.entries(settings)) upsert.run(key, JSON.stringify(value))
  })()
}
