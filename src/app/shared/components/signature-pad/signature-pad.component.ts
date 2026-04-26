import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  HostListener,
  OnDestroy,
  forwardRef,
  input,
  signal,
  viewChild,
} from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';

/**
 * Lightweight canvas-based signature pad with no external dependencies.
 *
 * Implements `ControlValueAccessor` so it can be bound directly to a reactive
 * form control. The control value is a base64 PNG data URL (empty string when
 * the pad is cleared / blank).
 */
@Component({
  selector: 'app-signature-pad',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      // eslint-disable-next-line @typescript-eslint/no-use-before-define
      useExisting: forwardRef(() => SignaturePadComponent),
      multi: true,
    },
  ],
  template: `
    <div class="relative w-full">
      <canvas
        #canvas
        class="block w-full h-40 bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-lg touch-none cursor-crosshair"
        [class.border-red-500]="invalid()"
        (pointerdown)="onPointerDown($event)"
        (pointermove)="onPointerMove($event)"
        (pointerup)="onPointerUp($event)"
        (pointerleave)="onPointerUp($event)"
        (pointercancel)="onPointerUp($event)"
      ></canvas>

      @if (isEmpty()) {
        <p class="pointer-events-none absolute inset-0 flex items-center justify-center text-xs text-gray-400 dark:text-gray-500 select-none">
          {{ placeholder() }}
        </p>
      }

      <div class="mt-2 flex items-center justify-between">
        <span class="text-xs text-gray-500 dark:text-gray-400">
          Sign in the box above
        </span>
        <button
          type="button"
          class="text-xs font-medium text-violet-600 hover:text-violet-700 dark:text-violet-400 dark:hover:text-violet-300 disabled:opacity-50 disabled:cursor-not-allowed"
          [disabled]="isEmpty() || disabled()"
          (click)="clear()"
        >
          Clear
        </button>
      </div>
    </div>
  `,
})
export class SignaturePadComponent implements AfterViewInit, OnDestroy, ControlValueAccessor {
  /** Placeholder text shown when the pad is empty */
  readonly placeholder = input<string>('Draw signature here');

  /** Mark the pad as invalid (used by parent form) */
  readonly invalid = input<boolean>(false);

  private readonly canvasRef = viewChild.required<ElementRef<HTMLCanvasElement>>('canvas');

  private ctx: CanvasRenderingContext2D | null = null;
  private drawing = false;
  private lastX = 0;
  private lastY = 0;
  private pointerId: number | null = null;
  private resizeObserver: ResizeObserver | null = null;

  readonly isEmpty = signal(true);
  readonly disabled = signal(false);

  // ControlValueAccessor callbacks
  private onChange: (value: string) => void = () => {};
  private onTouched: () => void = () => {};

  ngAfterViewInit(): void {
    const canvas = this.canvasRef().nativeElement;
    this.ctx = canvas.getContext('2d');
    this.resizeCanvas();

    // Re-fit on container size changes (e.g. modal open/resize).
    if (typeof ResizeObserver !== 'undefined') {
      this.resizeObserver = new ResizeObserver(() => this.resizeCanvas());
      this.resizeObserver.observe(canvas);
    }
  }

  ngOnDestroy(): void {
    this.resizeObserver?.disconnect();
  }

  @HostListener('window:resize')
  onWindowResize(): void {
    this.resizeCanvas();
  }

  // -------------------------------------------------------------------------
  // ControlValueAccessor
  // -------------------------------------------------------------------------

  writeValue(value: string | null): void {
    if (!value) {
      // Defer in case canvas isn't ready yet.
      queueMicrotask(() => this.clearCanvas());
      return;
    }
    // Loading an existing signature image isn't required for the current
    // workflow; treat any non-empty value as already-rendered and mark
    // non-empty so validators pass.
    this.isEmpty.set(false);
  }

  registerOnChange(fn: (value: string) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  setDisabledState(isDisabled: boolean): void {
    this.disabled.set(isDisabled);
  }

  // -------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------

  /** Clear the canvas and notify the form that the value is empty. */
  clear(): void {
    this.clearCanvas();
    this.onChange('');
    this.onTouched();
  }

  // -------------------------------------------------------------------------
  // Pointer handlers
  // -------------------------------------------------------------------------

  onPointerDown(event: PointerEvent): void {
    if (this.disabled() || !this.ctx) return;
    event.preventDefault();
    const canvas = this.canvasRef().nativeElement;
    canvas.setPointerCapture(event.pointerId);
    this.pointerId = event.pointerId;
    this.drawing = true;
    const { x, y } = this.getPos(event);
    this.lastX = x;
    this.lastY = y;
    // Single-tap dot
    this.ctx.beginPath();
    this.ctx.arc(x, y, 1.2, 0, Math.PI * 2);
    this.ctx.fill();
  }

  onPointerMove(event: PointerEvent): void {
    if (!this.drawing || !this.ctx) return;
    event.preventDefault();
    const { x, y } = this.getPos(event);
    this.ctx.beginPath();
    this.ctx.moveTo(this.lastX, this.lastY);
    this.ctx.lineTo(x, y);
    this.ctx.stroke();
    this.lastX = x;
    this.lastY = y;
    if (this.isEmpty()) {
      this.isEmpty.set(false);
    }
  }

  onPointerUp(event: PointerEvent): void {
    if (!this.drawing) return;
    this.drawing = false;
    const canvas = this.canvasRef().nativeElement;
    if (this.pointerId !== null && canvas.hasPointerCapture(this.pointerId)) {
      canvas.releasePointerCapture(this.pointerId);
    }
    this.pointerId = null;
    if (!this.isEmpty()) {
      const dataUrl = canvas.toDataURL('image/png');
      this.onChange(dataUrl);
    }
    this.onTouched();
  }

  // -------------------------------------------------------------------------
  // Internal helpers
  // -------------------------------------------------------------------------

  private getPos(event: PointerEvent): { x: number; y: number } {
    const canvas = this.canvasRef().nativeElement;
    const rect = canvas.getBoundingClientRect();
    return {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
    };
  }

  private resizeCanvas(): void {
    const canvas = this.canvasRef().nativeElement;
    if (!this.ctx) return;
    const ratio = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;

    // Preserve any existing drawing across resize.
    const previous = this.isEmpty() ? null : canvas.toDataURL('image/png');

    canvas.width = Math.floor(rect.width * ratio);
    canvas.height = Math.floor(rect.height * ratio);
    this.ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.ctx.scale(ratio, ratio);
    this.applyStrokeStyle();

    if (previous) {
      const img = new Image();
      img.onload = () => this.ctx?.drawImage(img, 0, 0, rect.width, rect.height);
      img.src = previous;
    }
  }

  private clearCanvas(): void {
    const canvas = this.canvasRef().nativeElement;
    if (!this.ctx) return;
    this.ctx.save();
    this.ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.ctx.clearRect(0, 0, canvas.width, canvas.height);
    this.ctx.restore();
    this.applyStrokeStyle();
    this.isEmpty.set(true);
  }

  private applyStrokeStyle(): void {
    if (!this.ctx) return;
    this.ctx.lineCap = 'round';
    this.ctx.lineJoin = 'round';
    this.ctx.lineWidth = 2;
    this.ctx.strokeStyle = '#111827'; // gray-900
    this.ctx.fillStyle = '#111827';
  }
}

