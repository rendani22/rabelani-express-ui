import { createRoot } from 'react-dom/client'
import type { Package, PodRecord } from '@/lib/models/package'
import { PodDocument } from '@/pages/orders/pod-document'

/**
 * Render a DOM node to a multi-page A4 PDF blob via html2canvas-pro + jsPDF.
 * html2canvas-pro understands Tailwind v4's oklch() colours (plain html2canvas
 * throws on them). Shared by the single-POD dialog and the bulk zip export.
 */
/**
 * html2canvas rasterises whatever has painted *now*, so any image that has not
 * finished loading (the remote Rabelani MM logo in the POD header) would come
 * out blank. Wait for every <img> to settle first; a failed one resolves rather
 * than rejects, so a logo that 404s costs us the mark, not the whole PDF.
 */
async function waitForImages(node: HTMLElement): Promise<void> {
  const pending = [...node.querySelectorAll('img')]
    .filter((img) => !img.complete)
    .map(
      (img) =>
        new Promise<void>((resolve) => {
          img.addEventListener('load', () => resolve(), { once: true })
          img.addEventListener('error', () => resolve(), { once: true })
        }),
    )
  await Promise.all(pending)
}

export async function nodeToPdfBlob(node: HTMLElement): Promise<Blob> {
  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
    import('html2canvas-pro'),
    import('jspdf'),
  ])
  await waitForImages(node)
  const canvas = await html2canvas(node, { scale: 2, useCORS: true, backgroundColor: '#ffffff' })
  const imgData = canvas.toDataURL('image/jpeg', 0.98)
  const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' })
  const pageW = pdf.internal.pageSize.getWidth()
  const pageH = pdf.internal.pageSize.getHeight()
  const imgH = (canvas.height * pageW) / canvas.width

  let heightLeft = imgH
  let position = 0
  pdf.addImage(imgData, 'JPEG', 0, position, pageW, imgH)
  heightLeft -= pageH
  while (heightLeft > 0) {
    position -= pageH
    pdf.addPage()
    pdf.addImage(imgData, 'JPEG', 0, position, pageW, imgH)
    heightLeft -= pageH
  }
  return pdf.output('blob')
}

/**
 * Same document as {@link generatePodPdfBlob}, as raw base64 with no
 * `data:` prefix — the shape `update-package` expects in `pod.pdf_base64`
 * so it can attach the POD to the "Package Completed" email.
 */
export async function generatePodPdfBase64(pkg: Package, pod: PodRecord): Promise<string> {
  const blob = await generatePodPdfBlob(pkg, pod)
  const dataUrl: string = await new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(reader.error ?? new Error('Could not read the POD PDF'))
    reader.readAsDataURL(blob)
  })
  return dataUrl.slice(dataUrl.indexOf(',') + 1)
}

/**
 * Render `<PodDocument>` off-screen and produce its PDF blob. Used to generate
 * PODs client-side for the bulk zip export (PODs are not stored server-side).
 */
export async function generatePodPdfBlob(pkg: Package, pod: PodRecord): Promise<Blob> {
  const host = document.createElement('div')
  // Off-screen but laid out (not display:none) so html2canvas can measure it.
  host.style.cssText = 'position:fixed;left:-10000px;top:0;width:800px;background:#ffffff;z-index:-1;'
  document.body.appendChild(host)
  const root = createRoot(host)
  try {
    await new Promise<void>((resolve) => {
      root.render(<PodDocument pkg={pkg} pod={pod} />)
      // let layout + any data-URI signatures/images paint before capture
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
    })
    await new Promise((r) => setTimeout(r, 60))
    return await nodeToPdfBlob(host)
  } finally {
    root.unmount()
    host.remove()
  }
}
