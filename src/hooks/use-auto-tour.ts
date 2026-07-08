import { useEffect } from 'react'
import { type TourId, useTourStore } from '@/lib/tour-store'

/**
 * Auto-launch a page's onboarding tour for first-time visitors. No-op once the
 * tour has been completed (or skipped). Delayed briefly so the page and its
 * `data-tour` anchors mount before the spotlight tries to find them.
 */
export function useAutoTour(id: TourId) {
  const start = useTourStore((s) => s.start)
  useEffect(() => {
    const t = window.setTimeout(() => start(id), 500)
    return () => window.clearTimeout(t)
  }, [id, start])
}
