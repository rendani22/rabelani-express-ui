import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  BriefingPeriod,
  ExecutiveBriefing,
  ExecutiveBriefingSet,
  HealthLevel,
} from '../../../services/executive-dashboard.service';

/**
 * The report's lede — the narrative "hook" that opens the Executive view. A
 * period selector (Day / Week / Month / Year) switches the whole story: an
 * eyebrow, a large Fraunces statement of that period's revenue and its trend,
 * the supporting notes as ledger footnotes, and the single thing to watch set
 * off as a ruled aside.
 */
@Component({
  selector: 'app-executive-briefing-card',
  standalone: true,
  imports: [CommonModule],
  host: { class: 'col-span-12 block' },
  template: `
    @if (hasStory()) {
      <article class="ex-card p-6 sm:p-8 lg:p-10">
        <div class="flex flex-col gap-6">
          <div class="flex flex-wrap items-center gap-x-4 gap-y-3">
            <span class="ex-eyebrow whitespace-nowrap">The Briefing</span>
            <span class="flex-1 h-px min-w-8" style="background: var(--ex-rule)"></span>
            <div
              class="ex-inset flex items-center gap-0.5 rounded-full p-0.5"
              style="border: 1px solid var(--ex-rule)"
              role="tablist"
              aria-label="Briefing period"
            >
              @for (opt of periods; track opt.key) {
                <button
                  type="button"
                  role="tab"
                  [attr.aria-selected]="selected === opt.key"
                  (click)="select(opt.key)"
                  class="px-3 py-1 rounded-full font-ledger text-[11px] uppercase tracking-wider transition-colors"
                  [class.ex-ink]="selected === opt.key"
                  [class.ex-muted]="selected !== opt.key"
                  [style.background]="selected === opt.key ? 'var(--ex-paper)' : 'transparent'"
                  [style.box-shadow]="selected === opt.key ? '0 1px 2px rgba(0,0,0,0.08)' : 'none'"
                >
                  {{ opt.label }}
                </button>
              }
            </div>
          </div>

          <p class="font-display text-2xl sm:text-3xl lg:text-[2.15rem] font-normal leading-[1.28] ex-ink max-w-4xl">
            {{ briefing.headline }}
          </p>

          @if (briefing.paragraphs.length > 0) {
            <ul class="grid grid-cols-1 md:grid-cols-2 gap-x-10 gap-y-3 max-w-4xl">
              @for (p of briefing.paragraphs; track p; let i = $index) {
                <li class="flex items-baseline gap-3 text-sm ex-ink-soft leading-relaxed">
                  <span class="font-ledger text-[11px] ex-gold flex-shrink-0">
                    {{ (i + 1) | number: '2.0' }}
                  </span>
                  <span>{{ p }}</span>
                </li>
              }
            </ul>
          }

          @if (briefing.watchItem) {
            <div
              class="ex-inset border-l-2 pl-4 pr-3 py-3 flex items-start gap-3"
              [style.border-color]="watchColor()"
            >
              <span class="ex-marker mt-1 flex-shrink-0" [style.background]="watchColor()"></span>
              <p class="text-sm leading-snug ex-ink-soft">
                <span class="ex-eyebrow mr-1.5" [style.color]="watchColor()">
                  {{ isPositive ? 'On track' : 'Watch' }}
                </span>
                {{ briefing.watchItem }}
              </p>
            </div>
          }
        </div>
      </article>
    }
  `,
  styles: [],
})
export class ExecutiveBriefingCardComponent {
  @Input() briefings: ExecutiveBriefingSet | null = null;

  /** Period tabs, in reading order. `today` reads as "Day" in the UI. */
  readonly periods: ReadonlyArray<{ key: BriefingPeriod; label: string }> = [
    { key: 'today', label: 'Day' },
    { key: 'week', label: 'Week' },
    { key: 'month', label: 'Month' },
    { key: 'year', label: 'Year' },
  ];

  /** The active period. Month is the executive default. */
  selected: BriefingPeriod = 'month';

  select(period: BriefingPeriod): void {
    this.selected = period;
  }

  /** The briefing for the active period, falling back to an empty shell. */
  get briefing(): ExecutiveBriefing {
    return this.briefings?.[this.selected] ?? EMPTY_BRIEFING;
  }

  /** True once any period has a headline — otherwise the card stays hidden. */
  hasStory(): boolean {
    return !!this.briefings && Object.values(this.briefings).some(b => b.headline);
  }

  get isPositive(): boolean {
    return this.briefing.watchLevel === 'good' || this.briefing.watchLevel === 'neutral';
  }

  watchColor(): string {
    return WATCH_COLOR[this.briefing.watchLevel];
  }
}

const EMPTY_BRIEFING: ExecutiveBriefing = {
  headline: '',
  paragraphs: [],
  watchItem: null,
  watchLevel: 'neutral',
};

const WATCH_COLOR: Record<HealthLevel, string> = {
  good: 'var(--ex-good)',
  watch: 'var(--ex-watch)',
  risk: 'var(--ex-risk)',
  neutral: 'var(--ex-gold)',
};
