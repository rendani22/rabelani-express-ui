import {
  AfterViewInit,
  Component,
  HostListener,
  NgZone,
  OnDestroy,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { OnboardingTourService, TourPlacement, TourStep } from '../../../core';

interface SpotlightRect {
  readonly top: number;
  readonly left: number;
  readonly width: number;
  readonly height: number;
}

interface TooltipPosition {
  readonly top: number;
  readonly left: number;
  readonly placement: TourPlacement;
  readonly arrowOffset: number;
}

const SPOTLIGHT_PADDING = 8;
const TOOLTIP_WIDTH = 340;
const TOOLTIP_OFFSET = 14;
const VIEWPORT_MARGIN = 12;

/**
 * Full-screen overlay that renders a spotlight + tooltip card for the current
 * step of the {@link OnboardingTourService}.
 *
 * - Highlights the target element using a `box-shadow` mask trick.
 * - Auto-flips placement when there is not enough room.
 * - Recomputes position on scroll, resize and DOM mutations.
 * - Skips steps whose `target` selector cannot be resolved.
 */
@Component({
  selector: 'app-onboarding-tour',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './onboarding-tour.component.html',
  styleUrl: './onboarding-tour.component.css',
})
export class OnboardingTourComponent implements AfterViewInit, OnDestroy {
  private readonly tour = inject(OnboardingTourService);
  private readonly zone = inject(NgZone);

  readonly isActive = this.tour.isActive;
  readonly currentStep = this.tour.currentStep;
  readonly stepIndex = this.tour.stepIndex;
  readonly totalSteps = this.tour.totalSteps;
  readonly isFirstStep = this.tour.isFirstStep;
  readonly isLastStep = this.tour.isLastStep;

  readonly spotlight = signal<SpotlightRect | null>(null);
  readonly tooltip = signal<TooltipPosition | null>(null);

  readonly hasTarget = computed(() => this.spotlight() !== null);

  private rafHandle: number | null = null;
  private mutationObserver: MutationObserver | null = null;
  private readonly scheduledRecompute = () => this.scheduleRecompute();

  constructor() {
    // Recompute positions whenever the active step changes.
    effect(() => {
      const step = this.currentStep();
      if (!step) {
        this.spotlight.set(null);
        this.tooltip.set(null);
        return;
      }
      // Defer until DOM has settled (e.g. after route navigation).
      queueMicrotask(() => this.recompute(step));
    });
  }

  ngAfterViewInit(): void {
    this.zone.runOutsideAngular(() => {
      window.addEventListener('resize', this.scheduledRecompute, { passive: true });
      window.addEventListener('scroll', this.scheduledRecompute, {
        passive: true,
        capture: true,
      });
      this.mutationObserver = new MutationObserver(this.scheduledRecompute);
      this.mutationObserver.observe(document.body, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['class', 'style', 'hidden'],
      });
    });
  }

  ngOnDestroy(): void {
    window.removeEventListener('resize', this.scheduledRecompute);
    window.removeEventListener('scroll', this.scheduledRecompute, true);
    this.mutationObserver?.disconnect();
    if (this.rafHandle !== null) cancelAnimationFrame(this.rafHandle);
  }

  @HostListener('document:keydown', ['$event'])
  onKeydown(event: KeyboardEvent): void {
    if (!this.isActive()) return;
    switch (event.key) {
      case 'Escape':
        event.preventDefault();
        this.tour.skip();
        break;
      case 'ArrowRight':
      case 'Enter':
        event.preventDefault();
        this.tour.next();
        break;
      case 'ArrowLeft':
        event.preventDefault();
        this.tour.previous();
        break;
    }
  }

  next(): void {
    this.tour.next();
  }

  previous(): void {
    this.tour.previous();
  }

  skip(): void {
    this.tour.skip();
  }

  finish(): void {
    this.tour.complete();
  }

  /** Tracks the dialog so re-renders preserve focus when the step changes. */
  trackStep(_: number, step: TourStep): string {
    return step.id;
  }

  private scheduleRecompute(): void {
    if (!this.isActive()) return;
    if (this.rafHandle !== null) cancelAnimationFrame(this.rafHandle);
    this.rafHandle = requestAnimationFrame(() => {
      this.rafHandle = null;
      const step = this.currentStep();
      if (step) {
        this.zone.run(() => this.recompute(step));
      }
    });
  }

  private recompute(step: TourStep): void {
    // Centered step (welcome / finish).
    if (!step.target) {
      this.spotlight.set(null);
      this.tooltip.set({
        top: window.innerHeight / 2,
        left: window.innerWidth / 2,
        placement: 'center',
        arrowOffset: 0,
      });
      return;
    }

    const el = document.querySelector<HTMLElement>(step.target);
    if (!el) {
      // Target missing — auto-skip after a short delay so transient route
      // changes have a chance to mount the element.
      setTimeout(() => {
        if (this.currentStep()?.id === step.id && !document.querySelector(step.target!)) {
          this.tour.next();
        }
      }, 400);
      return;
    }

    // Make sure the target is in view.
    el.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });

    const rect = el.getBoundingClientRect();
    const spot: SpotlightRect = {
      top: rect.top - SPOTLIGHT_PADDING,
      left: rect.left - SPOTLIGHT_PADDING,
      width: rect.width + SPOTLIGHT_PADDING * 2,
      height: rect.height + SPOTLIGHT_PADDING * 2,
    };
    this.spotlight.set(spot);
    this.tooltip.set(this.computeTooltipPosition(spot, step.placement ?? 'bottom'));
  }

  private computeTooltipPosition(
    spot: SpotlightRect,
    preferred: TourPlacement,
  ): TooltipPosition {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const tw = TOOLTIP_WIDTH;
    const th = 200; // estimate; tooltip auto-sizes vertically
    const order: TourPlacement[] = this.placementOrder(preferred);

    for (const placement of order) {
      const pos = this.positionFor(spot, placement, tw, th);
      if (
        pos.left >= VIEWPORT_MARGIN &&
        pos.top >= VIEWPORT_MARGIN &&
        pos.left + tw <= vw - VIEWPORT_MARGIN &&
        pos.top + th <= vh - VIEWPORT_MARGIN
      ) {
        return pos;
      }
    }
    // Fallback: clamp to viewport using the preferred placement.
    const pos = this.positionFor(spot, preferred, tw, th);
    return {
      ...pos,
      top: Math.max(VIEWPORT_MARGIN, Math.min(pos.top, vh - th - VIEWPORT_MARGIN)),
      left: Math.max(VIEWPORT_MARGIN, Math.min(pos.left, vw - tw - VIEWPORT_MARGIN)),
    };
  }

  private placementOrder(preferred: TourPlacement): TourPlacement[] {
    if (preferred === 'center') return ['center'];
    const opposites: Record<Exclude<TourPlacement, 'center'>, TourPlacement> = {
      top: 'bottom',
      bottom: 'top',
      left: 'right',
      right: 'left',
    };
    return [preferred, opposites[preferred], 'bottom', 'top', 'right', 'left'];
  }

  private positionFor(
    spot: SpotlightRect,
    placement: TourPlacement,
    tw: number,
    th: number,
  ): TooltipPosition {
    const cx = spot.left + spot.width / 2;
    const cy = spot.top + spot.height / 2;
    let top = 0;
    let left = 0;

    switch (placement) {
      case 'top':
        top = spot.top - th - TOOLTIP_OFFSET;
        left = cx - tw / 2;
        break;
      case 'bottom':
        top = spot.top + spot.height + TOOLTIP_OFFSET;
        left = cx - tw / 2;
        break;
      case 'left':
        top = cy - th / 2;
        left = spot.left - tw - TOOLTIP_OFFSET;
        break;
      case 'right':
        top = cy - th / 2;
        left = spot.left + spot.width + TOOLTIP_OFFSET;
        break;
      case 'center':
        top = window.innerHeight / 2 - th / 2;
        left = window.innerWidth / 2 - tw / 2;
        break;
    }

    const arrowOffset =
      placement === 'top' || placement === 'bottom'
        ? Math.max(16, Math.min(tw - 16, cx - left))
        : Math.max(16, Math.min(th - 16, cy - top));

    return { top, left, placement, arrowOffset };
  }
}

