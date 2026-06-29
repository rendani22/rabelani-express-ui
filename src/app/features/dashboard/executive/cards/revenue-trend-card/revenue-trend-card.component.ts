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

Chart.register(...registerables);

type Granularity = keyof RevenueTrends;

/**
 * Revenue-over-time chart with a Day / Week / Month / Year granularity toggle.
 * Bars show completed-order value (left axis); the overlaid line shows order
 * count (right axis), so the CEO sees both money and volume at a glance.
 */
@Component({
  selector: 'app-revenue-trend-card',
  standalone: true,
  imports: [CommonModule, ZarCurrencyPipe],
  host: { class: 'col-span-12 lg:col-span-8 block' },
  template: `
    <div class="bg-white dark:bg-gray-800 shadow-sm rounded-xl h-full flex flex-col">
      <header
        class="px-4 sm:px-5 py-4 border-b border-gray-100 dark:border-gray-700/60 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3"
      >
        <div class="flex flex-col">
          <h2 class="font-semibold text-gray-800 dark:text-gray-100">{{ title }}</h2>
          <span class="text-xs text-gray-500 dark:text-gray-400">
            {{ activeTotalValue | zar }} · {{ activeTotalOrders }} orders shown
          </span>
        </div>
        <div class="inline-flex rounded-lg bg-gray-100 dark:bg-gray-700/50 p-0.5 self-start">
          @for (g of granularities; track g.key) {
            <button
              type="button"
              (click)="setGranularity(g.key)"
              class="px-3 py-1 text-xs font-medium rounded-md transition-colors"
              [ngClass]="granularity === g.key
                ? 'bg-white dark:bg-gray-800 text-violet-600 dark:text-violet-400 shadow-sm'
                : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'"
            >
              {{ g.label }}
            </button>
          }
        </div>
      </header>

      <div class="px-4 sm:px-5 py-4 flex-1 flex flex-col justify-center">
        <div [style.height.px]="chartHeight">
          @if (activePoints.length > 0 && activeTotalValue > 0) {
            <canvas #chartCanvas></canvas>
          } @else {
            <div class="flex items-center justify-center h-full text-gray-500 dark:text-gray-400 text-sm">
              No completed-order value in this period
            </div>
          }
        </div>
      </div>
    </div>
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
    // Defer so the @if canvas is in the DOM after a granularity/data switch.
    if (this.chart) {
      this.chart.destroy();
      this.chart = null;
    }
    setTimeout(() => this.initChart(), 0);
  }

  private initChart(): void {
    const points = this.activePoints;
    if (!this.chartCanvas?.nativeElement || points.length === 0 || this.activeTotalValue <= 0) return;

    const ctx = this.chartCanvas.nativeElement.getContext('2d');
    if (!ctx) return;

    this.chart = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: points.map(p => p.label),
        datasets: [
          {
            type: 'bar',
            label: 'Value',
            data: points.map(p => Math.round(p.value)),
            backgroundColor: 'rgba(139, 92, 246, 0.75)',
            borderColor: 'rgb(139, 92, 246)',
            borderWidth: 1,
            borderRadius: 4,
            barPercentage: 0.7,
            yAxisID: 'y',
            order: 2,
          },
          {
            type: 'line',
            label: 'Orders',
            data: points.map(p => p.orders),
            borderColor: 'rgb(16, 185, 129)',
            backgroundColor: 'rgba(16, 185, 129, 0.15)',
            borderWidth: 2,
            tension: 0.35,
            pointRadius: 2,
            pointHoverRadius: 4,
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
            labels: { boxWidth: 12, usePointStyle: true, color: '#94a3b8', font: { size: 11 } },
          },
          tooltip: {
            callbacks: {
              label: (item: TooltipItem<'bar' | 'line'>) => {
                if (item.dataset.label === 'Value') {
                  return `Value: ${this.formatZar(Number(item.parsed.y))}`;
                }
                return `Orders: ${item.parsed.y}`;
              },
            },
          },
        },
        scales: {
          x: {
            grid: { display: false },
            ticks: { color: '#94a3b8', maxRotation: 0, autoSkip: true, maxTicksLimit: 12 },
          },
          y: {
            beginAtZero: true,
            position: 'left',
            grid: { color: 'rgba(148, 163, 184, 0.12)' },
            ticks: {
              color: '#94a3b8',
              callback: value => this.formatZarCompact(Number(value)),
            },
          },
          yOrders: {
            beginAtZero: true,
            position: 'right',
            grid: { drawOnChartArea: false },
            ticks: {
              color: '#94a3b8',
              precision: 0,
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
