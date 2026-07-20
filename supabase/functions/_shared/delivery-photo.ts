/**
 * Delivery-photo extraction from free-text package notes.
 *
 * Historically the delivery photo had nowhere to live: the driver flow inlined
 * its URL into `packages.notes` and every consumer re-discovered it by regex.
 * `pods.delivery_photo_url` now holds it, and this is the single parser that
 * fills that column -- on write in update-package, and on backfill in
 * 20260717160000_pod_delivery_photo_compliance.sql (whose SQL regexes mirror
 * the precedence below; keep the two in step).
 *
 * The client-side `parseNotes` in src/lib/format.ts intentionally stays: it
 * also strips the photo lines out of the notes for display, and it reads the
 * legacy blob for orders whose POD predates the column. The URL precedence
 * here mirrors it. (The edge functions deploy from a separate root and cannot
 * import from src/, hence the deliberate duplication.)
 */

/** Image extensions the driver flow is known to upload. */
const IMAGE_EXT = String.raw`\.(?:jpg|jpeg|png|webp|gif|heic)(?:\?\S*)?`

/**
 * Ordered most- to least-explicit. The labelled form is authoritative; the
 * bare forms exist because older notes were written without the label.
 */
const PATTERNS: RegExp[] = [
  new RegExp(String.raw`delivery photo:\s*(https?://\S+${IMAGE_EXT})`, 'i'),
  new RegExp(String.raw`(https?://\S*delivery-photos/\S+)`, 'i'),
  new RegExp(String.raw`(https?://\S+${IMAGE_EXT})`, 'i'),
]

/**
 * The first delivery-photo URL in `notes`, or null when there is none.
 *
 * Returns null for notes that merely mention a photo without carrying a URL
 * ("delivery photo taken"). That is a true negative and the distinction the
 * compliance metric rests on: the words are not the picture. Note this is
 * strictly narrower than update-package's `/delivery photo/i` completion-status
 * check -- such a note yields completion_status 'Delivered' with a NULL
 * delivery_photo_url, which is precisely a delivery missing its evidence.
 */
export function extractDeliveryPhotoUrl(notes?: string | null): string | null {
  if (!notes) return null
  for (const pattern of PATTERNS) {
    const match = pattern.exec(notes)
    if (match) return match[1]
  }
  return null
}
