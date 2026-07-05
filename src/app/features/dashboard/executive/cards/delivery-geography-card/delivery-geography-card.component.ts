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
import { DeliveryGeography, HealthLevel } from '../../../services/executive-dashboard.service';
import { readExecChartTheme, withAlpha } from '../chart-theme';

Chart.register(...registerables);

/**
 * Delivery geography — order volume by location, drawn as a horizontal Chart.js
 * bar. The two things that drive action lead the side rail: how concentrated
 * volume is in the top region, and how many orders carry no location at all
 * (a routing data defect, not a place).
 */
@Component({
  selector: 'app-delivery-geography-card',
  standalone: true,
  imports: [CommonModule],
  host: { class: 'col-span-12 block' },
  template: `
    <section class="ex-card h-full flex flex-col">
      <header class="px-4 sm:px-6 py-4 border-b flex items-center justify-between gap-3" style="border-color: var(--ex-rule)">
        <span class="ex-eyebrow">{{ title }}</span>
        @if (geography.available && geography.concentrationLevel !== 'good' && geography.concentrationLevel !== 'neutral') {
          <span class="font-ledger text-[11px]" [style.color]="levelColor(geography.concentrationLevel)">
            Top region <span class="tabular-nums">{{ geography.topShare }}%</span>
          </span>
        }
      </header>

      <div class="p-4 sm:p-6 flex-1">
        @if (geography.available && geography.locations.length > 0) {
          <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div class="lg:col-span-2 min-w-0">
              <div [style.height.px]="chartHeight">
                <canvas #chartCanvas></canvas>
              </div>
            </div>

            <div class="flex flex-col gap-5 lg:border-l lg:pl-6" style="border-color: var(--ex-rule)">
              <div class="flex flex-col gap-1">
                <span class="ex-eyebrow">Top region share</span>
                <span class="font-display text-2xl leading-none tabular-nums" [style.color]="levelColor(geography.concentrationLevel)">
                  {{ geography.topShare }}%
                </span>
                <span class="font-ledger text-[11px] ex-muted mt-0.5">
                  {{ geography.locations[0].name }} · <span class="tabular-nums">{{ geography.totalAssigned }}</span> located orders
                </span>
              </div>

              <div class="flex flex-col gap-1">
                <span class="ex-eyebrow">Unassigned</span>
                <span
                  class="font-display text-2xl leading-none tabular-nums"
                  [style.color]="geography.unassigned > 0 ? 'var(--ex-watch)' : 'var(--ex-good)'"
                >{{ geography.unassigned }}</span>
                <span class="font-ledger text-[11px] ex-muted mt-0.5">
                  @if (geography.unassigned > 0) {
                    orders with no location — can't be routed
                  } @else {
                    every order has a location
                  }
                </span>
              </div>
            </div>
          </div>
        } @else {
          <div class="flex items-center justify-center py-8 ex-muted text-sm">
            No delivery-location data yet
          </div>
        }
      </div>
    </section>
  `,
  styles: [],
})
export class DeliveryGeographyCardComponent implements AfterViewInit, OnChanges, OnDestroy {
  @Input() title = 'Delivery Geography';
  @Input() geography: DeliveryGeography = {
    locations: [],
    unassigned: 0,
    totalAssigned: 0,
    topShare: 0,
    concentrationLevel: 'neutral',
    available: false,
  };

  @ViewChild('chartCanvas') chartCanvas?: ElementRef<HTMLCanvasElement>;

  private chart: Chart | null = null;

  get chartHeight(): number {
    return Math.max(120, this.geography.locations.length * 34);
  }

  ngAfterViewInit(): void {
    this.renderChart();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['geography'] && !changes['geography'].firstChange) {
      this.renderChart();
    }
  }

  ngOnDestroy(): void {
    this.chart?.destroy();
  }

  levelColor(level: HealthLevel): string {
    return LEVEL_COLOR[level];
  }

  private renderChart(): void {
    if (this.chart) {
      this.chart.destroy();
      this.chart = null;
    }
    setTimeout(() => this.initChart(), 0);
  }

  private initChart(): void {
    if (!this.chartCanvas?.nativeElement || !this.geography.available || this.geography.locations.length === 0) return;
    const canvas = this.chartCanvas.nativeElement;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const theme = readExecChartTheme(canvas);
    const locations = this.geography.locations;

    this.chart = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: locations.map(l => l.name),
        datasets: [
          {
            data: locations.map(l => l.count),
            backgroundColor: withAlpha(theme.gold, 0.82),
            hoverBackgroundColor: theme.gold,
            borderWidth: 0,
            borderRadius: 2,
            barPercentage: 0.72,
            categoryPercentage: 0.86,
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
            backgroundColor: theme.ink,
            titleColor: '#fff',
            bodyColor: '#fff',
            padding: 9,
            titleFont: { family: theme.mono, size: 11 },
            bodyFont: { family: theme.mono, size: 11 },
            callbacks: {
              label: item => {
                const loc = locations[item.dataIndex];
                return `${loc.count} orders · ${loc.share}%`;
              },
            },
          },
        },
        scales: {
          x: {
            beginAtZero: true,
            grid: { color: withAlpha(theme.rule, 0.7) },
            border: { display: false },
            ticks: { color: theme.muted, precision: 0, font: { size: 10, family: theme.mono } },
          },
          y: {
            grid: { display: false },
            border: { color: theme.rule },
            ticks: { color: theme.inkSoft, font: { size: 11 } },
          },
        },
      },
    });
  }
}

const LEVEL_COLOR: Record<HealthLevel, string> = {
  good: 'var(--ex-good)',
  watch: 'var(--ex-watch)',
  risk: 'var(--ex-risk)',
  neutral: 'var(--ex-ink)',
};
