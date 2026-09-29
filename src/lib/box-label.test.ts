import { describe, expect, it } from 'vitest'
import {
  DETAIL_SIZES_PT,
  ITEM_FONT_SIZES_PT,
  LOGO_ASPECT,
  LABEL_HEIGHT_MM,
  LABEL_WIDTH_MM,
  allocateItems,
  buildBoxLabels,
  fitText,
  wrapText,
  formatPackedDate,
  layoutBoxLabel,
  unboxedItems,
  type BoxLabelData,
  type LabelOp,
  type MeasureText,
  type PackageBox,
} from './box-label'

/** Deterministic stand-in for font metrics: every glyph is 0.2 mm per pt. */
const measure: MeasureText = (text, sizePt, bold) => text.length * sizePt * 0.2 * (bold ? 1.1 : 1)

const items = [
  { id: 'hat', description: 'Hard hat', quantity: 10 },
  { id: 'boot', description: 'Safety boots', quantity: 4 },
  { id: 'vest', description: 'Hi-vis vest', quantity: 2 },
]

const box = (id: string, n: number, lines: [string, number][]): PackageBox => ({
  id,
  package_id: 'pkg',
  box_number: n,
  packed_at: '2026-09-29T08:00:00Z',
  items: lines.map(([package_item_id, quantity]) => ({ package_item_id, quantity })),
})

const label = (over: Partial<BoxLabelData> = {}): BoxLabelData => ({
  poNumber: '4500123456',
  reference: 'RX-0001',
  boxNumber: 2,
  boxCount: 3,
  receiverName: 'Jane Mokoena',
  locationName: 'Polokwane Depot',
  packedAt: '2026-09-29T08:00:00Z',
  items: [{ quantity: 12, description: 'Hard hat' }],
  ...over,
})

const texts = (ops: readonly LabelOp[]) =>
  ops.flatMap((o) => (o.kind === 'text' ? [o.text] : []))

describe('allocateItems', () => {
  const boxes = [box('b1', 1, [['hat', 6], ['boot', 4]]), box('b2', 2, [['hat', 4]])]

  it('sums boxed quantity per item across boxes', () => {
    expect(allocateItems(items, boxes).map((a) => [a.item.id, a.boxed, a.unboxed])).toEqual([
      ['hat', 10, 0],
      ['boot', 4, 0],
      ['vest', 0, 2],
    ])
  })

  it('leaves out the box being edited', () => {
    expect(allocateItems(items, boxes, 'b1').map((a) => a.unboxed)).toEqual([6, 4, 2])
  })

  it('never reports negative unboxed', () => {
    expect(allocateItems(items, [box('b', 1, [['vest', 5]])])[2].unboxed).toBe(0)
  })

  it('unboxedItems keeps only what is left to pack', () => {
    expect(unboxedItems(allocateItems(items, boxes)).map((a) => a.item.id)).toEqual(['vest'])
  })
})

describe('buildBoxLabels', () => {
  it('builds one label per box in box order with resolved item lines', () => {
    const boxes = [box('b2', 2, [['vest', 1]]), box('b1', 1, [['hat', 3], ['gone', 1]])]
    const labels = buildBoxLabels({ po_number: 'PO1', reference: 'RX-1' }, items, boxes, 'Jane', 'Depot')
    expect(labels.map((l) => [l.boxNumber, l.boxCount])).toEqual([[1, 2], [2, 2]])
    // a line whose package item no longer exists is dropped
    expect(labels[0].items).toEqual([{ quantity: 3, description: 'Hard hat' }])
    expect(labels[1]).toMatchObject({ poNumber: 'PO1', reference: 'RX-1', receiverName: 'Jane', locationName: 'Depot' })
  })
})

describe('formatPackedDate', () => {
  it('formats as d MMM yyyy', () => {
    expect(formatPackedDate('2026-09-29T08:00:00')).toBe('29 Sep 2026')
    expect(formatPackedDate('2026-01-05T12:00:00')).toBe('5 Jan 2026')
  })
})

describe('fitText', () => {
  it('returns text that already fits untouched', () => {
    expect(fitText('Hard hat', 100, 9, false, measure)).toBe('Hard hat')
  })

  it('trims with an ellipsis to fit', () => {
    const out = fitText('Safety boots size nine', 20, 9, false, measure)
    expect(out.endsWith('…')).toBe(true)
    expect(measure(out, 9, false)).toBeLessThanOrEqual(20)
  })

  it('falls back to a bare ellipsis when nothing fits', () => {
    expect(fitText('Anything', 0, 9, false, measure)).toBe('…')
  })
})

