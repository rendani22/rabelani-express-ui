import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { downloadCsv, slugify, toCsv, yyyymmdd } from './csv'

describe('toCsv', () => {
  // Rows are terminated with CRLF per RFC 4180 so Excel reliably breaks records.
  it('emits header only when there are no rows', () => {
    expect(toCsv([], ['a', 'b'])).toBe('a,b\r\n')
  })

  it('emits selected columns in order with a trailing newline', () => {
    const rows = [{ a: 1, b: 2, c: 3 }]
    expect(toCsv(rows, ['a', 'c'])).toBe('a,c\r\n1,3\r\n')
  })

  it('escapes cells containing quotes, commas or newlines and blanks null/undefined', () => {
    const rows = [{ a: 'x,y', b: 'he said "hi"', c: 'line\nbreak', d: null, e: undefined }]
    const csv = toCsv(rows, ['a', 'b', 'c', 'd', 'e'])
    // Record separators are CRLF; the embedded newline inside a quoted cell stays LF.
    expect(csv).toBe('a,b,c,d,e\r\n"x,y","he said ""hi""","line\nbreak",,\r\n')
  })
})

describe('yyyymmdd', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 6, 8, 9, 0, 0))
  })
  afterEach(() => vi.useRealTimers())

  it('pads month and day', () => {
    expect(yyyymmdd(new Date(2026, 0, 5))).toBe('2026-01-05')
  })

  it('defaults to today', () => {
    expect(yyyymmdd()).toBe('2026-07-08')
  })
})

describe('slugify', () => {
  it('lowercases and hyphenates, trimming leading/trailing hyphens', () => {
    expect(slugify('  Hello, World!  ')).toBe('hello-world')
    expect(slugify('Already-Clean')).toBe('already-clean')
  })
})

describe('downloadCsv', () => {
  afterEach(() => vi.restoreAllMocks())

  it('creates an anchor, triggers a download and revokes the object url', () => {
    vi.useFakeTimers()
    const createObjectURL = vi.fn(() => 'blob:mock')
    const revokeObjectURL = vi.fn()
    vi.stubGlobal('URL', { ...URL, createObjectURL, revokeObjectURL })
    const click = vi.fn()
    const anchor = document.createElement('a')
    anchor.click = click
    const createElement = vi.spyOn(document, 'createElement').mockReturnValue(anchor)

    downloadCsv('report.csv', 'a,b\n1,2\n')

    expect(createElement).toHaveBeenCalledWith('a')
    expect(anchor.download).toBe('report.csv')
    expect(anchor.href).toContain('blob:mock')
    expect(click).toHaveBeenCalledOnce()
    expect(anchor.isConnected).toBe(false) // removed from the DOM

    vi.runAllTimers()
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:mock')
    vi.useRealTimers()
  })
})
