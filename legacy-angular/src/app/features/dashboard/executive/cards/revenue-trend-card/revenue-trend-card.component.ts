import {
  AfterViewInit,
  Component,
  ElementRef,
  Input,
  OnChanges,
  OnDestroy,
  SimpleChanges,
  ViewChild,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { Chart, registerables, TooltipItem } from 'chart.js';
import { ZarCurrencyPipe } from '../../../../../shared/pipes/zar-currency.pipe';
import { RevenueTrendPoint, RevenueTrends } from '../../../services/executive-dashboard.service';
import { readExecChartTheme, withAlpha } from '../chart-theme';

Chart.register(...registerables);

type Granularity = keyof RevenueTrends;

/**
 * Revenue over time — a filled area of completed-order value (brass) with the
 * order count traced as a hairline on a secondary axis, plus a Day / Week /
 * Month / Year granularity toggle. Styled to the report palette and typeface.
 */
@Component({
  selector: 'app-revenue-trend-card',
  standalone: true,
  imports: [CommonModule, ZarCurrencyPipe],
  host: { class: 'col-span-12 lg:col-span-8 block' },
  template: `
    <section class="ex-card h-full flex flex-col">
      <header class="px-4 sm:px-6 py-4 border-b flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3" style="border-color: var(--ex-rule)">
        <div class="flex flex-col gap-1">
          <span class="ex-eyebrow">{{ title }}</span>
          <span class="font-ledger text-xs ex-muted">
            {{ activeTotalValue | zar }} · {{ activeTotalOrders }} orders shown
          </span>
        </div>
        <div class="flex items-center gap-4 self-start">
          @for (g of granularities; track g.key) {
            <button
              type="button"
              (click)="setGranularity(g.key)"
              class="ex-eyebrow pb-1 border-b-2 transition-colors"
              [style.border-color]="granularity === g.key ? 'var(--ex-gold)' : 'transparent'"
              [style.color]="granularity === g.key ? 'var(--ex-ink)' : 'var(--ex-muted)'"
            >
              {{ g.label }}
            </button>
          }
        </div>
      </header>

      <div class="px-3 sm:px-5 py-4 flex-1 flex flex-col justify-center">
        <div [style.height.px]="chartHeight">
          @if (activePoints.length > 0 && activeTotalValue > 0) {
            <canvas #chartCanvas></canvas>
          } @else {
            <div class="flex items-center justify-center h-full ex-muted text-sm">
              No completed-order value in this period
            </div>
          }
        </div>
      </div>
    </section>
  `,
  styles: [],
})
export class RevenueTrendCardComponent implements AfterViewInit, OnChanges, OnDestroy {
  @Input() title = 'Revenue Over Time';
  @Input() chartHeight = 280;
  @Input() trends: RevenueTrends = { day: [], week: [], month: [], year: [] };

  @ViewChild('chartCanvas') chartCanvas?: ElementRef<HTMLCanvasElement>;

  granularity: Granularity = 'month';
  readonly granularities: Array<{ key: Granularity; label: string }> = [
    { key: 'day', label: 'Day' },
    { key: 'week', label: 'Week' },
    { key: 'month', label: 'Month' },
    { key: 'year', label: 'Year' },
  ];

  private chart: Chart | null = null;

  get activePoints(): RevenueTrendPoint[] {
    return this.trends[this.granularity] ?? [];
  }

  get activeTotalValue(): number {
    return this.activePoints.reduce((s, p) => s + p.value, 0);
  }

  get activeTotalOrders(): number {
    return this.activePoints.reduce((s, p) => s + p.orders, 0);
  }

  ngAfterViewInit(): void {
    this.renderChart();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['trends'] && !changes['trends'].firstChange) {
      this.renderChart();
    }
  }

  ngOnDestroy(): void {
    this.chart?.destroy();
  }

  setGranularity(g: Granularity): void {
    if (this.granularity === g) return;
    this.granularity = g;
    this.renderChart();
  }

  private renderChart(): void {
    if (this.chart) {
      this.chart.destroy();
      this.chart = null;
    }
    setTimeout(() => this.initChart(), 0);
  }

  private initChart(): void {
    const points = this.activePoints;
    if (!this.chartCanvas?.nativeElement || points.length === 0 || this.activeTotalValue <= 0) return;

    const canvas = this.chartCanvas.nativeElement;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const theme = readExecChartTheme(canvas);

    const fill = ctx.createLinearGradient(0, 0, 0, this.chartHeight);
    fill.addColorStop(0, withAlpha(theme.gold, 0.28));
    fill.addColorStop(1, withAlpha(theme.gold, 0.01));

    this.chart = new Chart(ctx, {
      data: {
        labels: points.map(p => p.label),
        datasets: [
          {
            type: 'line',
            label: 'Value',
            data: points.map(p => Math.round(p.value)),
            borderColor: theme.gold,
            backgroundColor: fill,
            borderWidth: 2,
            fill: true,
            tension: 0.35,
            pointRadius: 0,
            pointHoverRadius: 4,
            pointHoverBackgroundColor: theme.gold,
            pointHoverBorderColor: theme.gold,
            yAxisID: 'y',
            order: 2,
          },
          {
            type: 'line',
            label: 'Orders',
            data: points.map(p => p.orders),
            borderColor: withAlpha(theme.inkSoft, 0.55),
            borderWidth: 1,
            borderDash: [3, 3],
            tension: 0.35,
            pointRadius: 0,
            pointHoverRadius: 3,
            yAxisID: 'yOrders',
            order: 1,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: {
            display: true,
            position: 'top',
            align: 'end',
            labels: {
              boxWidth: 8,
              boxHeight: 8,
              usePointStyle: true,
              color: theme.muted,
              font: { size: 10, family: theme.mono },
            },
          },
          tooltip: {
            backgroundColor: theme.ink,
            titleColor: '#fff',
            bodyColor: '#fff',
            borderColor: withAlpha(theme.gold, 0.5),
            borderWidth: 1,
            padding: 10,
            titleFont: { family: theme.mono, size: 11 },
            bodyFont: { family: theme.mono, size: 11 },
            callbacks: {
              label: (item: TooltipItem<'line'>) => {
                if (item.dataset.label === 'Value') {
                  return `Value  ${this.formatZar(Number(item.parsed.y))}`;
                }
                return `Orders  ${item.parsed.y}`;
              },
            },
          },
        },
        scales: {
          x: {
            grid: { display: false },
            border: { color: theme.rule },
            ticks: {
              color: theme.muted,
              maxRotation: 0,
              autoSkip: true,
              maxTicksLimit: 12,
              font: { size: 10, family: theme.mono },
            },
          },
          y: {
            beginAtZero: true,
            position: 'left',
            border: { display: false },
            grid: { color: withAlpha(theme.rule, 0.7) },
            ticks: {
              color: theme.muted,
              font: { size: 10, family: theme.mono },
              callback: value => this.formatZarCompact(Number(value)),
            },
          },
          yOrders: {
            beginAtZero: true,
            position: 'right',
            border: { display: false },
            grid: { drawOnChartArea: false },
            ticks: {
              color: theme.muted,
              precision: 0,
              font: { size: 10, family: theme.mono },
              callback: value => (Number.isInteger(value) ? value : ''),
            },
          },
        },
      },
    });
  }

  private formatZar(value: number): string {
    return new Intl.NumberFormat('en-ZA', {
      style: 'currency',
      currency: 'ZAR',
      maximumFractionDigits: 0,
    }).format(value);
  }

  private formatZarCompact(value: number): string {
    return new Intl.NumberFormat('en-ZA', {
      style: 'currency',
      currency: 'ZAR',
      notation: 'compact',
      maximumFractionDigits: 1,
    }).format(value);
  }
}
