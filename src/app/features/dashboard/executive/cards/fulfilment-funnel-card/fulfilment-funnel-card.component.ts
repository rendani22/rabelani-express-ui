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
import { ZarCurrencyPipe } from '../../../../../shared/pipes/zar-currency.pipe';
import { FulfilmentFunnel, FunnelStage } from '../../../services/executive-dashboard.service';
import { readExecChartTheme, withAlpha } from '../chart-theme';

Chart.register(...registerables);

/**
 * Order → cash. The current order book flowing through pending → in transit →
 * ready → collected, drawn as ruled stage bars whose brass deepens as value
 * approaches the bank. A Chart.js ring gauge headlines the share that reaches
 * collection.
 */
@Component({
  selector: 'app-fulfilment-funnel-card',
  standalone: true,
  imports: [CommonModule, ZarCurrencyPipe],
  host: { class: 'col-span-12 lg:col-span-8 block' },
  template: `
    <section class="ex-card h-full flex flex-col">
      <header class="px-4 sm:px-6 py-4 border-b flex items-center justify-between gap-4" style="border-color: var(--ex-rule)">
        <div class="flex flex-col gap-1">
          <span class="ex-eyebrow">{{ title }}</span>
          <span class="font-ledger text-xs ex-muted"><span class="tabular-nums">{{ funnel.totalInFunnel }}</span> orders in the pipeline</span>
        </div>
        <div class="relative w-[68px] h-[68px] flex-shrink-0">
          <canvas #gaugeCanvas></canvas>
          <div class="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
            <span class="font-display text-lg leading-none ex-gold tabular-nums">{{ funnel.conversionRate }}%</span>
          </div>
        </div>
      </header>

      <div class="p-4 sm:p-6 flex-1 flex flex-col justify-center">
        @if (funnel.totalInFunnel > 0) {
          <ul class="flex flex-col gap-4">
            @for (s of funnel.stages; track s.key; let i = $index) {
              <li class="flex flex-col gap-1.5">
                <div class="flex items-center justify-between gap-2 text-sm">
                  <span class="flex items-center gap-2 ex-ink-soft">
                    <span class="font-ledger text-[11px] ex-muted">{{ (i + 1) | number: '2.0' }}</span>
                    {{ s.label }}
                  </span>
                  <span class="flex items-center gap-3">
                    @if (s.value !== null) {
                      <span class="font-ledger text-[11px] ex-muted tabular-nums">{{ s.value | zar: 'compact' }}</span>
                    }
                    <span class="font-ledger ex-ink w-10 text-right tabular-nums">{{ s.orders }}</span>
                  </span>
                </div>
                <div class="w-full h-2.5 ex-track rounded-[1px] overflow-hidden">
                  <div
                    class="h-full rounded-[1px] transition-all"
                    [style.width.%]="barWidth(s)"
                    [style.background]="stageColor(i)"
                  ></div>
                </div>
              </li>
            }
          </ul>
        } @else {
          <div class="flex items-center justify-center py-8 ex-muted text-sm">
            No orders in the pipeline
          </div>
        }
      </div>
    </section>
  `,
  styles: [],
})
export class FulfilmentFunnelCardComponent implements AfterViewInit, OnChanges, OnDestroy {
  @Input() title = 'Order to Cash';
  @Input() funnel: FulfilmentFunnel = { stages: [], conversionRate: 0, totalInFunnel: 0 };

  @ViewChild('gaugeCanvas') gaugeCanvas?: ElementRef<HTMLCanvasElement>;

  private gauge: Chart | null = null;

  ngAfterViewInit(): void {
    this.renderGauge();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['funnel'] && !changes['funnel'].firstChange) {
      this.renderGauge();
    }
  }

  ngOnDestroy(): void {
    this.gauge?.destroy();
  }

  /** Keep a sliver of width for non-zero stages so tiny bars stay visible. */
  barWidth(s: FunnelStage): number {
    if (s.orders <= 0) return 0;
    return Math.max(4, s.share);
  }

  /** Brass deepens as the stage nears the bank — pending is faint, collected full. */
  stageColor(index: number): string {
    const steps = Math.max(1, this.funnel.stages.length - 1);
    const pct = 35 + (index / steps) * 65;
    return `color-mix(in srgb, var(--ex-gold) ${pct}%, var(--ex-rule-strong))`;
  }

  private renderGauge(): void {
    if (this.gauge) {
      this.gauge.destroy();
      this.gauge = null;
    }
    setTimeout(() => this.initGauge(), 0);
  }

  private initGauge(): void {
    if (!this.gaugeCanvas?.nativeElement) return;
    const canvas = this.gaugeCanvas.nativeElement;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const theme = readExecChartTheme(canvas);
    const rate = Math.max(0, Math.min(100, this.funnel.conversionRate));

    this.gauge = new Chart(ctx, {
      type: 'doughnut',
      data: {
        datasets: [
          {
            data: [rate, 100 - rate],
            backgroundColor: [theme.gold, withAlpha(theme.rule, 0.9)],
            borderWidth: 0,
            circumference: 360,
            rotation: 0,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: '78%',
        plugins: { legend: { display: false }, tooltip: { enabled: false } },
      },
    });
  }
}
