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
import { Chart, registerables } from 'chart.js';
import { ZarCurrencyPipe } from '../../../../../shared/pipes/zar-currency.pipe';
import { OrderBook } from '../../../services/executive-dashboard.service';
import { readExecChartTheme, withAlpha } from '../chart-theme';

Chart.register(...registerables);

/**
 * Forward order book — committed purchase-order value not yet realized. The
 * open (non-completed) PO value headlines in Fraunces; a themed Chart.js bar
 * strip shows how bookings have trended by month.
 */
@Component({
  selector: 'app-order-book-card',
  standalone: true,
  imports: [CommonModule, ZarCurrencyPipe],
  host: { class: 'col-span-12 lg:col-span-4 block' },
  template: `
    <section class="ex-card h-full flex flex-col">
      <header class="px-4 sm:px-6 py-4 border-b" style="border-color: var(--ex-rule)">
        <span class="ex-eyebrow">{{ title }}</span>
      </header>

      <div class="p-4 sm:p-6 flex-1 flex flex-col gap-5">
        @if (orderBook.available) {
          <div class="flex flex-col gap-1">
            <span class="ex-eyebrow">Open Order Book</span>
            <span class="font-display text-3xl ex-ink leading-none tabular-nums">{{ orderBook.openValue | zar: 'compact' }}</span>
            <span class="font-ledger text-[11px] ex-muted mt-1">
              <span class="tabular-nums">{{ orderBook.openCount }}</span> open {{ orderBook.openCount === 1 ? 'PO' : 'POs' }} ·
              <span class="tabular-nums">{{ orderBook.completedValue | zar: 'compact' }}</span> completed
            </span>
          </div>

          @if (orderBook.monthly.length > 0) {
            <div class="flex flex-col gap-2">
              <span class="ex-eyebrow">Booked by month</span>
              <div class="h-24">
                <canvas #chartCanvas></canvas>
              </div>
            </div>
          }
        } @else {
          <div class="flex items-center justify-center py-8 ex-muted text-sm text-center">
            No priced purchase orders yet
          </div>
        }
      </div>
    </section>
  `,
  styles: [],
})
export class OrderBookCardComponent implements AfterViewInit, OnChanges, OnDestroy {
  @Input() title = 'Forward Order Book';
  @Input() orderBook: OrderBook = {
    openValue: 0,
    openCount: 0,
    completedValue: 0,
    completedCount: 0,
    monthly: [],
    available: false,
  };

  @ViewChild('chartCanvas') chartCanvas?: ElementRef<HTMLCanvasElement>;

  private chart: Chart | null = null;

  ngAfterViewInit(): void {
    this.renderChart();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['orderBook'] && !changes['orderBook'].firstChange) {
      this.renderChart();
    }
  }

  ngOnDestroy(): void {
    this.chart?.destroy();
  }

  private renderChart(): void {
    if (this.chart) {
      this.chart.destroy();
      this.chart = null;
    }
    setTimeout(() => this.initChart(), 0);
  }

  private initChart(): void {
    if (!this.chartCanvas?.nativeElement || !this.orderBook.available || this.orderBook.monthly.length === 0) return;
    const canvas = this.chartCanvas.nativeElement;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const theme = readExecChartTheme(canvas);
    const months = this.orderBook.monthly;

    this.chart = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: months.map(m => m.label),
        datasets: [
          {
            data: months.map(m => Math.round(m.value)),
            backgroundColor: withAlpha(theme.gold, 0.85),
            hoverBackgroundColor: theme.gold,
            borderWidth: 0,
            borderRadius: 2,
            barPercentage: 0.68,
            categoryPercentage: 0.8,
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
              label: item => this.formatZar(Number(item.parsed.y)),
            },
          },
        },
        scales: {
          x: {
            grid: { display: false },
            border: { color: theme.rule },
            ticks: { color: theme.muted, font: { size: 9, family: theme.mono }, maxRotation: 0 },
          },
          y: { display: false, beginAtZero: true },
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
}
