import { Component, Input, ElementRef, ViewChild, AfterViewInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Chart, registerables } from 'chart.js';

Chart.register(...registerables);

@Component({
  selector: 'app-realtime-chart-card',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './realtime-chart-card.component.html',
  styleUrls: ['./realtime-chart-card.component.css']
})
export class RealtimeChartCardComponent implements AfterViewInit, OnDestroy {
  @Input() cardId = 'realtime-chart';
  @Input() title = 'Real Time Value';
  @Input() value = '57.81';
  @Input() deviation = 0;
  @Input() chartHeight = 248;
  @Input() tooltipText = '';
  @Input() tooltipLink = '';
  @Input() tooltipLinkText = '';

  @ViewChild('chartCanvas') chartCanvas!: ElementRef<HTMLCanvasElement>;

  private chart: Chart | null = null;
  private animationId: number | null = null;
  private dataPoints: number[] = [];

  tooltipOpen = false;

  get isPositiveDeviation(): boolean {
    return this.deviation >= 0;
  }

  get formattedDeviation(): string {
    if (this.deviation === 0) return '';
    const sign = this.deviation >= 0 ? '+' : '';
    return `${sign}${this.deviation}%`;
  }

  ngAfterViewInit(): void {
    this.initChart();
    this.startRealtimeUpdates();
  }

  ngOnDestroy(): void {
    if (this.animationId) {
      cancelAnimationFrame(this.animationId);
    }
    if (this.chart) {
      this.chart.destroy();
    }
  }

  private initChart(): void {
    if (!this.chartCanvas?.nativeElement) return;

    const ctx = this.chartCanvas.nativeElement.getContext('2d');
    if (!ctx) return;

    // Initialize with some data points
    this.dataPoints = Array.from({ length: 30 }, () => Math.random() * 40 + 35);

    // Create gradient
    const gradient = ctx.createLinearGradient(0, 0, 0, this.chartHeight);
    gradient.addColorStop(0, 'rgba(99, 102, 241, 0.2)');
    gradient.addColorStop(1, 'rgba(99, 102, 241, 0)');

    this.chart = new Chart(ctx, {
      type: 'line',
      data: {
        labels: this.dataPoints.map((_, i) => i.toString()),
        datasets: [{
          data: this.dataPoints,
          fill: true,
          backgroundColor: gradient,
          borderColor: 'rgb(99, 102, 241)',
          borderWidth: 2,
          tension: 0.4,
          pointRadius: 0
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: {
          duration: 300
        },
        plugins: {
          legend: {
            display: false
          },
          tooltip: {
            enabled: false
          }
        },
        scales: {
          x: {
            display: false
          },
          y: {
            display: false,
            min: 0,
            max: 100
          }
        }
      }
    });
  }

  private startRealtimeUpdates(): void {
    let lastUpdate = Date.now();

    const update = () => {
      const now = Date.now();
      if (now - lastUpdate >= 2000) { // Update every 2 seconds
        this.updateChart();
        lastUpdate = now;
      }
      this.animationId = requestAnimationFrame(update);
    };

    this.animationId = requestAnimationFrame(update);
  }

  private updateChart(): void {
    if (!this.chart) return;

    // Add new data point and remove oldest
    const newValue = Math.random() * 40 + 35;
    this.dataPoints.push(newValue);
    this.dataPoints.shift();

    this.chart.data.datasets[0].data = this.dataPoints;
    this.chart.update('none');

    // Update displayed value
    this.value = newValue.toFixed(2);
  }

  showTooltip(): void {
    this.tooltipOpen = true;
  }

  hideTooltip(): void {
    this.tooltipOpen = false;
  }
}

