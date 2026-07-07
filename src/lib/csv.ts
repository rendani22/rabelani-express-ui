/**
 * Minimal CSV helpers — no external dependencies.
 * Ported 1:1 from the Angular `inventory/utils/csv.util.ts`.
 */

/** Escape a single CSV cell per RFC 4180. */
function escapeCell(value: unknown): string {
  if (value === null || value === undefined) return ''
  const str = String(value)
  if (/[",\n\r]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`
  }
  return str
}

/**
 * Build a CSV string from an array of row objects.
 * The `columns` array controls both header order and which keys are emitted.
 */
export function toCsv<T extends Record<string, unknown>>(
  rows: readonly T[],
  columns: ReadonlyArray<keyof T & string>,
): string {
  const header = columns.map(escapeCell).join(',')
  const body = rows.map((row) => columns.map((col) => escapeCell(row[col])).join(',')).join('\n')
  return body ? `${header}\n${body}\n` : `${header}\n`
}

/** Trigger a browser download for the given CSV content. */
export function downloadCsv(filename: string, csv: string): void {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.style.display = 'none'
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  // Release the object URL on next tick so the download kicks off reliably.
  setTimeout(() => URL.revokeObjectURL(url), 0)
}

/** Safe yyyy-MM-dd stamp for filenames. */
export function yyyymmdd(d: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/** Slugify a value for use in a filename. */
export function slugify(value: string): string {
  return value
    .replace(/[^a-z0-9-]+/gi, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase()
}
