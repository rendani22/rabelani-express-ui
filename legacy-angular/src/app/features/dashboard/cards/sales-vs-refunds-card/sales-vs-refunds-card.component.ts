import { Component, Input, ElementRef, ViewChild, AfterViewInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Chart, registerables } from 'chart.js';

Chart.register(...registerables);

@Component({
  selector: 'app-sales-vs-refunds-card',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './sales-vs-refunds-card.component.html',
  styleUrls: ['./sales-vs-refunds-card.component.css']
})
export class SalesVsRefundsCardComponent implements AfterViewInit, OnDestroy {
  @Input() cardId = 'sales-vs-refunds';
  @Input() title = 'Sales VS Refunds';
  @Input() value = '+$6,796';
  @Input() changePercent = -34;
  @Input() chartHeight = 248;
  @Input() tooltipText = 'Sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit.';

  @ViewChild('chartCanvas') chartCanvas!: ElementRef<HTMLCanvasElement>;

  private chart: Chart | null = null;
  tooltipOpen = false;

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

    const labels = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'];
    const salesData = [4200, 3800, 5400, 4800, 4600, 5200];
    const refundsData = [-800, -600, -1200, -900, -750, -1100];

    this.chart = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: labels,
        datasets: [
          {
            label: 'Sales',
            data: salesData,
            backgroundColor: 'rgb(99, 102, 241)',
            borderRadius: 4,
            barPercentage: 0.6
          },
          {
            label: 'Refunds',
            data: refundsData,
            backgroundColor: 'rgb(244, 63, 94)',
            borderRadius: 4,
            barPercentage: 0.6
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
            callbacks: {
              label: (context) => {
                const value = Math.abs(context.parsed.y ?? 0);
                return `${context.dataset.label}: $${value.toLocaleString()}`;
              }
            }
          }
        },
        scales: {
          x: {
            stacked: true,
            grid: {
              display: false
            },
            ticks: {
              color: '#94a3b8'
            }
          },
          y: {
            stacked: true,
            grid: {
              color: 'rgba(148, 163, 184, 0.1)'
            },
            ticks: {
              color: '#94a3b8',
              callback: (value) => {
                const num = value as number;
                return num >= 0 ? '$' + num : '-$' + Math.abs(num);
              }
            }
          }
        }
      }
    });
  }

  showTooltip(): void {
    this.tooltipOpen = true;
  }

  hideTooltip(): void {
    this.tooltipOpen = false;
  }
}

