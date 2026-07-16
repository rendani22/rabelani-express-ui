import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  avatarInitials,
  formatDateShort,
  formatDateTime,
  nameFromEmail,
  parseNotes,
  timeAgo,
} from './format'

describe('formatDateShort', () => {
  it('returns an em-dash for null/undefined/empty', () => {
    expect(formatDateShort(null)).toBe('—')
    expect(formatDateShort(undefined)).toBe('—')
    expect(formatDateShort('')).toBe('—')
  })

  it('formats a date in en-ZA short form (day before month)', () => {
    const out = formatDateShort('2026-01-05T10:00:00Z')
    expect(out).toContain('2026')
    expect(out).toContain('Jan')
    // en-ZA reads "05 Jan 2026" — the day leads, unlike en-US's "Jan 5, 2026".
    expect(out.indexOf('05')).toBeLessThan(out.indexOf('Jan'))
  })
})

describe('formatDateTime', () => {
  it('returns an em-dash for missing input', () => {
    expect(formatDateTime(null)).toBe('—')
  })

  it('formats date and time', () => {
    const out = formatDateTime('2026-01-05T10:30:00Z')
    expect(out).toContain('2026')
    expect(out).toMatch(/\d{1,2}:\d{2}/)
  })
})

describe('timeAgo', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-07-08T12:00:00Z'))
  })
  afterEach(() => vi.useRealTimers())

  const ago = (ms: number) => new Date(Date.now() - ms).toISOString()

  it('returns empty string for missing input', () => {
    expect(timeAgo(null)).toBe('')
    expect(timeAgo('')).toBe('')
  })

  it('handles each relative bucket', () => {
    expect(timeAgo(ago(0))).toBe('just now')
    expect(timeAgo(ago(5 * 60_000))).toBe('5m ago')
    expect(timeAgo(ago(3 * 3_600_000))).toBe('3h ago')
    expect(timeAgo(ago(3 * 86_400_000))).toBe('3d ago')
  })

  it('falls back to a short date beyond 30 days', () => {
    const out = timeAgo(ago(40 * 86_400_000))
    expect(out).not.toContain('ago')
    expect(out).toContain('2026')
  })
})

describe('nameFromEmail', () => {
  it('returns empty string when no email', () => {
    expect(nameFromEmail(null)).toBe('')
    expect(nameFromEmail(undefined)).toBe('')
  })

  it('title-cases the local part, splitting on . _ -', () => {
    expect(nameFromEmail('first.last@example.com')).toBe('First Last')
    expect(nameFromEmail('jane_doe-smith@x.co')).toBe('Jane Doe Smith')
  })

  it('handles a value with no @ sign', () => {
    expect(nameFromEmail('mononym')).toBe('Mononym')
  })
})

describe('parseNotes', () => {
  it('returns empty result for missing notes', () => {
    expect(parseNotes(null)).toEqual({ photoUrls: [], text: '' })
  })

  it('extracts labelled delivery photos and strips them from the text', () => {
    const notes = 'Left at door\ndelivery photo: https://cdn.example.com/a.jpg\ndelivery photo: https://cdn.example.com/b.png?x=1'
    const { photoUrls, text } = parseNotes(notes)
    expect(photoUrls).toEqual([
      'https://cdn.example.com/a.jpg',
      'https://cdn.example.com/b.png?x=1',
    ])
    expect(text).toBe('Left at door')
  })

  it('falls back to bare image / delivery-photos urls when unlabelled', () => {
    const notes = 'see https://cdn.example.com/storage/delivery-photos/xyz and https://cdn.example.com/z.webp'
    const { photoUrls, text } = parseNotes(notes)
    expect(photoUrls.length).toBe(2)
    expect(text).toContain('see')
  })

  it('collapses repeated blank lines in the remaining text', () => {
    const { text } = parseNotes('a\n\n\nb')
    expect(text).toBe('a\nb')
  })
})

describe('avatarInitials', () => {
  it('takes first letters of the first two words', () => {
    expect(avatarInitials('John Doe').initials).toBe('JD')
  })

  it('handles a single-word name', () => {
    expect(avatarInitials('Madonna').initials).toBe('M')
  })

  it('falls back to Receiver when the name has no letters', () => {
    expect(avatarInitials('123 456').initials).toBe('R')
    expect(avatarInitials('').initials).toBe('R')
  })

  it('produces a deterministic hue in [0, 360)', () => {
    const a = avatarInitials('John Doe')
    const b = avatarInitials('John Doe')
    expect(a.hue).toBe(b.hue)
    expect(a.hue).toBeGreaterThanOrEqual(0)
    expect(a.hue).toBeLessThan(360)
  })
})
