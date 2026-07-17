import { describe, expect, it } from 'vitest'
import { htmlToText, normalizePoNumber, parseCoupaPoEmail, resolveCoupaCustomer } from './coupa-po'

/** The GG80700992 notification, verbatim, as the sample the parser was built against. */
const SAMPLE = `Exxaro Resources Purchase Order #GG80700992

Hi Supplier,

This is to inform you Purchase Order GG80700992 from Exxaro Resources has been issued, and this same notification has been sent to your fellow team members with access to the Coupa Supplier Portal.


Submitted By    Ramadimetja Maria Mochaki
On Behalf Of    Ramadimetja Maria Mochaki
Supplier    100092635 - Rabelani MM Trading Enterprise CC
Total    4,873.26 ZAR
Items
37869 - VOUCHER:OVERTIME MEAL,TICKET    49 PACKET x 74.06    3,628.94 ZAR
37865 - VOUCHER:OVERTIME MEAL ,TICKET    14 PACKET x 88.88    1,244.32 ZAR


View Order


More Detail
PO ID    GG80700992        Department    None
Status    Issued - Sent via Email        Last Opened    None
Order Date    07/15/2026        Acknowledged At    None
Revision Date    07/15/2026        Payment Term    Z001
Req #    872025        Shipping    None

Supplier
100092635 - Rabelani MM Trading Enterprise CC 02 SNEUFPEUL
LEPHALALE
Limpopo
0557
South Africa
Location Code: 0557 rabelanimm@gmail.com +27 61 3107075
Shipping
DA01-Main Store
Farm Enkelbult
Lephalale
Limpopo
0555
South Africa
Location Code: GG01
Attn: Ramadimetja Maria Mochaki
Lines
49 PKT 37869 - VOUCHER:OVERTIME MEAL,TICKET for 3,628.94 ZAR
Supplier 100092635 - Rabelani MM Trading Enterprise CC • Need By 07/17/2026 • Commodity B310R - PROMOTIONAL & RECOGNITION ITEMS • Contract Catering and canteen service • Account 477160-K-GGEM6DR-GS01-009C • Period 2026 - GG01

14 PKT 37865 - VOUCHER:OVERTIME MEAL ,TICKET for 1,244.32 ZAR
Supplier 100092635 - Rabelani MM Trading Enterprise CC • Need By 07/17/2026 • Commodity B254K - MEAL VOUCHER • Contract Catering and canteen service • Account 474020-K-GGEM6DR-GS01-009C • Period 2026 - GG01

Total    4,873.26    ZAR`

/** Narrows to the success branch, failing with the parser's own error if not. */
function parsed(body: string) {
  const result = parseCoupaPoEmail(body)
  if (!result.success) throw new Error(`expected a parse, got: ${result.error}`)
  return result.data
}

