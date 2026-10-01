// Date-only strings (YYYY-MM-DD), shared by server and browser.

const DAY = 86_400_000

/** A real YYYY-MM-DD date (Date.parse accepts 2026-02-31). */
export const isDate = (s: unknown): s is string =>
  typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s)
  && !isNaN(Date.parse(s)) && new Date(s).toISOString().startsWith(s)

export const addDays = (date: string, n: number) =>
  new Date(Date.parse(date) + n * DAY).toISOString().slice(0, 10)

/** Days from start to end, counting both. */
export const dayCount = (start: string, end: string) =>
  Math.round((Date.parse(end) - Date.parse(start)) / DAY) + 1

export const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`
