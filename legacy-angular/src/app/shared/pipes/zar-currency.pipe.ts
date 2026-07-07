import { Pipe, PipeTransform } from '@angular/core';

/**
 * Formats a number as a South-African Rand (ZAR) currency string.
 *
 * Mirrors the `formatCurrency` helper used on the Purchase Orders page so
 * monetary values read consistently across the app. Uses the built-in `Intl`
 * API (no Angular locale registration required).
 *
 * Usage:
 *   {{ value | zar }}            → "R 1 234,00"  (full)
 *   {{ value | zar:'compact' }}  → "R 1,2k"      (compact, for KPI headers)
 *   {{ null | zar }}             → "—"
 */
@Pipe({
  name: 'zar',
  standalone: true,
})
export class ZarCurrencyPipe implements PipeTransform {
  transform(
    value: number | null | undefined,
    mode: 'full' | 'compact' = 'full',
  ): string {
    if (value === null || value === undefined || Number.isNaN(value)) {
      return '—';
    }

    if (mode === 'compact') {
      return new Intl.NumberFormat('en-ZA', {
        style: 'currency',
        currency: 'ZAR',
        notation: 'compact',
        maximumFractionDigits: 1,
      }).format(value);
    }

    return new Intl.NumberFormat('en-ZA', {
      style: 'currency',
      currency: 'ZAR',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  }
}
