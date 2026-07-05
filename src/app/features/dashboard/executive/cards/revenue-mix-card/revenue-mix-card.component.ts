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
import { RevenueSummary } from '../../../services/executive-dashboard.service';
import { readExecChartTheme } from '../chart-theme';

Chart.register(...registerables);

/**
 * Revenue status — realized (collected) value and average order value above a
 * ring contrasting value already in the bank (brass) against value sitting at
 * the collection point still awaiting pickup (ink). A ledger key sits below.
 */
@Component({
  selector: 'app-revenue-mix-card',
  standalone: true,
  imports: [CommonModule, ZarCurrencyPipe],
  host: { class: 'col-span-12 lg:col-span-4 block' },
  template: `
    <section class="ex-card h-full flex flex-col">
      <header class="px-4 sm:px-6 py-4 border-b" style="border-color: var(--ex-rule)">
        <span class="ex-eyebrow">{{ title }}</span>
      </header>

      <div class="p-4 sm:p-6 flex-1 flex flex-col gap-5">
        <div class="grid grid-cols-2 gap-4">
          <div class="flex flex-col gap-1">
            <span class="ex-eyebrow">Collected</span>
            <span class="font-display text-xl ex-ink leading-none tabular-nums">{{ summary.totalValue | zar: 'compact' }}</span>
          </div>
          <div class="flex flex-col gap-1">
            <span class="ex-eyebrow">Avg / Order</span>
            <span class="font-display text-xl ex-ink leading-none tabular-nums">{{ summary.avgOrderValue | zar: 'compact' }}</span>
          </div>
        </div>

        <div class="relative" [style.height.px]="chartHeight">
          @if (summary.totalValue > 0 || summary.pipelineValue > 0) {
            <canvas #chartCanvas></canvas>
            <div class="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
              <span class="font-display text-2xl ex-ink leading-none tabular-nums">{{ summary.totalOrders }}</span>
              <span class="ex-eyebrow mt-1">collected</span>
            </div>
          } @else {
            <div class="flex items-center justify-center h-full ex-muted text-sm">
              No collected-order value yet
            </div>
          }
        </div>

        <div class="flex flex-col gap-2.5 text-sm pt-1">
          <div class="flex items-center justify-between">
            <span class="flex items-center gap-2 ex-ink-soft">
              <span class="ex-marker bg-gold"></span> Collected · realized
            </span>
            <span class="font-ledger ex-ink tabular-nums">{{ summary.totalValue | zar }}</span>
          </div>
          <div class="flex items-center justify-between">
            <span class="flex items-center gap-2 ex-ink-soft">
              <span class="ex-marker" style="background: var(--ex-ink-soft)"></span> Awaiting collection
            </span>
            <span class="font-ledger ex-ink tabular-nums">{{ summary.pipelineValue | zar }}</span>
          </div>
        </div>
      </div>
    </section>
  `,
  styles: [],
})
export class RevenueMixCardComponent implements AfterViewInit, OnChanges, OnDestroy {
  @Input() title = 'Revenue Status';
  @Input() chartHeight = 180;
  @Input() summary: RevenueSummary = {
    totalValue: 0,
    totalOrders: 0,
    avgOrderValue: 0,
    pipelineValue: 0,
    pipelineOrders: 0,
    truncated: false,
  };

  @ViewChild('chartCanvas') chartCanvas?: ElementRef<HTMLCanvasElement>;

  private chart: Chart | null = null;

  ngAfterViewInit(): void {
    this.renderChart();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['summary'] && !changes['summary'].firstChange) {
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
    if (!this.chartCanvas?.nativeElement || this.summary.totalValue + this.summary.pipelineValue <= 0) return;
    const canvas = this.chartCanvas.nativeElement;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const theme = readExecChartTheme(canvas);

    this.chart = new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels: ['Collected', 'Awaiting collection'],
        datasets: [
          {
            data: [Math.round(this.summary.totalValue), Math.round(this.summary.pipelineValue)],
            backgroundColor: [theme.gold, theme.inkSoft],
            borderColor: theme.rule,
            borderWidth: 2,
            hoverOffset: 4,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: '72%',
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: theme.ink,
            titleColor: '#fff',
            bodyColor: '#fff',
            padding: 10,
            titleFont: { family: theme.mono, size: 11 },
            bodyFont: { family: theme.mono, size: 11 },
            callbacks: {
              label: item => `${item.label}: ${this.formatZar(Number(item.parsed))}`,
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
}