describe('parseCoupaPoEmail', () => {
  it('reads the header fields from the sample notification', () => {
    const po = parsed(SAMPLE)
    expect(po.poNumber).toBe('GG80700992')
    expect(po.total).toBe(4873.26)
    expect(po.currency).toBe('ZAR')
    // Coupa renders MM/DD/YYYY, so 07/15/2026 is 15 July.
    expect(po.poDate).toBe('2026-07-15')
  })

  it('reads both lines, keeping the near-identical descriptions apart by code', () => {
    const po = parsed(SAMPLE)
    expect(po.lines).toEqual([
      { code: '37869', name: 'VOUCHER:OVERTIME MEAL,TICKET', quantity: 49, uom: 'PKT' },
      { code: '37865', name: 'VOUCHER:OVERTIME MEAL ,TICKET', quantity: 14, uom: 'PKT' },
    ])
  })

  it('parses the Lines block rather than the Items summary', () => {
    // Both blocks state 49 and 14. If the summary rows were being matched too,
    // we would see four lines rather than two.
    expect(parsed(SAMPLE).lines).toHaveLength(2)
  })

  it('strips thousands separators from quantities', () => {
    const po = parsed(SAMPLE.replace('49 PKT 37869', '1,200 PKT 37869'))
    expect(po.lines[0].quantity).toBe(1200)
  })

  it('resolves a description containing the word "for" against the trailing amount', () => {
    const po = parsed(SAMPLE.replace('VOUCHER:OVERTIME MEAL,TICKET for 3,628.94', 'VOUCHER for STAFF for 3,628.94'))
    expect(po.lines[0].name).toBe('VOUCHER for STAFF')
    expect(po.lines[0].quantity).toBe(49)
  })

  it('normalizes the PO number it returns', () => {
    const po = parsed(SAMPLE.replace('PO ID    GG80700992', 'PO ID    gg80700992'))
    expect(po.poNumber).toBe('GG80700992')
  })

  it('names the offending line when a quantity is zero', () => {
    const result = parseCoupaPoEmail(SAMPLE.replace('49 PKT 37869', '0 PKT 37869'))
    expect(result).toMatchObject({ success: false })
    if (!result.success) expect(result.error).toContain('non-positive quantity')
  })

  it('rejects an empty body', () => {
    expect(parseCoupaPoEmail('   ')).toEqual({ success: false, error: 'Email body is empty.' })
  })

  it('rejects a body with no PO ID rather than guessing one', () => {
    const result = parseCoupaPoEmail(SAMPLE.replace('PO ID    GG80700992', 'PO Identifier    GG80700992'))
    expect(result).toMatchObject({ success: false })
  })

  it('rejects a body with no total', () => {
    const result = parseCoupaPoEmail(SAMPLE.replace(/Total\s+4,873\.26\s+ZAR/g, 'Total  --'))
    expect(result).toMatchObject({ success: false })
  })

  it('rejects a non-ZAR order, since po_value has no currency', () => {
    const result = parseCoupaPoEmail(SAMPLE.replace('Total    4,873.26 ZAR', 'Total    4,873.26 USD'))
    expect(result).toMatchObject({ success: false })
    if (!result.success) expect(result.error).toContain('USD')
  })

  it('rejects a template with no recognisable lines rather than creating an empty PO', () => {
    const withoutLines = SAMPLE.split('Lines')[0]
    const result = parseCoupaPoEmail(withoutLines)
    expect(result).toEqual({
      success: false,
      error: 'No order lines found -- the Coupa template may have changed.',
    })
  })

  it('leaves poDate null when the order date is absent', () => {
    const po = parsed(SAMPLE.replace('Order Date    07/15/2026', 'Order Date    None'))
    expect(po.poDate).toBeNull()
  })

  it('leaves poDate null when the order date has an impossible month', () => {
    const po = parsed(SAMPLE.replace('Order Date    07/15/2026', 'Order Date    13/15/2026'))
    expect(po.poDate).toBeNull()
  })

  it('reads both person fields from the sample notification', () => {
    const po = parsed(SAMPLE)
    expect(po.onBehalfOf).toBe('Ramadimetja Maria Mochaki')
    expect(po.submittedBy).toBe('Ramadimetja Maria Mochaki')
  })

  it('keeps the two person fields apart when they name different people', () => {
    const po = parsed(SAMPLE.replace('On Behalf Of    Ramadimetja Maria Mochaki', 'On Behalf Of    Thabo Nkosi'))
    expect(po.onBehalfOf).toBe('Thabo Nkosi')
    expect(po.submittedBy).toBe('Ramadimetja Maria Mochaki')
  })

  it('treats a person field rendered as "None" as absent', () => {
    const po = parsed(SAMPLE.replace('On Behalf Of    Ramadimetja Maria Mochaki', 'On Behalf Of    None'))
    expect(po.onBehalfOf).toBeNull()
  })

  it('leaves a person field null when the template omits it', () => {
    const po = parsed(SAMPLE.replace('Submitted By    Ramadimetja Maria Mochaki\n', ''))
    expect(po.submittedBy).toBeNull()
    // Absence is tolerated rather than fatal: this is still a real order.
    expect(po.poNumber).toBe('GG80700992')
  })

  it('does not swallow the next column when a person field shares a line', () => {
    const po = parsed(SAMPLE.replace('Submitted By    Ramadimetja Maria Mochaki', 'Submitted By    Thabo Nkosi        Department    None'))
    expect(po.submittedBy).toBe('Thabo Nkosi')
  })

  it('reads person fields from an HTML body, where each cell is on its own line', () => {
    // The realistic HTML path: htmlToText breaks every <td> onto a new line, so
    // the value never shares a line with its label.
    const text = htmlToText(`
      <table>
        <tr><td>Submitted By</td><td>Ramadimetja Maria Mochaki</td></tr>
        <tr><td>On Behalf Of</td><td>Thabo Nkosi</td><td>Department</td><td>None</td></tr>
      </table>`)
    const po = parsed(text + SAMPLE)
    expect(po.submittedBy).toBe('Ramadimetja Maria Mochaki')
    expect(po.onBehalfOf).toBe('Thabo Nkosi')
  })
})

