import {
  AfterViewInit,
  Component,
  ElementRef,
  Input,
  OnChanges,
  OnDestroy,
  QueryList,
  SimpleChanges,
  ViewChildren,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { Chart, registerables } from 'chart.js';
import { ZarCurrencyPipe } from '../../../../../shared/pipes/zar-currency.pipe';
import { RevenueKpi, RevenueTrends } from '../../../services/executive-dashboard.service';
import { readExecChartTheme, withAlpha } from '../chart-theme';

Chart.register(...registerables);

/**
 * Key figures — completed-order value across Today / Week / Month / Year /
 * All-time, laid out as a ruled ledger strip. Each column carries a Fraunces
 * headline figure, the order count and average in ledger mono, the
 * period-over-period delta, and a Chart.js sparkline of the underlying series
 * tinted by its direction.
 */
@Component({
  selector: 'app-revenue-kpi-card',
  standalone: true,
  imports: [CommonModule, ZarCurrencyPipe],
  host: { class: 'col-span-12 block' },
  template: `
    <section class="ex-card overflow-hidden">
      <header class="px-4 sm:px-6 py-4 flex items-end justify-between gap-3 border-b" style="border-color: var(--ex-rule)">
        <div class="flex flex-col gap-1">
          <span class="ex-eyebrow">Key Figures</span>
          <h2 class="font-display text-lg ex-ink leading-none">Realized Revenue</h2>
        </div>
        <span class="hidden sm:block font-ledger text-[11px] ex-muted">completed-order value</span>
      </header>

      <div class="grid grid-cols-2 lg:grid-cols-5">
        @for (kpi of kpis; track kpi.key; let idx = $index) {
          <div
            class="px-4 sm:px-5 py-4 flex flex-col gap-2.5 border-t lg:border-t-0 lg:border-l lg:first:border-l-0"
            style="border-color: var(--ex-rule)"
            [class.border-l]="idx % 2 === 1"
          >
            <div class="flex items-center justify-between gap-2">
              <span class="ex-eyebrow">{{ kpi.label }}</span>
              @if (kpi.deltaPercent !== null) {
                <span class="ex-delta tabular-nums" [class.ex-delta--up]="kpi.deltaUp" [class.ex-delta--down]="!kpi.deltaUp">
                  {{ kpi.deltaUp ? '▲' : '▼' }}&#8202;{{ absPercent(kpi.deltaPercent) }}%
                </span>
              }
            </div>

            <span class="font-display text-2xl sm:text-[1.7rem] leading-none ex-ink tabular-nums">
              {{ kpi.value | zar: 'compact' }}
            </span>

            <div class="h-9 -mx-1">
              <canvas [attr.data-key]="kpi.key" #spark></canvas>
            </div>

            <div class="flex items-center justify-between font-ledger text-[11px] ex-muted">
              <span><span class="tabular-nums">{{ kpi.orders }}</span> {{ kpi.orders === 1 ? 'order' : 'orders' }}</span>
              <span>avg <span class="tabular-nums">{{ kpi.avgOrderValue | zar: 'compact' }}</span></span>
            </div>
          </div>
        }
      </div>
    </section>
  `,
  styles: [],
})
export class RevenueKpiCardComponent implements AfterViewInit, OnChanges, OnDestroy {
  @Input() kpis: RevenueKpi[] = [];
  @Input() trends: RevenueTrends = { day: [], week: [], month: [], year: [] };

  @ViewChildren('spark') sparks?: QueryList<ElementRef<HTMLCanvasElement>>;

  private charts: Chart[] = [];
  private viewReady = false;

  ngAfterViewInit(): void {
    this.viewReady = true;
    this.sparks?.changes.subscribe(() => this.renderSparks());
    this.renderSparks();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (this.viewReady && (changes['kpis'] || changes['trends'])) {
      // Let the @for re-render before we reach for the canvases.
      setTimeout(() => this.renderSparks(), 0);
    }
  }

  ngOnDestroy(): void {
    this.destroyCharts();
  }

  absPercent(value: number): string {
    return Math.abs(value).toFixed(value % 1 === 0 ? 0 : 1);
  }

  private destroyCharts(): void {
    this.charts.forEach(c => c.destroy());
    this.charts = [];
  }

  private renderSparks(): void {
    if (!this.sparks) return;
    this.destroyCharts();
    const theme = readExecChartTheme(this.sparks.first?.nativeElement);

    this.sparks.forEach(ref => {
      const canvas = ref.nativeElement;
      const key = canvas.getAttribute('data-key') as RevenueKpi['key'] | null;
      if (!key) return;
      const kpi = this.kpis.find(k => k.key === key);
      const series = this.seriesFor(key);
      if (!kpi || series.length < 2) return;

      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const line = kpi.deltaPercent === null ? theme.gold : kpi.deltaUp ? theme.good : theme.risk;

      this.charts.push(
        new Chart(ctx, {
          type: 'line',
          data: {
            labels: series.map((_, i) => i),
            datasets: [
              {
                data: series,
                borderColor: line,
                backgroundColor: withAlpha(line, 0.1),
                borderWidth: 1.5,
                fill: true,
                tension: 0.4,
                pointRadius: 0,
                pointHoverRadius: 0,
              },
            ],
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            animation: false,
            plugins: { legend: { display: false }, tooltip: { enabled: false } },
            scales: { x: { display: false }, y: { display: false, beginAtZero: true } },
            elements: { line: { capBezierPoints: true } },
          },
        }),
      );
    });
  }

  /** Maps each KPI period onto the underlying value series for its sparkline. */
  private seriesFor(key: RevenueKpi['key']): number[] {
    const pick = (arr: { value: number }[]) => arr.slice(-12).map(p => p.value);
    switch (key) {
      case 'today':
        return pick(this.trends.day);
      case 'week':
        return pick(this.trends.week);
      case 'month':
        return pick(this.trends.month);
      case 'year':
      case 'all':
        return pick(this.trends.year);
    }
  }
}
