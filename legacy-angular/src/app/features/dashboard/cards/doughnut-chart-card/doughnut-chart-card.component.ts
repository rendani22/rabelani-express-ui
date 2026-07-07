import { Component, Input, ElementRef, ViewChild, AfterViewInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Chart, registerables } from 'chart.js';

Chart.register(...registerables);

export interface DoughnutChartItem {
  label: string;
  value: number;
  color: string;
}

@Component({
  selector: 'app-doughnut-chart-card',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './doughnut-chart-card.component.html',
  styleUrls: ['./doughnut-chart-card.component.css']
})
export class DoughnutChartCardComponent implements AfterViewInit, OnDestroy {
  @Input() cardId = 'doughnut-chart';
  @Input() title = 'Top Countries';
  @Input() chartWidth = 150;
  @Input() chartHeight = 150;

  @Input() data: DoughnutChartItem[] = [
    { label: 'United States', value: 35, color: '#6366F1' },
    { label: 'Italy', value: 25, color: '#8B5CF6' },
    { label: 'Spain', value: 20, color: '#EC4899' },
    { label: 'Germany', value: 15, color: '#F59E0B' },
    { label: 'Other', value: 5, color: '#10B981' }
  ];

  @ViewChild('chartCanvas') chartCanvas!: ElementRef<HTMLCanvasElement>;

  private chart: Chart | null = null;

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
              label: (context) => `${context.label}: ${context.parsed}%`
            }
          }
        }
      }
    });
  }
}

