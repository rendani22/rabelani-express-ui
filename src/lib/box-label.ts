/**
 * Box labels — the 90 × 100 mm sticker warehouse staff put on each box.
 *
 * Pure: no DOM, no jsPDF. This module decides *what* goes where (in mm, font
 * sizes in pt); `box-label-render.ts` draws the result to a PDF page or a PNG.
 * Text measurement is injected so the same layout drives both renderers and
 * tests can use a deterministic fake.
 *
 * Label, upright: PO number and "BOX x OF N" on the left; receiver, delivery
 * location and packed date in a column beside them; the Rabelani logo at the
 * top right; the box's item lines run the full width underneath. Items that don't fit shrink the font
 * down to a readable minimum, then truncate with "+N more items" — always one
 * sticker per box.
 */

/**
 * The label as it is read on the box: upright, on a portrait page — the only
 * page shape that has printed reliably through Chrome + the Mac Labelife
 * driver (see box-label-render.ts).
 */
export const LABEL_WIDTH_MM = 90
export const LABEL_HEIGHT_MM = 100

const MARGIN_MM = 3
/** The PO column may take at most this much, so the details always get room. */
const ID_COLUMN_MAX_MM = 24
const COLUMN_GAP_MM = 3.5
const ID_SIZES_PT = [14, 13, 12, 11, 10]
const BOX_SIZE_PT = 11
/**
 * Receiver / location / date sizes tried in order; each detail takes the
 * largest at which it fits the column beside the PO without being cut off.
 */
export const DETAIL_SIZES_PT = [10, 9, 8, 7] as const
/** Receiver and location may each wrap to this many lines. */
const DETAIL_MAX_LINES = 3
const PT_TO_MM = 25.4 / 72
const LINE_HEIGHT = 1.2

/** Width ÷ height of the logo artwork (src/assets/rabelani-mm-logo-mono.png, 213 × 75). */
export const LOGO_ASPECT = 213 / 75
/** The logo's column, at the top right, beside the receiver / location / date. */
const LOGO_WIDTH_MM = 22
/** Space between the details column and the logo. */
const LOGO_GAP_MM = 2.5

/** Item font sizes tried in order. 7pt is the smallest that reads cleanly at 203 dpi. */
export const ITEM_FONT_SIZES_PT = [10, 9, 8, 7] as const

// ============================================================================
// Box allocation — how much of each package item is boxed / still unboxed.
// ============================================================================

export interface BoxableItem {
  readonly id: string
  readonly description: string
  readonly quantity: number
}

export interface BoxContentLine {
  readonly package_item_id: string
  readonly quantity: number
}

export interface PackageBox {
  readonly id: string
  readonly package_id: string
  readonly box_number: number
  readonly packed_at: string
  readonly items: readonly BoxContentLine[]
}

export interface ItemAllocation {
  readonly item: BoxableItem
  readonly boxed: number
  readonly unboxed: number
}

/**
 * Per package item: how many are in boxes and how many are still loose.
 * `excludeBoxId` leaves one box out — the box being edited — so its editor can
 * show how many are available to it.
 */
export function allocateItems(
  items: readonly BoxableItem[],
  boxes: readonly PackageBox[],
  excludeBoxId?: string,
): ItemAllocation[] {
  const boxed = new Map<string, number>()
  for (const box of boxes) {
    if (box.id === excludeBoxId) continue
    for (const line of box.items) {
      boxed.set(line.package_item_id, (boxed.get(line.package_item_id) ?? 0) + line.quantity)
    }
  }
  return items.map((item) => {
    const b = boxed.get(item.id) ?? 0
    return { item, boxed: b, unboxed: Math.max(0, item.quantity - b) }
  })
}

/** Allocations with something still to pack — drives the "Unboxed: …" warning. */
export function unboxedItems(allocations: readonly ItemAllocation[]): ItemAllocation[] {
  return allocations.filter((a) => a.unboxed > 0)
}

// ============================================================================
// Label content
// ============================================================================

export interface BoxLabelData {
  readonly poNumber: string | null | undefined
  /** Package reference — printed in place of the PO when the order has none. */
  readonly reference: string
  readonly boxNumber: number
  readonly boxCount: number
  readonly receiverName: string
  readonly locationName: string | null | undefined
  readonly packedAt: string
  readonly items: readonly { readonly quantity: number; readonly description: string }[]
}

