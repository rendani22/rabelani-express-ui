/**
 * Reads the Executive Report design tokens off the live DOM so Chart.js canvases
 * paint in the same ink / brass / hairline palette as the surrounding cards —
 * and stay correct in dark mode without hardcoding a second colour set.
 *
 * Pass any element inside `.exec-report` (the canvas itself works); the CSS
 * custom properties inherit down to it, so `getComputedStyle` resolves the
 * active theme's values.
 */
export interface ExecChartTheme {
  ink: string;
  inkSoft: string;
  muted: string;
  rule: string;
  gold: string;
  goldSoft: string;
  good: string;
  watch: string;
  risk: string;
  serif: string;
  mono: string;
}

const FALLBACK: ExecChartTheme = {
  ink: '#1b1d23',
  inkSoft: '#4b4f58',
  muted: '#8b909b',
  rule: '#e7e4dc',
  gold: '#96762f',
  goldSoft: '#c19a45',
  good: '#3f6b4c',
  watch: '#a96c14',
  risk: '#9b2c3b',
  serif: "'Fraunces', Georgia, serif",
  mono: "'IBM Plex Mono', ui-monospace, monospace",
};

export function readExecChartTheme(el: HTMLElement | null | undefined): ExecChartTheme {
  if (!el || typeof getComputedStyle !== 'function') return FALLBACK;
  const cs = getComputedStyle(el);
  const read = (name: string, fallback: string): string => {
    const v = cs.getPropertyValue(name).trim();
    return v || fallback;
  };
  return {
    ink: read('--ex-ink', FALLBACK.ink),
    inkSoft: read('--ex-ink-soft', FALLBACK.inkSoft),
    muted: read('--ex-muted', FALLBACK.muted),
    rule: read('--ex-rule', FALLBACK.rule),
    gold: read('--ex-gold', FALLBACK.gold),
    goldSoft: read('--ex-gold-soft', FALLBACK.goldSoft),
    good: read('--ex-good', FALLBACK.good),
    watch: read('--ex-watch', FALLBACK.watch),
    risk: read('--ex-risk', FALLBACK.risk),
    serif: FALLBACK.serif,
    mono: FALLBACK.mono,
  };
}

/**
 * Applies an alpha channel to a `#rgb` / `#rrggbb` colour, returning an
 * `rgba(...)` string. Non-hex input (e.g. an `rgb()` token) is returned as-is.
 */
export function withAlpha(color: string, alpha: number): string {
  const hex = color.trim();
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex);
  if (!m) return color;
  let h = m[1];
  if (h.length === 3) h = h.split('').map(c => c + c).join('');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
