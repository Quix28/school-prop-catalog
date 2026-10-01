import db from '@/lib/db'
import { handler, newId, requireAdmin } from '@/lib/auth'
import { INSERT_ITEM_SQL, ITEM_FIELDS, type ItemInput, parseCsv, parseItemInput, uncsvCell } from '@/lib/items'

const MAX_ROWS = 5000

/** Adds every row as a new item, or nothing if any row is invalid. */
export function POST(req: Request) {
  return handler(async () => {
    const admin = await requireAdmin()
    const { csv } = await req.json().catch(() => ({}))
    if (typeof csv !== 'string' || !csv.trim()) {
      return Response.json({ error: 'Choose a CSV file' }, { status: 400 })
    }
    if (csv.length > 2_000_000) return Response.json({ error: 'File is too large' }, { status: 413 })

    const [header = [], ...rows] = parseCsv(csv)
    const columns = header.map(h => h.trim().toLowerCase())
    if (!columns.includes('name')) {
      return Response.json(
        { error: `The first row must name the columns, including "name". Known: ${ITEM_FIELDS.join(', ')}` },
        { status: 400 })
    }
    if (rows.length === 0) return Response.json({ error: 'No rows to import' }, { status: 400 })
    if (rows.length > MAX_ROWS) {
      return Response.json({ error: `At most ${MAX_ROWS} rows at a time` }, { status: 400 })
    }

    const items: ItemInput[] = []
    const errors: string[] = []
    rows.forEach((row, i) => {
      const record = Object.fromEntries(columns.map((c, j) => [c, uncsvCell(row[j] ?? '')]))
      const parsed = parseItemInput(record)
      if ('error' in parsed) errors.push(`Row ${i + 2}: ${parsed.error}`)
      else items.push(parsed.item)
    })
    if (errors.length) {
      return Response.json(
        { error: `Nothing was imported. ${errors.slice(0, 10).join('; ')}${errors.length > 10 ? '; …' : ''}` },
        { status: 400 })
    }

    const insert = db.prepare(INSERT_ITEM_SQL)
    db.transaction(() => {
      for (const item of items) insert.run({ ...item, id: newId(), created_by: admin.id })
    })()
    return Response.json({ imported: items.length }, { status: 201 })
  })
}