describe('resolveCoupaCustomer', () => {
  const MOCHAKI = { id: 'r1', name: 'Ramadimetja Maria', surname: 'Mochaki' }
  const NKOSI = { id: 'r2', name: 'Thabo', surname: 'Nkosi' }

  /** A PO carrying only the two fields this function reads. */
  const po = (onBehalfOf: string | null, submittedBy: string | null) =>
    ({ ...parsed(SAMPLE), onBehalfOf, submittedBy })

  it('matches the customer named on "On Behalf Of"', () => {
    const result = resolveCoupaCustomer(po('Ramadimetja Maria Mochaki', 'Thabo Nkosi'), [MOCHAKI, NKOSI])
    expect(result).toEqual({
      success: true,
      receiverId: 'r1',
      source: 'On Behalf Of',
      matchedName: 'Ramadimetja Maria Mochaki',
    })
  })

  it('prefers "On Behalf Of" over "Submitted By" -- the order is raised for them, not by them', () => {
    const result = resolveCoupaCustomer(po('Thabo Nkosi', 'Ramadimetja Maria Mochaki'), [MOCHAKI, NKOSI])
    expect(result).toMatchObject({ success: true, receiverId: 'r2' })
  })

  it('falls back to "Submitted By" when the email states no "On Behalf Of"', () => {
    const result = resolveCoupaCustomer(po(null, 'Thabo Nkosi'), [MOCHAKI, NKOSI])
    expect(result).toMatchObject({ success: true, receiverId: 'r2', source: 'Submitted By' })
  })

  it('falls back to "Submitted By" when the "On Behalf Of" person is not a customer', () => {
    const result = resolveCoupaCustomer(po('Someone Else', 'Thabo Nkosi'), [MOCHAKI, NKOSI])
    expect(result).toMatchObject({ success: true, receiverId: 'r2', source: 'Submitted By' })
  })

  it('matches whole-name, so the name/surname split does not have to be guessed right', () => {
    // The same person, split after the first word instead of the second.
    const split = { id: 'r3', name: 'Ramadimetja', surname: 'Maria Mochaki' }
    expect(resolveCoupaCustomer(po('Ramadimetja Maria Mochaki', null), [split])).toMatchObject({ receiverId: 'r3' })
  })

  it('ignores case and spacing differences', () => {
    const result = resolveCoupaCustomer(po('  ramadimetja   MARIA mochaki ', null), [MOCHAKI])
    expect(result).toMatchObject({ success: true, receiverId: 'r1' })
  })

  it('reports an exception when neither person is a customer', () => {
    const result = resolveCoupaCustomer(po('Someone Else', 'Another Person'), [MOCHAKI])
    expect(result).toMatchObject({ success: false })
    if (!result.success) {
      expect(result.error).toContain('"Someone Else" (On Behalf Of)')
      expect(result.error).toContain('"Another Person" (Submitted By)')
    }
  })

  it('reports an exception when the email names nobody', () => {
    const result = resolveCoupaCustomer(po(null, null), [MOCHAKI])
    expect(result).toMatchObject({ success: false })
    if (!result.success) expect(result.error).toContain('nothing to match')
  })

  it('reports an exception when there is no customer at all', () => {
    expect(resolveCoupaCustomer(po('Ramadimetja Maria Mochaki', null), [])).toMatchObject({ success: false })
  })

  it('refuses to guess between two customers sharing a name', () => {
    const twin = { id: 'r9', name: 'Ramadimetja Maria', surname: 'Mochaki' }
    const result = resolveCoupaCustomer(po('Ramadimetja Maria Mochaki', null), [MOCHAKI, twin])
    expect(result).toMatchObject({ success: false })
    if (!result.success) expect(result.error).toContain('matches 2 customers')
  })
})

