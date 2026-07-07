import { Component, Input, Output, EventEmitter, ElementRef, ViewChild, AfterViewInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Chart, registerables } from 'chart.js';

// Register Chart.js components
Chart.register(...registerables);

@Component({
  selector: 'app-line-chart-card',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './line-chart-card.component.html',
  styleUrls: ['./line-chart-card.component.css']
})
export class LineChartCardComponent implements AfterViewInit, OnDestroy {
  @Input() cardId = 'chart-card';
  @Input() title = 'Chart Title';
  @Input() subtitle = 'Sales';
  @Input() value = '$0';
  @Input() changePercent = 0;
  @Input() chartHeight = 128;
  @Input() chartData: number[] = [];
  @Input() chartLabels: string[] = [];

  @Output() optionSelect = new EventEmitter<string>();
  @Output() removeCard = new EventEmitter<void>();

  @ViewChild('chartCanvas') chartCanvas!: ElementRef<HTMLCanvasElement>;

  private chart: Chart | null = null;
  menuOpen = false;

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

    // Generate sample data if not provided
    const data = this.chartData.length > 0 ? this.chartData : this.generateSampleData();
    const labels = this.chartLabels.length > 0 ? this.chartLabels : this.generateLabels(data.length);

    // Create gradient
    const gradient = ctx.createLinearGradient(0, 0, 0, this.chartHeight);
    const color = this.isPositiveChange ? 'rgba(34, 197, 94, ' : 'rgba(99, 102, 241, ';
    gradient.addColorStop(0, color + '0.2)');
    gradient.addColorStop(1, color + '0)');

    this.chart = new Chart(ctx, {
      type: 'line',
      data: {
        labels: labels,
        datasets: [{
          data: data,
          fill: true,
          backgroundColor: gradient,
          borderColor: this.isPositiveChange ? 'rgb(34, 197, 94)' : 'rgb(99, 102, 241)',
          borderWidth: 2,
          tension: 0.4,
          pointRadius: 0,
          pointHoverRadius: 4,
          pointHoverBackgroundColor: this.isPositiveChange ? 'rgb(34, 197, 94)' : 'rgb(99, 102, 241)',
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
            enabled: true,
            mode: 'index',
            intersect: false,
            callbacks: {
              label: (context) => `$${(context.parsed.y ?? 0).toLocaleString()}`
            }
          }
        },
        scales: {
          x: {
            display: false
          },
          y: {
            display: false
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

  private generateSampleData(): number[] {
    const baseValue = Math.random() * 5000 + 2000;
    return Array.from({ length: 12 }, () =>
      baseValue + (Math.random() - 0.5) * 2000
    );
  }

  private generateLabels(count: number): string[] {
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return months.slice(0, count);
  }

  toggleMenu(): void {
    this.menuOpen = !this.menuOpen;
  }

  closeMenu(): void {
    this.menuOpen = false;
  }

  onOption(option: string): void {
    this.optionSelect.emit(option);
    this.closeMenu();
  }

  onRemove(): void {
    this.removeCard.emit();
    this.closeMenu();
  }
}

