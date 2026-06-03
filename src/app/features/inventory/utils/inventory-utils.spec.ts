import { describe, it, expect } from 'vitest';
import { toCsv, yyyymmdd } from './csv.util';
import {
  getSourceLabel,
  getSourceBadgeClass,
  getDeltaClass,
  getDeltaIconName,
  formatDelta,
  formatDateTime,
} from './movement-format.util';

// ============================================================================
// csv.util
// ============================================================================

describe('toCsv', () => {
  it('should produce a header-only CSV for an empty row array', () => {
    const result = toCsv([], ['name', 'qty']);
    expect(result).toBe('name,qty\n');
  });

  it('should produce correct CSV with data rows', () => {
    const rows = [
      { name: 'Box', qty: 10 },
      { name: 'Tape', qty: 5 },
    ];
    const result = toCsv(rows, ['name', 'qty']);
    expect(result).toBe('name,qty\nBox,10\nTape,5\n');
  });

  it('should escape cells that contain commas', () => {
    const rows = [{ name: 'Box, Large', qty: 1 }];
    const result = toCsv(rows, ['name', 'qty']);
    expect(result).toContain('"Box, Large"');
  });

  it('should escape cells that contain double quotes', () => {
    const rows = [{ name: 'He said "Hello"', qty: 1 }];
    const result = toCsv(rows, ['name', 'qty']);
    expect(result).toContain('"He said ""Hello"""');
  });

  it('should handle null and undefined values as empty strings', () => {
    const rows = [{ name: null as unknown as string, qty: undefined as unknown as number }];
    const result = toCsv(rows, ['name', 'qty']);
    expect(result).toBe('name,qty\n,\n');
  });

  it('should only emit columns specified in the columns array', () => {
    const rows = [{ name: 'Box', qty: 10, hidden: 'secret' }];
    const result = toCsv(rows, ['name', 'qty']);
    expect(result).not.toContain('secret');
    expect(result).not.toContain('hidden');
  });
});

describe('yyyymmdd', () => {
  it('should return yyyy-MM-dd format for a given date', () => {
    const d = new Date('2026-03-07T10:00:00Z');
    const result = yyyymmdd(d);
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(result).toBe('2026-03-07');
  });

  it('should pad month and day with leading zeros', () => {
    const d = new Date('2026-01-05T00:00:00Z');
    expect(yyyymmdd(d)).toBe('2026-01-05');
  });
});

// ============================================================================
// movement-format.util
// ============================================================================

describe('getSourceLabel', () => {
  it('should return human-readable label for each source', () => {
    expect(getSourceLabel('initial')).toBe('Initial Stock');
    expect(getSourceLabel('manual_edit')).toBe('Manual Edit');
    expect(getSourceLabel('package_deduct')).toBe('Package');
    expect(getSourceLabel('restock')).toBe('Restock');
  });

  it('should return the raw value for unknown sources', () => {
    expect(getSourceLabel('unknown' as any)).toBe('unknown');
  });
});

describe('getSourceBadgeClass', () => {
  it('should return a badge class string for each source', () => {
    expect(getSourceBadgeClass('initial')).toContain('gray');
    expect(getSourceBadgeClass('manual_edit')).toContain('amber');
    expect(getSourceBadgeClass('package_deduct')).toContain('violet');
    expect(getSourceBadgeClass('restock')).toContain('emerald');
  });

  it('should fall back to gray for unknown sources', () => {
    expect(getSourceBadgeClass('unknown' as any)).toContain('gray');
  });
});

describe('getDeltaClass', () => {
  it('should return emerald for positive delta', () => {
    expect(getDeltaClass(5)).toContain('emerald');
  });

  it('should return rose for negative delta', () => {
    expect(getDeltaClass(-3)).toContain('rose');
  });

  it('should return gray for zero delta', () => {
    expect(getDeltaClass(0)).toContain('gray');
  });
});

describe('getDeltaIconName', () => {
  it('should return trending-up icon for positive delta', () => {
    expect(getDeltaIconName(10)).toBe('tablerTrendingUp');
  });

  it('should return trending-down icon for negative delta', () => {
    expect(getDeltaIconName(-1)).toBe('tablerTrendingDown');
  });

  it('should return minus icon for zero delta', () => {
    expect(getDeltaIconName(0)).toBe('tablerMinus');
  });
});

describe('formatDelta', () => {
  it('should prefix positive deltas with a plus sign', () => {
    expect(formatDelta(7)).toBe('+7');
  });

  it('should leave negative deltas unchanged', () => {
    expect(formatDelta(-4)).toBe('-4');
  });

  it('should return "0" for zero delta', () => {
    expect(formatDelta(0)).toBe('0');
  });
});

describe('formatDateTime', () => {
  it('should return a non-empty formatted string for a valid ISO date', () => {
    const result = formatDateTime('2026-01-15T14:30:00Z');
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
    expect(result).toContain('2026');
  });
});
