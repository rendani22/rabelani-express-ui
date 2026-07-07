import { Component, Input, ElementRef, ViewChild, AfterViewInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Chart, registerables } from 'chart.js';

Chart.register(...registerables);

export interface LegendItem {
  label: string;
  color: string;
}

@Component({
  selector: 'app-sales-over-time-card',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './sales-over-time-card.component.html',
  styleUrls: ['./sales-over-time-card.component.css']
})
export class SalesOverTimeCardComponent implements AfterViewInit, OnDestroy {
  @Input() cardId = 'sales-over-time';
  @Input() title = 'Sales Over Time (all stores)';
  @Input() value = '$1,482';
  @Input() changePercent = -22;
  @Input() chartHeight = 248;

  @Input() legendItems: LegendItem[] = [
    { label: 'Current', color: '#6366F1' },
    { label: 'Previous', color: '#94A3B8' }
  ];

  @ViewChild('chartCanvas') chartCanvas!: ElementRef<HTMLCanvasElement>;

  private chart: Chart | null = null;

  get isPositiveChange(): boolean {
    return this.changePercent >= 0;
  }

  get formattedChange(): string {
    const sign = this.changePercent >= 0 ? '+' : '';
    return `${sign}${this.changePercent}%`;
  }

  ngAfterViewInit(): void {
    this.initChart();
  }

  ngOnDestroy(): void {
    if (this.chart) {
      this.chart.destroy();
    }
  }

  private initChart(): void {
    if (!this.chartCanvas?.nativeElement) return;

    const ctx = this.chartCanvas.nativeElement.getContext('2d');
    if (!ctx) return;

    const labels = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const currentData = [732, 610, 855, 790, 1100, 980, 1200, 1150, 950, 1050, 1300, 1482];
    const previousData = [900, 750, 820, 860, 950, 1020, 1100, 1000, 850, 900, 1100, 1200];

    // Create gradients
    const currentGradient = ctx.createLinearGradient(0, 0, 0, this.chartHeight);
    currentGradient.addColorStop(0, 'rgba(99, 102, 241, 0.2)');
    currentGradient.addColorStop(1, 'rgba(99, 102, 241, 0)');

    const previousGradient = ctx.createLinearGradient(0, 0, 0, this.chartHeight);
    previousGradient.addColorStop(0, 'rgba(148, 163, 184, 0.1)');
    previousGradient.addColorStop(1, 'rgba(148, 163, 184, 0)');

    this.chart = new Chart(ctx, {
      type: 'line',
      data: {
        labels: labels,
        datasets: [
          {
            label: 'Current',
            data: currentData,
            fill: true,
            backgroundColor: currentGradient,
            borderColor: 'rgb(99, 102, 241)',
            borderWidth: 2,
            tension: 0.4,
            pointRadius: 0,
            pointHoverRadius: 4,
            pointHoverBackgroundColor: 'rgb(99, 102, 241)'
          },
          {
            label: 'Previous',
            data: previousData,
            fill: true,
            backgroundColor: previousGradient,
            borderColor: 'rgb(148, 163, 184)',
            borderWidth: 2,
            borderDash: [5, 5],
            tension: 0.4,
            pointRadius: 0,
            pointHoverRadius: 4,
            pointHoverBackgroundColor: 'rgb(148, 163, 184)'
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            display: false
          },
          tooltip: {
            mode: 'index',
            intersect: false,
            callbacks: {
              label: (context) => `${context.dataset.label}: $${(context.parsed.y ?? 0).toLocaleString()}`
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
              callback: (value) => '$' + value
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
}

