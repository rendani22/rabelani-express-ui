import { Component, Input, ElementRef, ViewChild, AfterViewInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Chart, registerables } from 'chart.js';

Chart.register(...registerables);

@Component({
  selector: 'app-bar-chart-card',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './bar-chart-card.component.html',
  styleUrls: ['./bar-chart-card.component.css']
})
export class BarChartCardComponent implements AfterViewInit, OnDestroy {
  @Input() cardId = 'bar-chart';
  @Input() title = 'Direct VS Indirect';
  @Input() chartHeight = 248;

  @ViewChild('chartCanvas') chartCanvas!: ElementRef<HTMLCanvasElement>;

  private chart: Chart | null = null;

  // Legend items for the template
  legendItems = [
    { label: 'Direct', color: 'bg-indigo-500' },
    { label: 'Indirect', color: 'bg-indigo-300' }
  ];

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
    const directData = [800, 1600, 900, 1300, 1950, 1700];
    const indirectData = [200, 600, 400, 600, 450, 700];

    this.chart = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: labels,
        datasets: [
          {
            label: 'Direct',
            data: directData,
            backgroundColor: 'rgb(99, 102, 241)',
            borderRadius: 4,
            barPercentage: 0.6,
            categoryPercentage: 0.5
          },
          {
            label: 'Indirect',
            data: indirectData,
            backgroundColor: 'rgb(165, 180, 252)',
            borderRadius: 4,
            barPercentage: 0.6,
            categoryPercentage: 0.5
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
        }
      }
    });
  }
}

