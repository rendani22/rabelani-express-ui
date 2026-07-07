/** Shared display formatting, ported from the Angular orders component. */

export function formatDateShort(dateString?: string | null): string {
  if (!dateString) return '—'
  return new Date(dateString).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

export function formatDateTime(dateString?: string | null): string {
  if (!dateString) return '—'
  return new Date(dateString).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

/** Relative time, e.g. "3h ago". */
export function timeAgo(dateString?: string | null): string {
  if (!dateString) return ''
  const then = new Date(dateString).getTime()
  const diff = Date.now() - then
  const mins = Math.round(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.round(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.round(hrs / 24)
  if (days < 30) return `${days}d ago`
  return formatDateShort(dateString)
}

/** "first.last@example.com" → "First Last". */
export function nameFromEmail(email?: string | null): string {
  if (!email) return ''
  const local = email.split('@')[0] ?? ''
  return local
    .replace(/[._-]+/g, ' ')
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase())
}

/**
 * Split package notes into delivery-photo URLs and the remaining text.
 * Ported from the Angular details panel `parseNotes`.
 */
export function parseNotes(notes?: string | null): { photoUrls: string[]; text: string } {
  if (!notes) return { photoUrls: [], text: '' }
  const photoUrls: string[] = []

  const photoPattern = /delivery photo:\s*(https?:\/\/\S+\.(?:jpg|jpeg|png|webp|gif|heic)(?:\?\S*)?)/gi
  let m: RegExpExecArray | null
  while ((m = photoPattern.exec(notes)) !== null) photoUrls.push(m[1])

  if (photoUrls.length === 0) {
    const bare = /(https?:\/\/\S*delivery-photos\/\S+|https?:\/\/\S+\.(?:jpg|jpeg|png|webp|gif|heic)(?:\?\S*)?)/gi
    while ((m = bare.exec(notes)) !== null) photoUrls.push(m[1])
  }

  // strip the "delivery photo: <url>" lines from the visible text
  const text = notes
    .replace(/delivery photo:\s*https?:\/\/\S+/gi, '')
    .replace(/https?:\/\/\S*delivery-photos\/\S+/gi, '')
    .replace(/\n{2,}/g, '\n')
    .trim()

  return { photoUrls, text }
}

/** Deterministic initials + hue for an avatar. */
export function avatarInitials(name: string): { initials: string; hue: number } {
  const safe = (name || 'Receiver').replace(/[^a-zA-Z ]/g, ' ').trim() || 'Receiver'
  const parts = safe.split(/\s+/).filter(Boolean)
  const initials = ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase() || 'R'
  let hash = 0
  for (let i = 0; i < safe.length; i++) hash = (hash * 31 + safe.charCodeAt(i)) | 0
  return { initials, hue: Math.abs(hash) % 360 }
}
