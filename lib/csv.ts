/**
 * CSV helpers. Output is Excel-friendly (UTF-8 BOM, CRLF) and defuses spreadsheet formula injection:
 * any text cell that starts with = + - @ (or tab / CR) is prefixed with an apostrophe.
 */
const FORMULA_START = /^[=+\-@\t\r]/

export function csvCell(value: unknown): string {
  if (value === null || value === undefined) return ''
  let text = value instanceof Date ? value.toISOString() : String(value)
  // Numbers are kept as-is so negative amounts stay numeric; only strings are neutralized.
  if (typeof value === 'string' && FORMULA_START.test(text)) text = `'${text}`
  return /[",\r\n;]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

export function toCsv(headers: string[], rows: unknown[][]): string {
  const lines = [headers, ...rows].map((row) => row.map(csvCell).join(','))
  return '\uFEFF' + lines.join('\r\n') + '\r\n'
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

/** Validates a YYYY-MM-DD calendar date (rejects 2026-02-31). */
export function isIsoDate(value: unknown): value is string {
  if (typeof value !== 'string' || !ISO_DATE.test(value)) return false
  const [y, m, d] = value.split('-').map(Number)
  const t = new Date(Date.UTC(y, m - 1, d))
  return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d
}

/** Resolves a from/to range, defaulting to the month containing `today` and capping at `maxDays`. */
export function resolveRange(
  from: unknown,
  to: unknown,
  today: string,
  maxDays = 366,
): { from: string; to: string } {
  const monthStart = `${today.slice(0, 7)}-01`
  let start = isIsoDate(from) ? from : monthStart
  let end = isIsoDate(to) ? to : today
  if (start > end) [start, end] = [end, start]
  const days = (Date.parse(end) - Date.parse(start)) / 86_400_000
  if (days > maxDays) {
    const capped = new Date(Date.parse(end) - maxDays * 86_400_000)
    start = capped.toISOString().slice(0, 10)
  }
  return { from: start, to: end }
}
