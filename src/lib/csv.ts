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
 *
 * Rows are terminated with CRLF per RFC 4180 so Excel reliably breaks each
 * record onto its own line instead of folding cells together.
 */
export function toCsv<T extends Record<string, unknown>>(
  rows: readonly T[],
  columns: ReadonlyArray<keyof T & string>,
): string {
  const eol = '\r\n'
  const header = columns.map(escapeCell).join(',')
  const body = rows.map((row) => columns.map((col) => escapeCell(row[col])).join(',')).join(eol)
  return body ? `${header}${eol}${body}${eol}` : `${header}${eol}`
}

/** UTF-8 byte order mark — makes Excel detect the encoding and honour the comma delimiter. */
const UTF8_BOM = '﻿'

/** Trigger a browser download for the given CSV content. */
export function downloadCsv(filename: string, csv: string): void {
  // Prepend a BOM so Excel opens the file as UTF-8 and splits on commas
  // instead of dumping every row into a single column.
  const blob = new Blob([UTF8_BOM, csv], { type: 'text/csv;charset=utf-8;' })
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
