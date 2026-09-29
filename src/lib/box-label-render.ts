/**
 * Draws box labels laid out by `box-label.ts`.
 *
 * Two outputs, one layout:
 *  - PDF (desktop): vector text, one portrait page per box, the label's size.
 *    Printed through the Labelife D520BT driver over USB — vector keeps the
 *    text crisp at the printer's 203 dpi where a rasterised DOM would blur.
 *  - PNG (mobile): one 203-dpi image per box, handed to the share sheet so it
 *    can be printed from the Labelife app over Bluetooth (a browser cannot
 *    reach a Bluetooth printer itself).
 *
 * jsPDF is imported lazily so it stays out of the main bundle.
 */
import logoUrl from '@/assets/rabelani-mm-logo-mono.png'
import { logger } from '@/lib/logger'
import {
  LABEL_HEIGHT_MM,
  LABEL_WIDTH_MM,
  layoutBoxLabel,
  type BoxLabelData,
} from '@/lib/box-label'

const PT_TO_MM = 25.4 / 72
/** 203 dpi ≈ 8 dots per mm — the D520BT's native resolution. */
const PX_PER_MM = 8
const CANVAS_FONT = 'Helvetica, Arial, sans-serif'

/**
 * The PDF page must be portrait — the sticker as it passes the D520BT's head.
 *
 * Do not lay the label out wide and print a landscape page. Through Chrome +
 * the Mac Labelife driver every landscape page printed blank — whatever the
 * paper size was set to — while Chrome's preview looked perfect (Chrome flags
 * the job landscape and the driver turns it off the sticker). Portrait pages
 * are the only ones that have printed.
 */
const PAGE_SIZE: [number, number] = [LABEL_WIDTH_MM, LABEL_HEIGHT_MM]
if (LABEL_WIDTH_MM > LABEL_HEIGHT_MM) {
  throw new Error('Box labels must be laid out portrait — landscape pages print blank on the D520BT')
}

/**
 * The logo is pre-rendered solid black (rabelani-mm-logo-mono.png): a thermal
 * head can't print the artwork's red, which the driver would dither to a
 * speckled grey. Loaded once; a failed load drops the logo, never the label.
 */
let logoBytes: Promise<Uint8Array | null> | null = null
function loadLogoBytes(): Promise<Uint8Array | null> {
  logoBytes ??= fetch(logoUrl)
    .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(`logo ${r.status}`))))
    .then((b) => new Uint8Array(b))
    .catch((err) => {
      logger.warn('Box label logo failed to load; printing without it', { err: String(err) })
      logoBytes = null
      return null
    })
  return logoBytes
}

export interface BoxLabelPdfOptions {
  /** Logo PNG bytes; loaded from the bundled asset when omitted. */
  readonly logo?: Uint8Array | null
}

/** One PDF, one page per label. */
export async function renderBoxLabelsPdf(
  labels: readonly BoxLabelData[],
  options: BoxLabelPdfOptions = {},
): Promise<Blob> {
  const [{ jsPDF }, logo] = await Promise.all([
    import('jspdf'),
    options.logo !== undefined ? options.logo : loadLogoBytes(),
  ])
  const pdf = new jsPDF({ unit: 'mm', format: PAGE_SIZE, orientation: 'portrait' })

  const setFont = (sizePt: number, bold: boolean) => {
    pdf.setFont('helvetica', bold ? 'bold' : 'normal')
    pdf.setFontSize(sizePt)
  }
  const measure = (text: string, sizePt: number, bold: boolean) => {
    setFont(sizePt, bold)
    return pdf.getTextWidth(text)
  }

  labels.forEach((label, i) => {
    if (i > 0) pdf.addPage(PAGE_SIZE, 'portrait')
    for (const op of layoutBoxLabel(label, measure).ops) {
      pdf.setTextColor(0, 0, 0)
      if (op.kind === 'logo') {
        // Same alias every page, so jsPDF embeds the image once.
        if (logo) pdf.addImage(logo, 'PNG', op.x, op.y, op.width, op.height, 'rabelani-logo', 'FAST')
      } else if (op.kind === 'rule') {
        pdf.setDrawColor(0, 0, 0)
        pdf.setLineWidth(op.weight)
        pdf.line(3, op.y, LABEL_WIDTH_MM - 3, op.y)
      } else {
        setFont(op.sizePt, op.bold)
        pdf.text(op.text, op.x, op.y, { align: op.align, baseline: 'alphabetic' })
      }
    }
  })

  // Opens the print dialog as soon as the PDF viewer loads it.
  pdf.autoPrint()
  return pdf.output('blob')
}

