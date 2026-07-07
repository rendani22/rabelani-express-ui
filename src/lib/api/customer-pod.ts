import { supabase } from '@/lib/supabase'
import { generatePodPdfBlob } from '@/lib/pod-pdf'
import type { Package, PodRecord } from '@/lib/models/package'

/** Trigger a browser download of a blob. */
function saveBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/**
 * Fetch the entitlement-checked POD payload for one of the customer's own
 * collected/delivered packages (via the customer-pod edge function), render the
 * POD PDF client-side, and download it. Throws with a user-facing message on
 * any failure (not entitled, no POD yet, etc.).
 */
export async function downloadCustomerPod(packageId: string, poNumber: string | null): Promise<void> {
  const { data, error } = await supabase.functions.invoke('customer-pod', {
    body: { package_id: packageId },
  })
  if (error) throw error
  if (!data || data.error) throw new Error(data?.error ?? 'Could not load the proof of delivery')

  const blob = await generatePodPdfBlob(data.package as Package, data.pod as PodRecord)
  const label = poNumber?.trim() || packageId.slice(0, 8)
  saveBlob(blob, `POD-${label}.pdf`)
}