describe('htmlToText', () => {
  it('keeps adjacent table cells apart', () => {
    // The failure this guards: naive tag-stripping yields "PO IDGG80700992",
    // which PO_NUMBER_RE cannot match.
    const text = htmlToText('<tr><td>PO ID</td><td>GG80700992</td></tr>')
    expect(text).toMatch(/PO ID\s+GG80700992/)
  })

  it('drops script and style content rather than inlining it as text', () => {
    const text = htmlToText('<style>td { color: red }</style><p>Total 4,873.26 ZAR</p>')
    expect(text).not.toContain('color')
    expect(text).toContain('Total 4,873.26 ZAR')
  })

  it('unescapes entities without double-unescaping an escaped entity', () => {
    expect(htmlToText('<p>A&nbsp;&amp;&nbsp;B</p>').trim()).toBe('A & B')
    expect(htmlToText('<p>&amp;lt;</p>').trim()).toBe('&lt;')
    expect(htmlToText('<p>&quot;x&#39;y&quot; &lt;z&gt;</p>').trim()).toBe('"x\'y" <z>')
  })

  it('collapses <br> and blank runs into single breaks', () => {
    expect(htmlToText('<p>a</p><br><br><p>b</p>').trim()).toBe('a\nb')
  })

  it('feeds a full HTML rendering through to a complete parse', () => {
    // The realistic path: an inbound provider gives us html and no text part.
    const html = `
      <h1>Exxaro Resources Purchase Order #GG80700992</h1>
      <table>
        <tr><td>Total</td><td>4,873.26 ZAR</td></tr>
        <tr><td>PO ID</td><td>GG80700992</td><td>Department</td><td>None</td></tr>
        <tr><td>Order Date</td><td>07/15/2026</td><td>Acknowledged At</td><td>None</td></tr>
      </table>
      <h2>Lines</h2>
      <div>49 PKT 37869 - VOUCHER:OVERTIME MEAL,TICKET for 3,628.94 ZAR</div>
      <div>Supplier 100092635 &bull; Need By 07/17/2026</div>
      <div>14 PKT 37865 - VOUCHER:OVERTIME MEAL ,TICKET for 1,244.32 ZAR</div>
      <div>Supplier 100092635 &bull; Need By 07/17/2026</div>`

    const po = parsed(htmlToText(html))
    expect(po.poNumber).toBe('GG80700992')
    expect(po.total).toBe(4873.26)
    expect(po.poDate).toBe('2026-07-15')
    expect(po.lines.map((l) => [l.code, l.quantity])).toEqual([
      ['37869', 49],
      ['37865', 14],
    ])
  })
})

describe('normalizePoNumber', () => {
  it.each([
    ['GG80700992', 'GG80700992'],
    ['gg80700992', 'GG80700992'],
    ['  GG80700992  ', 'GG80700992'],
    ['gG80700992 ', 'GG80700992'],
  ])('normalizes %s to %s', (raw, expected) => {
    expect(normalizePoNumber(raw)).toBe(expected)
  })
})
