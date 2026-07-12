import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useLocation, useNavigate } from 'react-router-dom'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { type TourPlacement, type TourStep, useTourStore } from '@/lib/tour-store'

/**
 * Full-screen overlay rendering a spotlight + tooltip for the active tour step.
 *
 * Ported from the Angular `OnboardingTourComponent`:
 * - Highlights the target with a `box-shadow` mask (the "spotlight").
 * - Auto-flips placement when there's not enough room.
 * - Recomputes on scroll, resize and DOM mutations.
 * - Auto-skips steps whose `target` selector can't be resolved.
 *
 * Styled with the Dispatch tokens (cargo-orange `--primary`) instead of the
 * old Angular purple, and mounted once at the app-layout level.
 */

interface SpotlightRect {
  top: number
  left: number
  width: number
  height: number
}

interface TooltipPosition {
  top: number
  left: number
  placement: TourPlacement
  arrowOffset: number
}

const SPOTLIGHT_PADDING = 8
const TOOLTIP_WIDTH = 340
const TOOLTIP_OFFSET = 14
const VIEWPORT_MARGIN = 12
const TOOLTIP_EST_HEIGHT = 210

function placementOrder(preferred: TourPlacement): TourPlacement[] {
  if (preferred === 'center') return ['center']
  const opposites: Record<Exclude<TourPlacement, 'center'>, TourPlacement> = {
    top: 'bottom',
    bottom: 'top',
    left: 'right',
    right: 'left',
  }
  return [preferred, opposites[preferred], 'bottom', 'top', 'right', 'left']
}

function positionFor(
  spot: SpotlightRect,
  placement: TourPlacement,
  tw: number,
  th: number,
): TooltipPosition {
  const cx = spot.left + spot.width / 2
  const cy = spot.top + spot.height / 2
  let top = 0
  let left = 0

  switch (placement) {
    case 'top':
      top = spot.top - th - TOOLTIP_OFFSET
      left = cx - tw / 2
      break
    case 'bottom':
      top = spot.top + spot.height + TOOLTIP_OFFSET
      left = cx - tw / 2
      break
    case 'left':
      top = cy - th / 2
      left = spot.left - tw - TOOLTIP_OFFSET
      break
    case 'right':
      top = cy - th / 2
      left = spot.left + spot.width + TOOLTIP_OFFSET
      break
    case 'center':
      top = window.innerHeight / 2 - th / 2
      left = window.innerWidth / 2 - tw / 2
      break
  }

  const arrowOffset =
    placement === 'top' || placement === 'bottom'
      ? Math.max(16, Math.min(tw - 16, cx - left))
      : Math.max(16, Math.min(th - 16, cy - top))

  return { top, left, placement, arrowOffset }
}

function computeTooltipPosition(spot: SpotlightRect, preferred: TourPlacement): TooltipPosition {
  const vw = window.innerWidth
  const vh = window.innerHeight

  // Centered steps (welcome / finish): pin to the viewport centre point and let
  // the CSS translate(-50%,-50%) centre the card exactly, whatever its size.
  // (Independent of the width/height estimates below, so it can't drift or spill
  // off a small screen.)
  if (preferred === 'center') {
    return { top: vh / 2, left: vw / 2, placement: 'center', arrowOffset: 0 }
  }

  // The card is capped at TOOLTIP_WIDTH but shrinks to fit narrow (mobile)
  // viewports (mirrors the card's `max-w-[calc(100vw-24px)]`). The math must use
  // the same effective width or placement/clamping disagrees with what renders.
  const tw = Math.min(TOOLTIP_WIDTH, vw - 2 * VIEWPORT_MARGIN)
  const th = TOOLTIP_EST_HEIGHT

  for (const placement of placementOrder(preferred)) {
    const pos = positionFor(spot, placement, tw, th)
    if (
      pos.left >= VIEWPORT_MARGIN &&
      pos.top >= VIEWPORT_MARGIN &&
      pos.left + tw <= vw - VIEWPORT_MARGIN &&
      pos.top + th <= vh - VIEWPORT_MARGIN
    ) {
      return pos
    }
  }
  // Fallback: clamp the preferred placement to the viewport.
  const pos = positionFor(spot, preferred, tw, th)
  return {
    ...pos,
    top: Math.max(VIEWPORT_MARGIN, Math.min(pos.top, vh - th - VIEWPORT_MARGIN)),
    left: Math.max(VIEWPORT_MARGIN, Math.min(pos.left, vw - tw - VIEWPORT_MARGIN)),
  }
}

