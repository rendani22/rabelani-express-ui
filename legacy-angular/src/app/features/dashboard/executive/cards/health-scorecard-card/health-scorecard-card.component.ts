import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HealthLevel, HealthMetric } from '../../../services/executive-dashboard.service';

/**
 * Business health scorecard — the report's index of standing. Five ruled rows
 * spanning money and operations (revenue, pipeline, fulfilment time, revenue at
 * risk, collection rate), each with a state marker, a one-line meaning, a
 * Fraunces headline figure, and its period delta.
 */
@Component({
  selector: 'app-health-scorecard-card',
  standalone: true,
  imports: [CommonModule],
  host: { class: 'col-span-12 block' },
  template: `
    <section class="ex-card overflow-hidden">
      <header class="px-4 sm:px-6 py-4 border-b" style="border-color: var(--ex-rule)">
        <span class="ex-eyebrow">Health Scorecard</span>
      </header>

      <ul>
        @for (m of metrics; track m.key) {
          <li
            class="flex items-center gap-4 px-4 sm:px-6 py-3.5 border-t first:border-t-0"
            style="border-color: var(--ex-rule)"
          >
            <span class="ex-marker flex-shrink-0" [style.background]="color(m.level)"></span>

            <div class="flex flex-col min-w-0 flex-1">
              <span class="text-sm font-medium ex-ink truncate">{{ m.label }}</span>
              <span class="text-xs ex-muted truncate hidden sm:block">{{ m.meaning }}</span>
            </div>

            @if (m.context) {
              <span class="hidden lg:block font-ledger text-[11px] ex-muted text-right whitespace-nowrap">
                {{ m.context }}
              </span>
            }

            <div class="flex items-baseline gap-2 flex-shrink-0 justify-end min-w-[6rem] text-right">
              <span class="font-display text-xl sm:text-2xl leading-none" [style.color]="color(m.level)">
                {{ m.display }}
              </span>
              @if (m.deltaPercent !== null) {
                <span class="ex-delta" [class.ex-delta--up]="m.deltaUp" [class.ex-delta--down]="!m.deltaUp">
                  {{ m.deltaUp ? '▲' : '▼' }}&#8202;{{ absPercent(m.deltaPercent) }}%
                </span>
              }
            </div>
          </li>
        }
      </ul>
    </section>
  `,
  styles: [],
})
export class HealthScorecardCardComponent {
  @Input() metrics: HealthMetric[] = [];

  absPercent(value: number): string {
    return Math.abs(value).toFixed(value % 1 === 0 ? 0 : 1);
  }

  color(level: HealthLevel): string {
    return COLOR[level];
  }
}

const COLOR: Record<HealthLevel, string> = {
  good: 'var(--ex-good)',
  watch: 'var(--ex-watch)',
  risk: 'var(--ex-risk)',
  neutral: 'var(--ex-muted)',
};
