import { Component, Input, ElementRef, ViewChild, AfterViewInit, OnDestroy, OnChanges, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Chart, registerables } from 'chart.js';
import { StatusDistribution } from '../../services/dashboard.service';

Chart.register(...registerables);

@Component({
  selector: 'app-package-status-chart',
  standalone: true,
  imports: [CommonModule],
  host: { 'class': 'col-span-12 sm:col-span-6 lg:col-span-4 block' },
  template: `
    <div class="bg-white dark:bg-gray-800 shadow-sm rounded-xl h-full flex flex-col">
      <header class="px-4 sm:px-5 py-4 border-b border-gray-100 dark:border-gray-700/60">
        <h2 class="font-semibold text-gray-800 dark:text-gray-100">{{ title }}</h2>
      </header>
      <div class="px-4 sm:px-5 py-3 flex-1 flex flex-col justify-between">
        <div class="flex items-center justify-center" style="height: 180px;">
          @if (data.length > 0) {
            <div class="relative" [style.width.px]="chartWidth" [style.height.px]="chartHeight">
              <canvas #chartCanvas></canvas>
              <div class="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div class="text-center">
                  <div class="text-3xl font-bold text-gray-800 dark:text-gray-100 tabular-nums">{{ totalPackages }}</div>
                  <div class="text-xs text-gray-500 dark:text-gray-400 uppercase">Total</div>
                </div>
              </div>
            </div>
          } @else {
            <div class="text-gray-500 dark:text-gray-400 text-sm">No package data available</div>
          }
        </div>
        <!-- Legend -->
        @if (data.length > 0) {
          <div class="pt-4 pb-2 border-t border-gray-100 dark:border-gray-700/60 mt-4">
            <ul class="flex flex-wrap justify-center gap-x-4 gap-y-2">
              @for (item of data; track item.label) {
                <li class="flex items-center">
                  <span class="w-3 h-3 rounded-full mr-2" [style.backgroundColor]="item.color"></span>
                  <span class="text-sm text-gray-600 dark:text-gray-300">
                    {{ item.label }} <span class="font-medium text-gray-800 dark:text-gray-100 tabular-nums">{{ item.value }}</span>
                  </span>
                </li>
              }
            </ul>
          </div>
        }
      </div>
    </div>
  `,
  styles: []
})
export class PackageStatusChartComponent implements AfterViewInit, OnDestroy, OnChanges {
  @Input() cardId = 'package-status-chart';
  @Input() title = 'Package Status';
  @Input() chartWidth = 160;
  @Input() chartHeight = 160;
  @Input() data: StatusDistribution[] = [];

  @ViewChild('chartCanvas') chartCanvas!: ElementRef<HTMLCanvasElement>;

  private chart: Chart | null = null;

  get totalPackages(): number {
    return this.data.reduce((sum, item) => sum + item.value, 0);
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

    this.chart = new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels: this.data.map(item => item.label),
        datasets: [{
          data: this.data.map(item => item.value),
          backgroundColor: this.data.map(item => item.color),
          borderWidth: 0,
          hoverBorderWidth: 2,
          hoverBorderColor: '#fff'
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: true,
        cutout: '70%',
        plugins: {
          legend: {
            display: false
          },
          tooltip: {
            callbacks: {
              label: (context) => {
                const total = this.totalPackages;
                const percentage = total > 0 ? Math.round((context.parsed / total) * 100) : 0;
                return `${context.label}: ${context.parsed} (${percentage}%)`;
              }
            }
          }
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