export function OnboardingTour() {
  const isActive = useTourStore((s) => s.isActive)
  const steps = useTourStore((s) => s.steps)
  const stepIndex = useTourStore((s) => s.stepIndex)
  const next = useTourStore((s) => s.next)
  const previous = useTourStore((s) => s.previous)
  const skip = useTourStore((s) => s.skip)
  const complete = useTourStore((s) => s.complete)

  const navigate = useNavigate()
  const location = useLocation()

  const step = isActive ? (steps[stepIndex] ?? null) : null
  const total = steps.length
  const isFirst = stepIndex === 0
  const isLast = stepIndex === total - 1

  const [spotlight, setSpotlight] = useState<SpotlightRect | null>(null)
  const [tooltip, setTooltip] = useState<TooltipPosition | null>(null)
  const rafRef = useRef<number | null>(null)

  const recompute = useCallback(
    (activeStep: TourStep) => {
      // Route step: navigate first; the location effect re-runs recompute.
      if (activeStep.route && location.pathname !== activeStep.route) {
        navigate(activeStep.route)
        return
      }

      // Centered step (welcome / finish).
      if (!activeStep.target) {
        setSpotlight(null)
        setTooltip(computeTooltipPosition({ top: 0, left: 0, width: 0, height: 0 }, 'center'))
        return
      }

      const el = document.querySelector<HTMLElement>(activeStep.target)
      if (!el) {
        // Target missing — retry once after the DOM settles, then auto-skip.
        window.setTimeout(() => {
          const current = useTourStore.getState()
          const stillHere = current.isActive && current.steps[current.stepIndex]?.id === activeStep.id
          if (stillHere && !document.querySelector(activeStep.target!)) current.next()
        }, 450)
        return
      }

      el.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' })

      const rect = el.getBoundingClientRect()
      const spot: SpotlightRect = {
        top: rect.top - SPOTLIGHT_PADDING,
        left: rect.left - SPOTLIGHT_PADDING,
        width: rect.width + SPOTLIGHT_PADDING * 2,
        height: rect.height + SPOTLIGHT_PADDING * 2,
      }
      setSpotlight(spot)
      setTooltip(computeTooltipPosition(spot, activeStep.placement ?? 'bottom'))
    },
    [navigate, location.pathname],
  )

  // Recompute when the active step (or route) changes.
  useEffect(() => {
    if (!step) {
      setSpotlight(null)
      setTooltip(null)
      return
    }
    // Defer until the DOM has settled (e.g. after a route transition).
    const id = window.setTimeout(() => recompute(step), 0)
    return () => window.clearTimeout(id)
  }, [step, recompute])

  // Reposition on scroll / resize / DOM mutations while a target step is shown.
  useEffect(() => {
    if (!isActive) return

    const schedule = () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = null
        const s = useTourStore.getState()
        const current = s.isActive ? s.steps[s.stepIndex] : null
        if (current) recompute(current)
      })
    }

    window.addEventListener('resize', schedule, { passive: true })
    window.addEventListener('scroll', schedule, { passive: true, capture: true })
    const observer = new MutationObserver(schedule)
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['class', 'style', 'hidden'],
    })

    return () => {
      window.removeEventListener('resize', schedule)
      window.removeEventListener('scroll', schedule, true)
      observer.disconnect()
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
    }
  }, [isActive, recompute])

  // Keyboard controls.
  useEffect(() => {
    if (!isActive) return
    const onKey = (e: KeyboardEvent) => {
      switch (e.key) {
        case 'Escape':
          e.preventDefault()
          skip()
          break
        case 'ArrowRight':
        case 'Enter':
          e.preventDefault()
          next()
          break
        case 'ArrowLeft':
          e.preventDefault()
          previous()
          break
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [isActive, next, previous, skip])

  if (!isActive || !step || !tooltip) return null

  const isCenter = tooltip.placement === 'center'

  return createPortal(
    <div
      className="pointer-events-none fixed inset-0"
      style={{ zIndex: 9000 }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="tour-title"
    >
      {/* Spotlight, or a plain backdrop for centered steps. */}
      {spotlight ? (
        <div
          className="pointer-events-none fixed rounded-[10px]"
          style={{
            top: spotlight.top,
            left: spotlight.left,
            width: spotlight.width,
            height: spotlight.height,
            boxShadow:
              '0 0 0 9999px rgba(0,0,0,0.62), 0 0 0 2px var(--primary), 0 0 24px color-mix(in oklab, var(--primary) 55%, transparent)',
            transition:
              'top 220ms cubic-bezier(0.4,0,0.2,1), left 220ms cubic-bezier(0.4,0,0.2,1), width 220ms cubic-bezier(0.4,0,0.2,1), height 220ms cubic-bezier(0.4,0,0.2,1)',
          }}
        />
      ) : (
        <div className="pointer-events-auto absolute inset-0 bg-black/60" />
      )}

      {/* Tooltip card. For target steps `tooltip.top/left` is the top-left
          corner; for centered steps it's the viewport centre point and the
          translate below centres the card exactly. */}
      <div
        className={cn(
          'pointer-events-auto fixed w-[340px] max-w-[calc(100vw-24px)] rounded-xl border bg-popover p-5 text-popover-foreground shadow-2xl',
          'animate-in fade-in-0 zoom-in-95 duration-200',
          isCenter && '-translate-x-1/2 -translate-y-1/2',
        )}
        style={{
          top: tooltip.top,
          left: tooltip.left,
          transition: isCenter
            ? undefined
            : 'top 220ms cubic-bezier(0.4,0,0.2,1), left 220ms cubic-bezier(0.4,0,0.2,1)',
        }}
      >
        <div className="mb-2 flex items-center justify-between">
          <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-primary">
            Step {stepIndex + 1} of {total}
          </span>
          <button
            type="button"
            onClick={skip}
            aria-label="Close tour"
            className="inline-flex size-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <X className="size-4" />
          </button>
        </div>

        <h3 id="tour-title" className="mb-1.5 text-base font-semibold leading-snug tracking-tight">
          {step.title}
        </h3>
        <p className="mb-4 text-sm leading-relaxed text-muted-foreground">{step.body}</p>

        {/* Step dots */}
        <div className="mb-4 flex justify-center gap-1.5" aria-hidden>
          {Array.from({ length: total }).map((_, i) => (
            <span
              key={i}
              className={cn(
                'size-1.5 rounded-full transition-all',
                i === stepIndex ? 'scale-[1.4] bg-primary' : 'bg-muted-foreground/35',
              )}
            />
          ))}
        </div>

        <div className="flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={skip}
            className="rounded-md px-2.5 py-1.5 text-[13px] font-semibold text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            Skip tour
          </button>
          <div className="inline-flex gap-2">
            {!isFirst && (
              <button
                type="button"
                onClick={previous}
                className="rounded-md bg-muted px-3.5 py-1.5 text-[13px] font-semibold text-foreground transition-colors hover:bg-muted/70"
              >
                Back
              </button>
            )}
            <button
              type="button"
              onClick={isLast ? complete : next}
              className="rounded-md bg-primary px-3.5 py-1.5 text-[13px] font-semibold text-primary-foreground shadow-sm transition-colors hover:bg-primary/90"
            >
              {isLast ? 'Get started' : 'Next'}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  )
}
