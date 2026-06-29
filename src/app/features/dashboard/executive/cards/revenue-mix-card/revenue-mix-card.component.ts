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

Chart.register(...registerables);

/**
 * Revenue status: realized (collected) value, average order value, and a
 * doughnut contrasting value already collected against value sitting at the
 * collection point still awaiting pickup (pipeline).
 */
@Component({
  selector: 'app-revenue-mix-card',
  standalone: true,
  imports: [CommonModule, ZarCurrencyPipe],
  host: { class: 'col-span-12 lg:col-span-4 block' },
  template: `
    <div class="bg-white dark:bg-gray-800 shadow-sm rounded-xl h-full flex flex-col">
      <header class="px-4 sm:px-5 py-4 border-b border-gray-100 dark:border-gray-700/60">
        <h2 class="font-semibold text-gray-800 dark:text-gray-100">{{ title }}</h2>
      </header>

      <div class="p-4 sm:p-5 flex-1 flex flex-col gap-4">
        <div class="grid grid-cols-2 gap-3">
          <div class="flex flex-col">
            <span class="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">Collected Value</span>
            <span class="text-xl font-bold text-gray-800 dark:text-gray-100">{{ summary.totalValue | zar }}</span>
          </div>
          <div class="flex flex-col">
            <span class="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">Avg / Order</span>
            <span class="text-xl font-bold text-gray-800 dark:text-gray-100">{{ summary.avgOrderValue | zar }}</span>
          </div>
        </div>

        <div class="relative" [style.height.px]="chartHeight">
          @if (summary.totalValue > 0 || summary.pipelineValue > 0) {
            <canvas #chartCanvas></canvas>
            <div class="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
              <span class="text-lg font-bold text-gray-800 dark:text-gray-100">{{ summary.totalOrders }}</span>
              <span class="text-[11px] text-gray-500 dark:text-gray-400">collected</span>
            </div>
          } @else {
            <div class="flex items-center justify-center h-full text-gray-500 dark:text-gray-400 text-sm">
              No collected-order value yet
            </div>
          }
        </div>

        <div class="flex flex-col gap-2 text-sm">
          <div class="flex items-center justify-between">
            <span class="flex items-center gap-2 text-gray-600 dark:text-gray-300">
              <span class="w-2.5 h-2.5 rounded-full bg-emerald-500"></span> Collected (realized)
            </span>
            <span class="font-medium text-gray-800 dark:text-gray-100">{{ summary.totalValue | zar }}</span>
          </div>
          <div class="flex items-center justify-between">
            <span class="flex items-center gap-2 text-gray-600 dark:text-gray-300">
              <span class="w-2.5 h-2.5 rounded-full bg-amber-500"></span> Awaiting collection
            </span>
            <span class="font-medium text-gray-800 dark:text-gray-100">{{ summary.pipelineValue | zar }}</span>
          </div>
        </div>
      </div>
    </div>
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
    const ctx = this.chartCanvas.nativeElement.getContext('2d');
    if (!ctx) return;

    this.chart = new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels: ['Collected', 'Awaiting collection'],
        datasets: [
          {
            data: [Math.round(this.summary.totalValue), Math.round(this.summary.pipelineValue)],
            backgroundColor: ['rgb(16, 185, 129)', 'rgb(245, 158, 11)'],
            borderWidth: 0,
            hoverOffset: 4,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: '70%',
        plugins: {
          legend: { display: false },
          tooltip: {
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
