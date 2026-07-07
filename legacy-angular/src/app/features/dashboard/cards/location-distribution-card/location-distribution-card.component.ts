import {
  Component,
  Input,
  ElementRef,
  ViewChild,
  AfterViewInit,
  OnDestroy,
  OnChanges,
  SimpleChanges,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { Chart, registerables } from 'chart.js';
import { LocationDistribution } from '../../services/dashboard.service';

Chart.register(...registerables);

@Component({
  selector: 'app-location-distribution-card',
  standalone: true,
  imports: [CommonModule],
  host: { class: 'col-span-12 lg:col-span-8 block' },
  template: `
    <div class="bg-white dark:bg-gray-800 shadow-sm rounded-xl h-full flex flex-col">
      <header class="px-4 sm:px-5 py-4 border-b border-gray-100 dark:border-gray-700/60 flex items-center justify-between">
        <h2 class="font-semibold text-gray-800 dark:text-gray-100">{{ title }}</h2>
        <span class="text-xs text-gray-500 dark:text-gray-400">{{ data.length }} locations</span>
      </header>
      <div class="px-4 sm:px-5 py-3 flex-1 flex flex-col justify-center">
        @if (data.length > 0) {
          <div [style.height.px]="chartHeight">
            <canvas #chartCanvas></canvas>
          </div>
        } @else {
          <div class="flex flex-col items-center justify-center py-10 text-gray-400 dark:text-gray-500">
            <svg class="w-10 h-10 mb-2" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
              <path d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"/>
              <path d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"/>
            </svg>
            <p class="text-sm">No delivery location data</p>
          </div>
        }
      </div>
    </div>
  `,
  styles: [],
})
export class LocationDistributionCardComponent
  implements AfterViewInit, OnDestroy, OnChanges
{
  @Input() title = 'Packages by Delivery Location';
  @Input() chartHeight = 220;
  @Input() data: LocationDistribution[] = [];

  @ViewChild('chartCanvas') chartCanvas!: ElementRef<HTMLCanvasElement>;

  private chart: Chart | null = null;

  private readonly COLORS = [
    'rgba(139, 92, 246, 0.8)',
    'rgba(59, 130, 246, 0.8)',
    'rgba(16, 185, 129, 0.8)',
    'rgba(245, 158, 11, 0.8)',
    'rgba(239, 68, 68, 0.8)',
    'rgba(236, 72, 153, 0.8)',
    'rgba(14, 165, 233, 0.8)',
    'rgba(168, 85, 247, 0.8)',
  ];

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

    const colors = this.data.map((_, i) => this.COLORS[i % this.COLORS.length]);

    this.chart = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: this.data.map((item) => item.name),
        datasets: [
          {
            label: 'Packages',
            data: this.data.map((item) => item.count),
            backgroundColor: colors,
            borderRadius: 4,
            barPercentage: 0.6,
          },
        ],
      },
      options: {
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: (context) => ` ${context.parsed.x} packages`,
            },
          },
        },
        scales: {
          x: {
            beginAtZero: true,
            grid: { color: 'rgba(148, 163, 184, 0.1)' },
            ticks: {
              color: '#94a3b8',
              stepSize: 1,
              callback: (value) => (Number.isInteger(value) ? value : ''),
            },
          },
          y: {
            grid: { display: false },
            ticks: {
              color: '#94a3b8',
              font: { size: 11 },
            },
          },
        },
      },
    });
  }

  private updateChart(): void {
    if (this.chart) {
      this.chart.destroy();
      this.chart = null;
    }
    setTimeout(() => this.initChart(), 0);
  }
}

