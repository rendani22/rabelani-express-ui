import { describe, expect, it } from 'vitest'
import { buildPendingPodRecord, derivePodCompletionStatus, type PodStaff } from './pod-record'

const receiver = { name: 'Naledi Khumalo', employee_number: 'E1042', phone: '0821112222', signature: 'data:image/png;base64,rr' }
const witness = { name: 'Sipho Dlamini', employee_number: 'E2088', phone: '0833334444', signature: 'data:image/png;base64,ww' }
const staff: PodStaff = {
  user_id: 'user-1',
  full_name: 'Thabo Nkosi',
  email: 'thabo@rabelani.co.za',
  role: 'warehouse',
}

const build = (over: Partial<Parameters<typeof buildPendingPodRecord>[0]> = {}) =>
  buildPendingPodRecord({
    packageId: 'pkg-1',
    notes: null,
    receiver,
    witness,
    staff,
    collectedAt: '2026-07-21T10:00:00.000Z',
    ...over,
  })

describe('derivePodCompletionStatus', () => {
  it('is a delivery when the notes mention a delivery photo, whoever completed it', () => {
    expect(derivePodCompletionStatus('delivery photo: https://x/a.jpg', 'warehouse')).toBe('Delivered')
  })

  // The looser test on purpose: the words are not the picture, but they still
  // mean a driver dropped it off.
  it('is a delivery on the words alone, with no URL', () => {
    expect(derivePodCompletionStatus('delivery photo taken', 'warehouse')).toBe('Delivered')
  })

  it('is a delivery when a driver completed it without a photo', () => {
    expect(derivePodCompletionStatus('handed over', 'driver')).toBe('Delivered')
  })

  it('is a collection otherwise', () => {
    expect(derivePodCompletionStatus('collected at the counter', 'warehouse')).toBe('Collected')
    expect(derivePodCompletionStatus(null, null)).toBe('Collected')
    expect(derivePodCompletionStatus(undefined, undefined)).toBe('Collected')
  })
})

describe('buildPendingPodRecord', () => {
  // The regression this module exists for: the emailed POD showed the staff
  // member's email where the in-app POD showed their name, because this side
  // read name/surname off a profile that only has full_name.
  it('signs the document with the staff full name, never the email', () => {
    const pod = build()
    expect(pod.staff_name).toBe('Thabo Nkosi')
    expect(pod.staff_name).not.toBe(staff.email)
  })

  it("matches the server's 'Unknown' when there is no staff profile", () => {
    const pod = build({ staff: null })
    expect(pod.staff_name).toBe('Unknown')
    expect(pod.completed_by).toBeNull()
    expect(pod.completion_status).toBe('Collected')
  })

  it('carries both parties through verbatim', () => {
    const pod = build()
    expect(pod).toMatchObject({
      package_id: 'pkg-1',
      receiver_name: 'Naledi Khumalo',
      receiver_employee_number: 'E1042',
      receiver_phone: '0821112222',
      receiver_signature: receiver.signature,
      witness_name: 'Sipho Dlamini',
      witness_employee_number: 'E2088',
      witness_phone: '0833334444',
      witness_signature: witness.signature,
      completed_at: '2026-07-21T10:00:00.000Z',
      completed_by: 'user-1',
    })
  })

  it('lifts the delivery photo out of the notes, as the server does', () => {
    expect(build({ notes: 'delivery photo: https://x/a.jpg' }).delivery_photo_url).toBe('https://x/a.jpg')
  })

  it('has no photo when the notes carry none', () => {
    expect(build({ notes: 'left with reception' }).delivery_photo_url).toBeNull()
  })

  it('leaves the two server-generated fields empty — neither is rendered', () => {
    const pod = build()
    expect(pod.id).toBe('')
    expect(pod.pod_reference).toBeNull()
    expect(pod.pdf_url).toBeNull()
  })

  it('derives the completion status from the same notes it renders', () => {
    expect(build({ notes: 'delivery photo: https://x/a.jpg' }).completion_status).toBe('Delivered')
    expect(build({ notes: 'counter' }).completion_status).toBe('Collected')
  })
})