function loadLogoImage(): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => {
      logger.warn('Box label logo failed to load; label image without it')
      resolve(null)
    }
    img.src = logoUrl
  })
}

/** One PNG per label, at the printer's native resolution. */
export async function renderBoxLabelPng(label: BoxLabelData): Promise<Blob> {
  const canvas = document.createElement('canvas')
  canvas.width = LABEL_WIDTH_MM * PX_PER_MM
  canvas.height = LABEL_HEIGHT_MM * PX_PER_MM
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas is not available in this browser')
  const logo = await loadLogoImage()

  const setFont = (sizePt: number, bold: boolean) => {
    ctx.font = `${bold ? 'bold ' : ''}${sizePt * PT_TO_MM * PX_PER_MM}px ${CANVAS_FONT}`
  }
  const measure = (text: string, sizePt: number, bold: boolean) => {
    setFont(sizePt, bold)
    return ctx.measureText(text).width / PX_PER_MM
  }

  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.fillStyle = '#000000'
  ctx.strokeStyle = '#000000'
  ctx.textBaseline = 'alphabetic'

  for (const op of layoutBoxLabel(label, measure).ops) {
    if (op.kind === 'logo') {
      if (logo) ctx.drawImage(logo, op.x * PX_PER_MM, op.y * PX_PER_MM, op.width * PX_PER_MM, op.height * PX_PER_MM)
      continue
    }
    if (op.kind === 'rule') {
      ctx.lineWidth = op.weight * PX_PER_MM
      ctx.beginPath()
      ctx.moveTo(3 * PX_PER_MM, op.y * PX_PER_MM)
      ctx.lineTo((LABEL_WIDTH_MM - 3) * PX_PER_MM, op.y * PX_PER_MM)
      ctx.stroke()
      continue
    }
    setFont(op.sizePt, op.bold)
    ctx.textAlign = op.align
    ctx.fillText(op.text, op.x * PX_PER_MM, op.y * PX_PER_MM)
  }

  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not render the label image'))), 'image/png'),
  )
}

/** File name for a box label, e.g. "PO4500123456-box-2-of-3". */
export function boxLabelFileName(label: BoxLabelData): string {
  const id = (label.poNumber?.trim() ? `PO${label.poNumber.trim()}` : label.reference).replace(/[^\w-]+/g, '')
  return `${id}-box-${label.boxNumber}-of-${label.boxCount}`
}

/**
 * Desktop: open the labels PDF in a new tab, where it auto-opens the print
 * dialog. The tab is opened synchronously by the caller's click (`target`) so
 * popup blockers allow it, then pointed at the PDF once it is rendered.
 */
export async function printBoxLabels(labels: readonly BoxLabelData[], target: Window | null): Promise<void> {
  try {
    const blob = await renderBoxLabelsPdf(labels)
    const url = URL.createObjectURL(blob)
    if (target) target.location.href = url
    else downloadBlob(blob, `${boxLabelFileName(labels[0])}.pdf`)
    // Long enough for the viewer to load it; the tab keeps its own copy.
    setTimeout(() => URL.revokeObjectURL(url), 60_000)
  } catch (err) {
    target?.close()
    throw err
  }
}

/**
 * Mobile: hand one PNG per box to the share sheet (→ Labelife app). Falls back
 * to downloading the images where the Web Share API can't share files.
 * Returns 'shared' | 'downloaded' | 'cancelled'.
 */
export async function shareBoxLabelImages(
  labels: readonly BoxLabelData[],
): Promise<'shared' | 'downloaded' | 'cancelled'> {
  const files = await Promise.all(
    labels.map(async (l) => new File([await renderBoxLabelPng(l)], `${boxLabelFileName(l)}.png`, { type: 'image/png' })),
  )

  if (typeof navigator.canShare === 'function' && navigator.canShare({ files })) {
    try {
      await navigator.share({ files, title: 'Box labels' })
      return 'shared'
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return 'cancelled'
      throw err
    }
  }

  for (const f of files) downloadBlob(f, f.name)
  return 'downloaded'
}

function downloadBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}
