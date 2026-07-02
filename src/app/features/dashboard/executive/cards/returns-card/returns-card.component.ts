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
import { HealthLevel, ReturnsReport } from '../../../services/executive-dashboard.service';
import { readExecChartTheme, withAlpha } from '../chart-theme';

Chart.register(...registerables);

/**
 * Returns — the overall return rate, its month-over-month trend (rising is the
 * alarm), and the locations returning worst. Root cause is deliberately absent:
 * reasons live in free-text notes, so this card answers where and how often,
 * never why. A visible caveat says so.
 */
@Component({
  selector: 'app-returns-card',
  standalone: true,
  imports: [CommonModule],
  host: { class: 'col-span-12 lg:col-span-8 block' },
  template: `
    <section class="ex-card h-full flex flex-col">
      <header class="px-4 sm:px-6 py-4 border-b flex items-end justify-between gap-4" style="border-color: var(--ex-rule)">
        <div class="flex flex-col gap-1">
          <span class="ex-eyebrow">{{ title }}</span>
          <span class="font-ledger text-xs ex-muted">
            {{ returns.returnedTotal }} of {{ returns.ordersTotal }} orders returned
          </span>
        </div>
        <div class="flex items-baseline gap-2">
          <span class="font-display text-3xl leading-none" [style.color]="levelColor(returns.level)">
            {{ returns.returnRate }}%
          </span>
          @if (returns.trendingUp) {
            <span class="ex-delta ex-delta--down">▲ rising</span>
          }
        </div>
      </header>

      @if (returns.available && returns.ordersTotal > 0) {
        <div class="p-4 sm:p-6 flex-1 grid grid-cols-1 lg:grid-cols-5 gap-6">
          <!-- Trend -->
          <div class="lg:col-span-3 flex flex-col gap-2 min-w-0">
            <span class="ex-eyebrow">Return rate · by month</span>
            <div class="h-40">
              @if (returns.monthly.length > 0) {
                <canvas #chartCanvas></canvas>
              } @else {
                <div class="flex items-center justify-center h-full ex-muted text-sm">No monthly history</div>
              }
            </div>
          </div>

          <!-- By location -->
          <div class="lg:col-span-2 flex flex-col gap-2 lg:border-l lg:pl-6" style="border-color: var(--ex-rule)">
            <span class="ex-eyebrow">Worst locations</span>
            @if (returns.byLocation.length > 0) {
              <ul>
                @for (loc of returns.byLocation; track loc.id) {
                  <li class="flex items-center justify-between gap-3 py-2 border-t first:border-t-0" style="border-color: var(--ex-rule)">
                    <span class="truncate text-sm ex-ink-soft">{{ loc.name }}</span>
                    <span class="flex items-baseline gap-2 flex-shrink-0">
                      <span class="font-ledger text-[11px] ex-muted">{{ loc.count }}</span>
                      <span
                        class="font-ledger text-sm"
                        [style.color]="loc.rate >= 2 * returns.returnRate ? 'var(--ex-risk)' : 'var(--ex-ink)'"
                      >{{ loc.rate }}%</span>
                    </span>
                  </li>
                }
              </ul>
            } @else {
              <p class="text-sm ex-muted py-2">No location-level returns.</p>
            }
          </div>
        </div>

        <!-- Caveat: this card shows where and how often, never why. -->
        <div class="px-4 sm:px-6 py-3 border-t ex-inset" style="border-color: var(--ex-rule)">
          <p class="font-ledger text-[11px] ex-muted">
            Shows where and how often — not why. Return reasons aren't captured.
          </p>
        </div>
      } @else {
        <div class="p-4 sm:p-6 flex-1 flex items-center justify-center ex-muted text-sm text-center">
          @if (!returns.available) {
            Returns analysis isn't available yet — deploy the returns metrics update.
          } @else {
            No orders to measure returns against yet.
          }
        </div>
      }
    </section>
  `,
  styles: [],
})
export class ReturnsCardComponent implements AfterViewInit, OnChanges, OnDestroy {
  @Input() title = 'Returns';
  @Input() returns: ReturnsReport = {
    returnRate: 0,
    returnedTotal: 0,
    ordersTotal: 0,
    monthly: [],
    byLocation: [],
    trendingUp: false,
    worstLocation: null,
    level: 'neutral',
    available: false,
  };

  @ViewChild('chartCanvas') chartCanvas?: ElementRef<HTMLCanvasElement>;

  private chart: Chart | null = null;

  ngAfterViewInit(): void {
    this.renderChart();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['returns'] && !changes['returns'].firstChange) {
      this.renderChart();
    }
  }

  ngOnDestroy(): void {
    this.chart?.destroy();
  }

  levelColor(level: HealthLevel): string {
    return LEVEL_COLOR[level];
  }

  private renderChart(): void {
    if (this.chart) {
      this.chart.destroy();
      this.chart = null;
    }
    setTimeout(() => this.initChart(), 0);
  }

  private initChart(): void {
    if (!this.chartCanvas?.nativeElement || !this.returns.available || this.returns.monthly.length === 0) return;
    const canvas = this.chartCanvas.nativeElement;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const theme = readExecChartTheme(canvas);
    const months = this.returns.monthly;

    const fill = ctx.createLinearGradient(0, 0, 0, 160);
    fill.addColorStop(0, withAlpha(theme.risk, 0.24));
    fill.addColorStop(1, withAlpha(theme.risk, 0.01));

    this.chart = new Chart(ctx, {
      type: 'line',
      data: {
        labels: months.map(m => m.label),
        datasets: [
          {
            data: months.map(m => m.rate),
            borderColor: theme.risk,
            backgroundColor: fill,
            borderWidth: 2,
            fill: true,
            tension: 0.35,
            pointRadius: 2,
            pointHoverRadius: 4,
            pointBackgroundColor: theme.risk,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: theme.ink,
            titleColor: '#fff',
            bodyColor: '#fff',
            padding: 9,
            titleFont: { family: theme.mono, size: 11 },
            bodyFont: { family: theme.mono, size: 11 },
            callbacks: {
              label: (item: TooltipItem<'line'>) => {
                const m = months[item.dataIndex];
                return `${m.rate}% · ${m.count} returned`;
              },
            },
          },
        },
        scales: {
          x: {
            grid: { display: false },
            border: { color: theme.rule },
            ticks: { color: theme.muted, font: { size: 10, family: theme.mono }, maxRotation: 0 },
          },
          y: {
            beginAtZero: true,
            grid: { color: withAlpha(theme.rule, 0.7) },
            border: { display: false },
            ticks: {
              color: theme.muted,
              font: { size: 10, family: theme.mono },
              callback: value => `${value}%`,
            },
          },
        },
      },
    });
  }
}

const LEVEL_COLOR: Record<HealthLevel, string> = {
  good: 'var(--ex-good)',
  watch: 'var(--ex-watch)',
  risk: 'var(--ex-risk)',
  neutral: 'var(--ex-ink)',
};