/** Builds one label's data per box, in box order, with the box's item lines resolved. */
export function buildBoxLabels(
  pkg: { readonly po_number?: string | null; readonly reference: string },
  items: readonly BoxableItem[],
  boxes: readonly PackageBox[],
  receiverName: string,
  locationName: string | null | undefined,
): BoxLabelData[] {
  const byId = new Map(items.map((i) => [i.id, i]))
  const ordered = [...boxes].sort((a, b) => a.box_number - b.box_number)
  return ordered.map((box) => ({
    poNumber: pkg.po_number,
    reference: pkg.reference,
    boxNumber: box.box_number,
    boxCount: ordered.length,
    receiverName,
    locationName,
    packedAt: box.packed_at,
    items: box.items.flatMap((line) => {
      const item = byId.get(line.package_item_id)
      return item ? [{ quantity: line.quantity, description: item.description }] : []
    }),
  }))
}

/** "29 Sep 2026" — fixed format so every label in the depot reads the same. */
export function formatPackedDate(iso: string): string {
  const d = new Date(iso)
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`
}

// ============================================================================
// Layout
// ============================================================================

/** Width of `text` in mm at `sizePt`. */
export type MeasureText = (text: string, sizePt: number, bold: boolean) => number

export type LabelOp =
  | {
      readonly kind: 'text'
      readonly text: string
      /** Left edge, or right edge when `align` is 'right'. */
      readonly x: number
      /** Baseline. */
      readonly y: number
      readonly sizePt: number
      readonly bold: boolean
      readonly align: 'left' | 'right'
    }
  | { readonly kind: 'rule'; readonly y: number; readonly weight: number }
  /** The Rabelani logo; x/y are its top-left corner. */
  | { readonly kind: 'logo'; readonly x: number; readonly y: number; readonly width: number; readonly height: number }

/** Trims `text` with an ellipsis until it fits in `maxWidth` mm. */
export function fitText(text: string, maxWidth: number, sizePt: number, bold: boolean, measure: MeasureText): string {
  if (measure(text, sizePt, bold) <= maxWidth) return text
  let end = text.length
  while (end > 0 && measure(`${text.slice(0, end).trimEnd()}…`, sizePt, bold) > maxWidth) end--
  return `${text.slice(0, end).trimEnd()}…`
}

/**
 * Greedy word-wrap into at most `maxLines` lines of `maxWidth` mm. A word too
 * long for a line, or text left over after the last line, ends in an ellipsis.
 */
export function wrapText(
  text: string,
  maxWidth: number,
  sizePt: number,
  bold: boolean,
  measure: MeasureText,
  maxLines: number,
): string[] {
  const words = text.split(/\s+/).filter(Boolean)
  const lines: string[] = []
  let i = 0
  while (i < words.length && lines.length < maxLines) {
    let line = words[i++]
    while (i < words.length && measure(`${line} ${words[i]}`, sizePt, bold) <= maxWidth) line += ` ${words[i++]}`
    const last = lines.length === maxLines - 1
    // On the last line, anything still unplaced is folded in and cut with "…".
    if (last && i < words.length) line = `${line} ${words.slice(i).join(' ')}`
    lines.push(fitText(line, maxWidth, sizePt, bold, measure))
  }
  return lines
}

/** Largest size in `sizes` at which `text` fits in `maxWidth`, else the smallest. */
function fitSize(text: string, maxWidth: number, sizes: readonly number[], bold: boolean, measure: MeasureText): number {
  return sizes.find((s) => measure(text, s, bold) <= maxWidth) ?? sizes[sizes.length - 1]
}

const lineMm = (sizePt: number) => sizePt * PT_TO_MM * LINE_HEIGHT
const capMm = (sizePt: number) => sizePt * PT_TO_MM * 0.75

export interface BoxLabelLayout {
  readonly ops: readonly LabelOp[]
  /** Item font size actually used. */
  readonly itemSizePt: number
  /** Item lines left off and summarised as "+N more items". */
  readonly hiddenItems: number
}

export function layoutBoxLabel(data: BoxLabelData, measure: MeasureText): BoxLabelLayout {
  const ops: LabelOp[] = []
  const left = MARGIN_MM
  const right = LABEL_WIDTH_MM - MARGIN_MM
  const text = (t: string, y: number, sizePt: number, bold: boolean) =>
    ops.push({ kind: 'text', text: t, x: left, y, sizePt, bold, align: 'left' })

  // --- left: PO number (the thing people read from across the floor) + box count ---
  // No caption: a PO number and a package reference (RX-…) are told apart by shape.
  const idText = data.poNumber?.trim() || data.reference
  const idSize = fitSize(idText, ID_COLUMN_MAX_MM, ID_SIZES_PT, true, measure)
  const id = fitText(idText, ID_COLUMN_MAX_MM, idSize, true, measure)
  const boxText = `BOX ${data.boxNumber} OF ${data.boxCount}`
  const idY = MARGIN_MM + capMm(idSize)
  const boxY = idY + 2 + capMm(BOX_SIZE_PT)
  text(id, idY, idSize, true)
  text(boxText, boxY, BOX_SIZE_PT, true)

  // --- right: receiver / location / date, in a column beside the PO ---
  const columnWidth = Math.min(ID_COLUMN_MAX_MM, Math.max(measure(id, idSize, true), measure(boxText, BOX_SIZE_PT, true)))
  const detailsX = left + columnWidth + COLUMN_GAP_MM
  // The logo takes the top-right corner; the details fill the space between.
  const logoX = right - LOGO_WIDTH_MM
  const logoHeight = LOGO_WIDTH_MM / LOGO_ASPECT
  ops.push({ kind: 'logo', x: logoX, y: MARGIN_MM, width: LOGO_WIDTH_MM, height: logoHeight })
  const detailsWidth = logoX - LOGO_GAP_MM - detailsX
  // Bare date: "Packed …" doesn't fit the narrow column.
  const details = [
    { text: data.receiverName, bold: true, maxLines: DETAIL_MAX_LINES },
    { text: data.locationName?.trim() ?? '', bold: false, maxLines: DETAIL_MAX_LINES },
    { text: formatPackedDate(data.packedAt), bold: false, maxLines: 1 },
  ]
  // Each detail gets its own size: the largest at which it fits uncut, so a
  // long location doesn't drag a short receiver name down with it.
  const normalized = (t: string) => t.split(/\s+/).filter(Boolean).join(' ')
  const fitted = details.map((d) => {
    const wrapAt = (sizePt: number) => wrapText(d.text, detailsWidth, sizePt, d.bold, measure, d.maxLines)
    const sizePt: number =
      DETAIL_SIZES_PT.find((sz) => wrapAt(sz).join(' ') === normalized(d.text)) ??
      DETAIL_SIZES_PT[DETAIL_SIZES_PT.length - 1]
    return { ...d, sizePt, lines: wrapAt(sizePt) }
  })
  // The date never outranks the receiver / location above it.
  const [receiverFit, locationFit, dateFit] = fitted
  const cap = Math.min(...[receiverFit, locationFit].filter((d) => d.lines.length > 0).map((d) => d.sizePt))
  dateFit.sizePt = Math.min(dateFit.sizePt, cap)

  let dy = MARGIN_MM
  let first = true
  for (const d of fitted) {
    for (const line of d.lines) {
      dy += first ? capMm(d.sizePt) : lineMm(d.sizePt)
      first = false
      ops.push({ kind: 'text', text: line, x: detailsX, y: dy, sizePt: d.sizePt, bold: d.bold, align: 'left' })
    }
  }

  const y = Math.max(boxY, dy, MARGIN_MM + logoHeight) + 2
  ops.push({ kind: 'rule', y, weight: 0.4 })

  // --- items: shrink, then truncate ---
  const itemsTop = y + 1.5
  const itemsBottom = LABEL_HEIGHT_MM - MARGIN_MM
  const available = itemsBottom - itemsTop

  const fitsAt = (sizePt: number) => Math.max(0, Math.floor((available - capMm(sizePt)) / lineMm(sizePt)) + 1)
  const itemSizePt =
    ITEM_FONT_SIZES_PT.find((s) => fitsAt(s) >= data.items.length) ??
    ITEM_FONT_SIZES_PT[ITEM_FONT_SIZES_PT.length - 1]
  const capacity = fitsAt(itemSizePt)
  const overflow = data.items.length > capacity
  // Truncating costs one line for the "+N more" note.
  const shown = overflow ? data.items.slice(0, Math.max(0, capacity - 1)) : data.items
  const hiddenItems = data.items.length - shown.length

  // Quantities right-align in a column sized to the widest one.
  const qtyWidth = Math.max(0, ...shown.map((it) => measure(`${it.quantity} ×`, itemSizePt, true)))
  const descLeft = left + qtyWidth + 1.5
  let iy = itemsTop + capMm(itemSizePt)
  for (const it of shown) {
    ops.push({ kind: 'text', text: `${it.quantity} ×`, x: left + qtyWidth, y: iy, sizePt: itemSizePt, bold: true, align: 'right' })
    ops.push({
      kind: 'text',
      text: fitText(it.description, right - descLeft, itemSizePt, false, measure),
      x: descLeft,
      y: iy,
      sizePt: itemSizePt,
      bold: false,
      align: 'left',
    })
    iy += lineMm(itemSizePt)
  }
  // Overflow always hides >= 2 lines (the note takes one), so always plural.
  if (hiddenItems > 0) text(`+${hiddenItems} more items`, iy, itemSizePt, true)

  return { ops, itemSizePt, hiddenItems }
}
