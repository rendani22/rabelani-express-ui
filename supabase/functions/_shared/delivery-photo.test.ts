import { describe, expect, it } from 'vitest'
import { extractDeliveryPhotoUrl } from './delivery-photo'

describe('extractDeliveryPhotoUrl', () => {
  it('returns null for empty notes', () => {
    expect(extractDeliveryPhotoUrl(null)).toBeNull()
    expect(extractDeliveryPhotoUrl(undefined)).toBeNull()
    expect(extractDeliveryPhotoUrl('')).toBeNull()
  })

  it('extracts the labelled form', () => {
    expect(extractDeliveryPhotoUrl('Left at door\nDelivery Photo: https://cdn.example.com/a.jpg')).toBe(
      'https://cdn.example.com/a.jpg',
    )
  })

  it('is case-insensitive and tolerates extra whitespace', () => {
    expect(extractDeliveryPhotoUrl('delivery photo:   https://cdn.example.com/a.PNG')).toBe(
      'https://cdn.example.com/a.PNG',
    )
  })

  it('keeps a query string on the URL', () => {
    expect(extractDeliveryPhotoUrl('delivery photo: https://cdn.example.com/a.jpg?token=x&y=1')).toBe(
      'https://cdn.example.com/a.jpg?token=x&y=1',
    )
  })

  it('returns the first when several are present', () => {
    const notes = 'delivery photo: https://cdn.example.com/a.jpg\ndelivery photo: https://cdn.example.com/b.png'
    expect(extractDeliveryPhotoUrl(notes)).toBe('https://cdn.example.com/a.jpg')
  })

  it('falls back to a bare delivery-photos storage URL with no label', () => {
    expect(extractDeliveryPhotoUrl('see https://x.supabase.co/storage/v1/delivery-photos/abc123')).toBe(
      'https://x.supabase.co/storage/v1/delivery-photos/abc123',
    )
  })

  it('falls back to a bare image URL with no label', () => {
    expect(extractDeliveryPhotoUrl('photo at https://cdn.example.com/proof.heic')).toBe(
      'https://cdn.example.com/proof.heic',
    )
  })

  it('prefers the labelled URL over an unrelated bare image URL', () => {
    const notes = 'ref https://cdn.example.com/logo.png\ndelivery photo: https://cdn.example.com/real.jpg'
    expect(extractDeliveryPhotoUrl(notes)).toBe('https://cdn.example.com/real.jpg')
  })

  // The distinction the compliance metric rests on: update-package's
  // /delivery photo/i check marks this POD 'Delivered', but there is no
  // picture, so it must count as a delivery missing its evidence.
  it('returns null when the notes mention a photo but carry no URL', () => {
    expect(extractDeliveryPhotoUrl('delivery photo taken at the gate')).toBeNull()
    expect(extractDeliveryPhotoUrl('no photo, receiver signed')).toBeNull()
  })

  it('ignores non-image links', () => {
    expect(extractDeliveryPhotoUrl('tracking at https://example.com/orders/123')).toBeNull()
  })
})
