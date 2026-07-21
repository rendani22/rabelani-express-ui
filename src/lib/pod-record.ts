/**
 * The POD record used to render the document *before* the server has stored it.
 *
 * WHY THIS EXISTS
 * The PDF attached to the "order completed" email has to be produced on the
 * client: it is rendered from `<PodDocument>` via html2canvas, and it must be
 * in hand before `update-package` is called, because that same call sends the
 * email. But the pods row does not exist yet at that moment — so the document
 * is rendered from a record assembled here, and `update-package` then persists
 * its own version of the same facts.
 *
 * That is two constructions of one document, and they had already drifted: the
 * emailed POD showed the staff member's email address where the in-app POD
 * showed their name, because this side read `name`/`surname` off a staff
 * profile that only has `full_name`. Every field below therefore names the
 * server expression it mirrors, and the tests assert the mirror rather than
 * trusting the comment.
 *
 * Keep in step with the `podRow` literal in
 * `supabase/functions/update-package/index.ts`.
 */
import type { PodRecord } from '@/lib/models/package'
import { parseNotes } from '@/lib/format'

/** One signing party, as captured by the mark-collected dialog. */
export interface PodParty {
  name: string
  employee_number: string
  phone: string
  /** Base64 PNG data URL from the signature pad. */
  signature: string
}

/** The signer, from `staff_profiles`. Null when the profile could not be read. */
export interface PodStaff {
  user_id: string
  full_name: string
  email: string
  role: string
}

/**
 * Whether the completion is a delivery (driver dropped it off) or a collection
 * (receiver came to the counter).
 *
 * Mirrors update-package: a delivery photo in the notes forces 'Delivered'
 * regardless of what the client asked for, and otherwise the client's value
 * stands. Sending the same rule from here means the value this document renders
 * is the value the server will store, rather than one the server might override
 * a moment later.
 *
 * The `/delivery photo/i` test is deliberately looser than the URL extraction
 * below: notes reading "delivery photo taken" mark the order Delivered while
 * yielding no picture, and that gap is exactly what POD compliance counts.
 */
export function derivePodCompletionStatus(
  notes: string | null | undefined,
  staffRole: string | null | undefined,
): 'Delivered' | 'Collected' {
  if (/delivery photo/i.test(notes ?? '')) return 'Delivered'
  return staffRole === 'driver' ? 'Delivered' : 'Collected'
}

export interface PendingPodInput {
  packageId: string
  /** The notes the order will have after this update — what the server will read. */
  notes: string | null | undefined
  receiver: PodParty
  witness: PodParty
  staff: PodStaff | null
  /** ISO instant of completion; the server stores this same value. */
  collectedAt: string
}

/**
 * Assemble the record `<PodDocument>` renders for the emailed PDF.
 *
 * Only two fields cannot be known before the insert, and neither is visible:
 * `id`, and `pod_reference` (a DB default). The document falls back to
 * `pod_reference` only when the order has neither a PO number nor a reference,
 * which cannot happen — `reference` is NOT NULL.
 */
export function buildPendingPodRecord({
  packageId,
  notes,
  receiver,
  witness,
  staff,
  collectedAt,
}: PendingPodInput): PodRecord {
  return {
    // Server: DB defaults. Not rendered — see the note above.
    id: '',
    pod_reference: null,
    // Server: written later, if at all. Never rendered by the document.
    pdf_url: null,

    package_id: packageId,

    // Server: copied verbatim from the `pod` payload this same call sends.
    receiver_name: receiver.name,
    receiver_employee_number: receiver.employee_number,
    receiver_phone: receiver.phone,
    receiver_signature: receiver.signature,
    witness_name: witness.name,
    witness_employee_number: witness.employee_number,
    witness_phone: witness.phone,
    witness_signature: witness.signature,

    // Server: `pod.collected_at` / `callingUser.id`.
    completed_at: collectedAt,
    completed_by: staff?.user_id ?? null,

    // Server: `callerProfile.full_name ?? 'Unknown'`. Reading the same column
    // is the whole point — this is the field that drifted.
    staff_name: staff?.full_name ?? 'Unknown',

    // Server: same rule, applied to the same notes.
    completion_status: derivePodCompletionStatus(notes, staff?.role),

    // Server: `extractDeliveryPhotoUrl(effectiveNotes)`, whose precedence
    // `parseNotes` mirrors (labelled form first, then bare URLs).
    delivery_photo_url: parseNotes(notes).photoUrls[0] ?? null,
  }
}
