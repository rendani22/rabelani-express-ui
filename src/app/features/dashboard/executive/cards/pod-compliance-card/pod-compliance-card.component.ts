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
import { HealthLevel, PodCompliance } from '../../../services/executive-dashboard.service';
import { readExecChartTheme, withAlpha } from '../chart-theme';

Chart.register(...registerables);

/**
 * POD compliance — the share of deliveries with a captured proof-of-delivery
 * PDF, shown as a Chart.js ring gauge. Framed as cash protection: a missing POD
 * can't defend a dispute, so a low capture rate is money at risk, not just an
 * ops metric.
 */
@Component({
  selector: 'app-pod-compliance-card',
  standalone: true,
  imports: [CommonModule],
  host: { class: 'col-span-12 lg:col-span-4 block' },
  template: `
    <section class="ex-card h-full flex flex-col">
      <header class="px-4 sm:px-6 py-4 border-b" style="border-color: var(--ex-rule)">
        <span class="ex-eyebrow">{{ title }}</span>
      </header>

      <div class="p-4 sm:p-6 flex-1 flex flex-col gap-5">
        @if (podCompliance.available && podCompliance.total > 0) {
          <div class="flex items-center gap-5">
            <div class="relative w-[104px] h-[104px] flex-shrink-0">
              <canvas #gaugeCanvas></canvas>
              <div class="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                <span class="font-display text-2xl leading-none" [style.color]="levelColor(podCompliance.level)">
                  {{ podCompliance.pdfRate }}%
                </span>
                <span class="ex-eyebrow mt-1">captured</span>
              </div>
            </div>
            <div class="flex flex-col gap-3 min-w-0">
              <div class="flex flex-col">
                <span class="ex-eyebrow">With proof PDF</span>
                <span class="font-ledger text-sm ex-ink">
                  {{ podCompliance.withPdf }} / {{ podCompliance.total }}
                </span>
              </div>
              <div class="flex flex-col">
                <span class="ex-eyebrow">Finalized (locked)</span>
                <span class="font-ledger text-sm ex-ink">{{ podCompliance.lockedRate }}%</span>
              </div>
            </div>
          </div>

          <div class="grid grid-cols-2 gap-4 pt-1 border-t" style="border-color: var(--ex-rule)">
            <div class="flex flex-col gap-0.5 pt-3">
              <span class="ex-eyebrow">Today</span>
              <span class="font-ledger text-lg ex-ink leading-none">{{ podCompliance.today }}</span>
            </div>
            <div class="flex flex-col gap-0.5 pt-3">
              <span class="ex-eyebrow">This week</span>
              <span class="font-ledger text-lg ex-ink leading-none">{{ podCompliance.thisWeek }}</span>
            </div>
          </div>

          <p class="text-xs ex-muted leading-snug mt-auto">
            No proof, no defense — an uncaptured POD can't back a disputed delivery or its payment.
          </p>
        } @else {
          <div class="flex-1 flex items-center justify-center ex-muted text-sm text-center py-6">
            No proof-of-delivery records yet
          </div>
        }
      </div>
    </section>
  `,
  styles: [],
})
export class PodComplianceCardComponent implements AfterViewInit, OnChanges, OnDestroy {
  @Input() title = 'POD Compliance';
  @Input() podCompliance: PodCompliance = {
    total: 0,
    withPdf: 0,
    locked: 0,
    today: 0,
    thisWeek: 0,
    pdfRate: 0,
    lockedRate: 0,
    level: 'neutral',
    available: false,
  };

  @ViewChild('gaugeCanvas') gaugeCanvas?: ElementRef<HTMLCanvasElement>;

  private gauge: Chart | null = null;

  ngAfterViewInit(): void {
    this.renderGauge();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['podCompliance'] && !changes['podCompliance'].firstChange) {
      this.renderGauge();
    }
  }

  ngOnDestroy(): void {
    this.gauge?.destroy();
  }

  levelColor(level: HealthLevel): string {
    return LEVEL_COLOR[level];
  }

  private renderGauge(): void {
    if (this.gauge) {
      this.gauge.destroy();
      this.gauge = null;
    }
    setTimeout(() => this.initGauge(), 0);
  }

  private initGauge(): void {
    if (!this.gaugeCanvas?.nativeElement || !this.podCompliance.available || this.podCompliance.total <= 0) return;
    const canvas = this.gaugeCanvas.nativeElement;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const theme = readExecChartTheme(canvas);
    const rate = Math.max(0, Math.min(100, this.podCompliance.pdfRate));
    const arc = LEVEL_CHART_COLOR(this.podCompliance.level, theme);

    this.gauge = new Chart(ctx, {
      type: 'doughnut',
      data: {
        datasets: [
          {
            data: [rate, 100 - rate],
            backgroundColor: [arc, withAlpha(theme.rule, 0.9)],
            borderWidth: 0,
            circumference: 360,
            rotation: 0,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: '76%',
        plugins: { legend: { display: false }, tooltip: { enabled: false } },
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

function LEVEL_CHART_COLOR(
  level: HealthLevel,
  theme: { good: string; watch: string; risk: string; gold: string },
): string {
  switch (level) {
    case 'good':
      return theme.good;
    case 'watch':
      return theme.watch;
    case 'risk':
      return theme.risk;
    default:
      return theme.gold;
  }
}
