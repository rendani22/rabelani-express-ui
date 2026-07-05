import { Component, Input, ElementRef, ViewChild, AfterViewInit, OnDestroy, OnChanges, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Chart, registerables } from 'chart.js';
import { TimeSeriesDataPoint } from '../../services/dashboard.service';

Chart.register(...registerables);

@Component({
  selector: 'app-packages-trend-card',
  standalone: true,
  imports: [CommonModule],
  host: { 'class': 'col-span-12 lg:col-span-8 block' },
  template: `
    <div class="bg-white dark:bg-gray-800 shadow-sm rounded-xl h-full flex flex-col">
      <header class="px-4 sm:px-5 py-4 border-b border-gray-100 dark:border-gray-700/60 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <h2 class="font-semibold text-gray-800 dark:text-gray-100">{{ title }}</h2>
        <div class="flex items-center gap-3">
          <div class="flex items-center">
            <span class="text-xl sm:text-2xl font-bold text-gray-800 dark:text-gray-100 mr-2 tabular-nums">{{ totalCount }}</span>
            <span class="text-xs sm:text-sm text-gray-500 dark:text-gray-400">this week</span>
          </div>
          @if (changePercent !== undefined) {
            <span class="text-sm font-medium px-2 py-1 rounded-full tabular-nums"
                  [ngClass]="changePercent >= 0 ? 'bg-green-100 text-green-600 dark:bg-green-500/20 dark:text-green-400' : 'bg-red-100 text-red-600 dark:bg-red-500/20 dark:text-red-400'">
              {{ changePercent >= 0 ? '+' : '' }}{{ changePercent }}%
            </span>
          }
        </div>
      </header>
      <div class="px-4 sm:px-5 py-3 flex-1 flex flex-col justify-center">
        <div [style.height.px]="chartHeight">
          @if (data.length > 0) {
            <canvas #chartCanvas></canvas>
          } @else {
            <div class="flex items-center justify-center h-full text-gray-500 dark:text-gray-400 text-sm">
              No package data available
            </div>
          }
        </div>
      </div>
    </div>
  `,
  styles: []
})
export class PackagesTrendCardComponent implements AfterViewInit, OnDestroy, OnChanges {
  @Input() cardId = 'packages-trend';
  @Input() title = 'Packages This Week';
  @Input() chartHeight = 248;
  @Input() data: TimeSeriesDataPoint[] = [];
  @Input() changePercent?: number;

  @ViewChild('chartCanvas') chartCanvas!: ElementRef<HTMLCanvasElement>;

  private chart: Chart | null = null;

  get totalCount(): number {
    return this.data.reduce((sum, item) => sum + item.count, 0);
  }

  ngAfterViewInit(): void {
    if (this.data.length > 0) {
      this.initChart();
    }
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['data'] && !changes['data'].firstChange) {
      this.updateChart();
    }
  }

  ngOnDestroy(): void {
    if (this.chart) {
      this.chart.destroy();
    }
  }

  private initChart(): void {
    if (!this.chartCanvas?.nativeElement || this.data.length === 0) return;

    const ctx = this.chartCanvas.nativeElement.getContext('2d');
    if (!ctx) return;

    // Create gradient
    const gradient = ctx.createLinearGradient(0, 0, 0, this.chartHeight);
    gradient.addColorStop(0, 'rgba(139, 92, 246, 0.2)');
    gradient.addColorStop(1, 'rgba(139, 92, 246, 0)');

    this.chart = new Chart(ctx, {
      type: 'line',
      data: {
        labels: this.data.map(item => item.label),
        datasets: [{
          label: 'Packages',
          data: this.data.map(item => item.count),
          fill: true,
          backgroundColor: gradient,
          borderColor: 'rgb(139, 92, 246)',
          borderWidth: 2,
          tension: 0.4,
          pointRadius: 4,
          pointBackgroundColor: 'rgb(139, 92, 246)',
          pointBorderColor: '#fff',
          pointBorderWidth: 2,
          pointHoverRadius: 6,
          pointHoverBackgroundColor: 'rgb(139, 92, 246)',
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            display: false
          },
          tooltip: {
            callbacks: {
              label: (context) => `${context.parsed.y} packages`
            }
          }
        },
        scales: {
          x: {
            grid: {
              display: false
            },
            ticks: {
              color: '#94a3b8'
            }
          },
          y: {
            beginAtZero: true,
            grid: {
              color: 'rgba(148, 163, 184, 0.1)'
            },
            ticks: {
              color: '#94a3b8',
              stepSize: 1,
              callback: (value) => Number.isInteger(value) ? value : ''
            }
          }
        },
        interaction: {
          mode: 'nearest',
          axis: 'x',
          intersect: false
        }
      }
    });
  }

  private updateChart(): void {
    if (this.chart) {
      this.chart.destroy();
      this.chart = null;
    }

    setTimeout(() => {
      this.initChart();
    }, 0);
  }
}