describe('wrapText', () => {
  // 1 mm per glyph at 5pt (0.2 × 5), so maxWidth is a character budget.
  const wrap = (t: string, width: number, lines: number) => wrapText(t, width, 5, false, measure, lines)

  it('keeps text that fits on one line', () => {
    expect(wrap('Jane Mokoena', 20, 2)).toEqual(['Jane Mokoena'])
  })

  it('breaks between words', () => {
    expect(wrap('Polokwane Depot Gate 4', 15, 2)).toEqual(['Polokwane Depot', 'Gate 4'])
  })

  it('folds leftovers into the last line and cuts it with an ellipsis', () => {
    const out = wrap('Polokwane Depot Gate 4 receiving bay', 15, 2)
    expect(out[0]).toBe('Polokwane Depot')
    expect(out[1].startsWith('Gate 4') && out[1].endsWith('…')).toBe(true)
    expect(out[1].length).toBeLessThanOrEqual(15)
  })

  it('cuts a single word that is too long', () => {
    expect(wrap('Supercalifragilistic', 10, 2)[0].endsWith('…')).toBe(true)
  })

  it('returns no lines for empty text', () => {
    expect(wrap('   ', 10, 2)).toEqual([])
  })
})

describe('layoutBoxLabel', () => {
  it('prints PO, box count, receiver, location, date and items', () => {
    // Short details, so each sits on one line in the narrow column.
    const t = texts(layoutBoxLabel(label({ receiverName: 'Jo', locationName: 'Depot' }), measure).ops)
    expect(t).toEqual([
      '4500123456',
      'PACK 2 OF 3',
      'Jo',
      'Depot',
      '29 Sep 2026',
      '12 ×',
      'Hard hat',
    ])
  })

  it('keeps every op inside the label', () => {
    const many = label({ items: Array.from({ length: 40 }, (_, i) => ({ quantity: i + 1, description: `Item ${i}` })) })
    for (const op of layoutBoxLabel(many, measure).ops) {
      expect(op.y).toBeGreaterThan(0)
      expect(op.y).toBeLessThanOrEqual(LABEL_HEIGHT_MM)
      if (op.kind === 'text') {
        const w = measure(op.text, op.sizePt, op.bold)
        const leftEdge = op.align === 'left' ? op.x : op.x - w
        expect(leftEdge).toBeGreaterThanOrEqual(0)
        expect(leftEdge + w).toBeLessThanOrEqual(LABEL_WIDTH_MM)
      }
    }
  })

  it('puts receiver, location and date beside the PO number, above the items', () => {
    const ops = layoutBoxLabel(label({ receiverName: 'Jo', locationName: 'Depot' }), measure).ops.filter(
      (o) => o.kind === 'text',
    )
    const at = (t: string) => ops.find((o) => o.text === t)!
    const po = at('4500123456')
    const box = at('PACK 2 OF 3')
    for (const t of ['Jo', 'Depot', '29 Sep 2026']) {
      expect(at(t).x).toBeGreaterThan(po.x + measure(po.text, po.sizePt, true))
      expect(at(t).x).toBeGreaterThan(box.x + measure(box.text, box.sizePt, true))
      expect(at(t).y).toBeLessThan(at('Hard hat').y)
    }
  })

  const textOps = (d: Partial<BoxLabelData>) =>
    layoutBoxLabel(label(d), measure).ops.filter((o): o is Extract<LabelOp, { kind: 'text' }> => o.kind === 'text')

  it('sizes each detail independently, as large as it fits uncut', () => {
    // Fake metric: the details column is ~32 mm, i.e. ~16 glyphs at 10pt.
    const place = 'Polokwane Depot Gate Four Receiving Bay North Wing'
    const ops = textOps({ receiverName: 'Jo Ann', locationName: place })
    const receiver = ops.find((o) => o.text === 'Jo Ann')!
    const location = ops.filter((o) => !o.bold && /Polokwane|Depot|Gate|Four|Receiving|North/.test(o.text))
    expect(receiver.sizePt).toBe(DETAIL_SIZES_PT[0])
    expect(location.length).toBeGreaterThan(1)
    expect(location.every((o) => o.sizePt < receiver.sizePt)).toBe(true)
    expect(location.map((o) => o.text).join(' ')).toBe(place)
  })

  it('falls back to the smallest size and cuts details that fit at none', () => {
    const ops = textOps({
      receiverName:
        'A receiver with a very long full name that goes on and on and on forever and then some more after that again',
      locationName: null,
    })
    const receiver = ops.filter((o) => o.bold && o.sizePt === DETAIL_SIZES_PT[DETAIL_SIZES_PT.length - 1])
    expect(receiver).toHaveLength(3)
    expect(receiver.every((o) => o.sizePt === DETAIL_SIZES_PT[DETAIL_SIZES_PT.length - 1])).toBe(true)
    expect(receiver[0].text.startsWith('A receiver')).toBe(true)
    expect(receiver[2].text.endsWith('…')).toBe(true)
    // the date would fit larger, but never outranks the details above it
    expect(ops.find((o) => o.text === '29 Sep 2026')!.sizePt).toBe(receiver[0].sizePt)
  })

  it('puts the logo top right, beside the details, at its aspect ratio', () => {
    const ops = layoutBoxLabel(label({ receiverName: 'Jo', locationName: 'Depot' }), measure).ops
    const logo = ops.find((o): o is Extract<LabelOp, { kind: 'logo' }> => o.kind === 'logo')!
    const details = ops.filter(
      (o): o is Extract<LabelOp, { kind: 'text' }> =>
        o.kind === 'text' && ['Jo', 'Depot', '29 Sep 2026'].includes(o.text),
    )
    const rule = ops.find((o) => o.kind === 'rule')!
    expect(details).toHaveLength(3)
    for (const d of details) expect(d.x + measure(d.text, d.sizePt, d.bold)).toBeLessThan(logo.x)
    expect(logo.x + logo.width).toBeCloseTo(LABEL_WIDTH_MM - 3)
    expect(logo.width / logo.height).toBeCloseTo(LOGO_ASPECT)
    expect(logo.y + logo.height).toBeLessThan(rule.y)
  })

  it('falls back to the package reference when there is no PO', () => {
    expect(texts(layoutBoxLabel(label({ poNumber: null }), measure).ops)[0]).toBe('RX-0001')
    expect(texts(layoutBoxLabel(label({ poNumber: '   ' }), measure).ops)[0]).toBe('RX-0001')
  })

  it('shrinks a long PO number, and truncates one that fits at no size', () => {
    const medium = layoutBoxLabel(label(), measure).ops[0]
    expect(medium).toMatchObject({ kind: 'text', text: '4500123456' })
    expect(medium.kind === 'text' && medium.sizePt).toBeLessThan(14)

    const huge = layoutBoxLabel(label({ poNumber: 'X'.repeat(60) }), measure).ops[0]
    expect(huge).toMatchObject({ kind: 'text', sizePt: 10 })
    expect(huge.kind === 'text' && huge.text.endsWith('…')).toBe(true)
  })

  it('omits the location line when there is none', () => {
    expect(texts(layoutBoxLabel(label({ locationName: null }), measure).ops)).not.toContain('Polokwane Depot')
    // id, box, receiver, date, qty, description
    expect(texts(layoutBoxLabel(label({ receiverName: 'Jo', locationName: '  ' }), measure).ops)).toHaveLength(6)
  })

  it('uses the largest item size when items fit', () => {
    const out = layoutBoxLabel(label(), measure)
    expect(out.itemSizePt).toBe(ITEM_FONT_SIZES_PT[0])
    expect(out.hiddenItems).toBe(0)
  })

  it('shrinks the item font before truncating', () => {
    const lines = (n: number) => label({ items: Array.from({ length: n }, (_, i) => ({ quantity: 1, description: `Item ${i}` })) })
    const big = layoutBoxLabel(lines(1), measure).itemSizePt
    const shrunk = layoutBoxLabel(lines(20), measure)
    expect(shrunk.itemSizePt).toBeLessThan(big)
    expect(shrunk.hiddenItems).toBe(0)
  })

  it('truncates at the minimum size with "+N more items"', () => {
    const out = layoutBoxLabel(
      label({ items: Array.from({ length: 40 }, (_, i) => ({ quantity: 1, description: `Item ${i}` })) }),
      measure,
    )
    const min = ITEM_FONT_SIZES_PT[ITEM_FONT_SIZES_PT.length - 1]
    expect(out.itemSizePt).toBe(min)
    expect(out.hiddenItems).toBeGreaterThan(0)
    expect(texts(out.ops).at(-1)).toBe(`+${out.hiddenItems} more items`)
  })

  it('hides at least two lines on the first overflow (the note takes one)', () => {
    const withLines = (n: number) =>
      layoutBoxLabel(label({ items: Array.from({ length: n }, () => ({ quantity: 1, description: 'x' })) }), measure)
    let n = 1
    while (withLines(n).hiddenItems === 0) n++
    expect(withLines(n).hiddenItems).toBe(2)
    expect(texts(withLines(n).ops).at(-1)).toBe('+2 more items')
  })

  it('right-aligns quantities in a shared column and truncates long descriptions', () => {
    const out = layoutBoxLabel(
      label({ items: [{ quantity: 120, description: 'A very long item description that cannot fit' }, { quantity: 3, description: 'Vest' }] }),
      measure,
    )
    const qty = out.ops.filter((o): o is Extract<LabelOp, { kind: 'text' }> => o.kind === 'text' && o.text.endsWith('×'))
    expect(new Set(qty.map((q) => q.x)).size).toBe(1)
    expect(qty.every((q) => q.align === 'right')).toBe(true)
    expect(texts(out.ops)).toContain('Vest')
    expect(texts(out.ops).some((t) => t.startsWith('A very') && t.endsWith('…'))).toBe(true)
  })

  it('handles a box with no item lines', () => {
    const out = layoutBoxLabel(label({ items: [], receiverName: 'Jo', locationName: 'Depot' }), measure)
    expect(out.hiddenItems).toBe(0)
    expect(texts(out.ops)).toHaveLength(5)
  })
})
