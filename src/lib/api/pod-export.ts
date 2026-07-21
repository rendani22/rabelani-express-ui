import JSZip from 'jszip'
import { getPodForPackage } from '@/lib/api/packages'
import { generatePodPdfBlob } from '@/lib/pod-pdf'
import { logger } from '@/lib/logger'
import type { Package } from '@/lib/models/package'

export interface PodExportResult {
  zipped: number
  skipped: number
  /** references that had no proof-of-delivery record */
  skippedRefs: string[]
}

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
 * Bundle proof-of-delivery PDFs for the given packages into a zip and download it.
 * Uses a stored `pdfUrl` when one exists (fast path); otherwise generates the POD
 * PDF client-side from its `pods` record — the same document the single-download
 * dialog produces. Packages with no POD record at all are skipped and reported.
 */
export async function downloadPodsZip(
  packages: Package[],
  filename = 'pods.zip',
): Promise<PodExportResult> {
  const zip = new JSZip()
  let zipped = 0
  const skippedRefs: string[] = []

  for (const pkg of packages) {
    const fileName = `POD-${pkg.reference}${pkg.po_number ? `-${pkg.po_number}` : ''}.pdf`

    // One read serves both paths: the stored PDF's URL lives on the POD row.
    // (It used to come from get_pod_lock_status, which cost a second round trip
    // per package and has been dropped along with the POD lock.)
    let pod
    try {
      pod = await getPodForPackage(pkg.id)
    } catch (err) {
      logger.warn(err, { op: 'pod.zip.fetchRecord', reference: pkg.reference })
      skippedRefs.push(pkg.reference)
      continue
    }
    if (!pod) {
      skippedRefs.push(pkg.reference)
      continue
    }

    // Fast path: a POD PDF was already stored server-side.
    if (pod.pdf_url) {
      try {
        const res = await fetch(pod.pdf_url)
        if (res.ok) {
          zip.file(fileName, await res.blob())
          zipped++
          continue
        }
      } catch (err) {
        // Non-fatal: fall through to client-side generation, but record why.
        logger.warn(err, { op: 'pod.zip.fetchStored', reference: pkg.reference })
      }
    }

    // Otherwise generate it from the POD record.
    try {
      zip.file(fileName, await generatePodPdfBlob(pkg, pod))
      zipped++
    } catch (err) {
      logger.warn(err, { op: 'pod.zip.generate', reference: pkg.reference })
      skippedRefs.push(pkg.reference)
    }
  }

  if (zipped > 0) {
    const blob = await zip.generateAsync({ type: 'blob' })
    saveBlob(blob, filename)
  }

  return { zipped, skipped: skippedRefs.length, skippedRefs }
}
