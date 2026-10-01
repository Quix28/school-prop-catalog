// Item validation, shared by the form and CSV import, plus CSV helpers.

export const CONDITIONS = ['excellent', 'good', 'fair', 'poor'] as const

export const ITEM_FIELDS = [
  'name', 'description', 'category', 'subcategory', 'quantity_total', 'condition', 'notes', 'image_url',
] as const

export type ItemInput = {
  name: string
  description: string | null
  category: 'prop' | 'costume'
  subcategory: string | null
  quantity_total: number
  condition: (typeof CONDITIONS)[number] | null
  notes: string | null
  image_url: string | null
}

/** Named parameters: an ItemInput plus id and created_by. */
export const INSERT_ITEM_SQL = `
  INSERT INTO items (id, name, description, category, subcategory, quantity_total,
                     quantity_available, condition, notes, image_url, created_by)
  VALUES (@id, @name, @description, @category, @subcategory, @quantity_total,
          @quantity_total, @condition, @notes, @image_url, @created_by)
`

const text = (v: unknown, max = 2000) =>
  typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null

export function parseItemInput(b: Record<string, unknown>): { item: ItemInput } | { error: string } {
  const name = text(b.name, 200)
  if (!name) return { error: 'Name is required' }

  const category = text(b.category)?.toLowerCase() ?? 'prop'
  if (category !== 'prop' && category !== 'costume') return { error: 'Category must be prop or costume' }

  const q = b.quantity_total
  const quantity_total = q === undefined || q === null || q === '' ? 1 : Number(q)
  if (!Number.isInteger(quantity_total) || quantity_total < 1 || quantity_total > 10_000) {
    return { error: 'Quantity must be a whole number of at least 1' }
  }

  const condition = text(b.condition)?.toLowerCase() ?? null
  if (condition && !(CONDITIONS as readonly string[]).includes(condition)) {
    return { error: 'Condition must be excellent, good, fair or poor' }
  }

  const image_url = text(b.image_url, 500)
  if (image_url && !image_url.startsWith('/api/uploads/')) return { error: 'Photo must be an uploaded image' }

  return {
    item: {
      name, category, quantity_total, image_url,
      condition: condition as ItemInput['condition'],
      description: text(b.description),
      subcategory: text(b.subcategory, 100),
      notes: text(b.notes),
    },
  }
}

/**
 * Parses CSV: quoted fields, "" escapes, line breaks inside quotes. The delimiter is ',' or,
 * as Excel writes it in Turkish locales, ';'.
 */
export function parseCsv(input: string): string[][] {
  const csv = input.replace(/^﻿/, '')
  const firstLine = csv.slice(0, csv.search(/\r?\n|$/))
  const sep = firstLine.includes(';') && !firstLine.includes(',') ? ';' : ','
  const rows: string[][] = []
  let row: string[] = [], field = '', quoted = false

  for (let i = 0; i < csv.length; i++) {
    const c = csv[i]
    if (quoted) {
      if (c !== '"') field += c
      else if (csv[i + 1] === '"') { field += '"'; i++ }
      else quoted = false
    } else if (c === '"') quoted = true
    else if (c === sep) { row.push(field); field = '' }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && csv[i + 1] === '\n') i++
      row.push(field); rows.push(row); row = []; field = ''
    } else field += c
  }
  row.push(field); rows.push(row)
  return rows.filter(r => r.some(f => f.trim()))
}

/** One CSV cell. Formula-like values get a leading ' so spreadsheets don't run them. */
export function csvCell(v: unknown) {
  let s = v == null ? '' : String(v)
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`
  return /[",;\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

/** Undoes csvCell's formula guard on import. */
export const uncsvCell = (s: string) => s.replace(/^'(?=[=+\-@\t\r])/, '')
