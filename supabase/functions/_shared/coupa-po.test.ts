import { describe, expect, it } from 'vitest'
import {
  htmlToText,
  matchNonPoNotification,
  normalizePoNumber,
  parseCoupaPoEmail,
  resolveCoupaCustomer,
} from './coupa-po'

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

/**
 * The GG80701939 notification, verbatim. Same template, laid out differently:
 * every field sits on the row after its label, and each Lines entry is split
 * across two rows with the quantity and unit alone on the first. Keeping both
 * samples is the point -- Coupa sends both, so both must parse.
 */
const SAMPLE_SPLIT_LINES = `Exxaro Resources Purchase Order #GG80701939

Hi Supplier,

This is to inform you Purchase Order GG80701939 from Exxaro Resources has been issued, and this same notification has been sent to your fellow team members with access to the Coupa Supplier Portal.

Submitted By

Richard Tshepang Tladi

On Behalf Of

Richard Tshepang Tladi

Supplier

100092635 - Rabelani MM Trading Enterprise CC

Total

2,728.81

ZAR

Items

16257 - MILK:FULL CREAM ,LONG LIFE ,CARTON

60 PACKET x 25.22

1,513.20

ZAR

215002 - CREAMER, NON DAIRY:ELLIS BROWN, CREMORA

5 PACKET x 84.69

423.45

ZAR

140295 - COFFEE, ROASTED:MILD INSTANT ,KRONUNG

2 Each x 178.83

357.66

ZAR

140565 - COFFEE, ROASTED:NIGHT/DAY DECAFFEINATED

2 Each x 217.25

434.50

ZAR

More Detail

PO ID
GG80701939

Department
None

Status
Issued - Sent via Email

Order Date
07/17/2026

Acknowledged At
None

Revision Date
07/17/2026

Payment Term
Z001

Req #
874221

Shipping
None

Lines

60 PKT
16257 - MILK:FULL CREAM ,LONG LIFE ,CARTON for 1,513.20 ZAR

 Supplier 100092635 - Rabelani MM Trading Enterprise CC •  Need By 07/24/2026 •  Commodity B254B - BEVERAGES • Contract Catering and canteen service

5 PKT
215002 - CREAMER, NON DAIRY:ELLIS BROWN, CREMORA for 423.45 ZAR

 Supplier 100092635 - Rabelani MM Trading Enterprise CC •  Need By 07/24/2026 •  Commodity B254F - FOOD • Contract Catering and canteen service

2 EA
140295 - COFFEE, ROASTED:MILD INSTANT ,KRONUNG for 357.66 ZAR

 Supplier 100092635 - Rabelani MM Trading Enterprise CC •  Need By 07/24/2026 •  Commodity B254F - FOOD • Contract Catering and canteen service

2 EA
140565 - COFFEE, ROASTED:NIGHT/DAY DECAFFEINATED for 434.50 ZAR

 Supplier 100092635 - Rabelani MM Trading Enterprise CC •  Need By 07/24/2026 •  Commodity B254F - FOOD • Contract Catering and canteen service

Total

2,728.81

ZAR`

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

  it('keeps a name whose middle is blank whole, on one line', () => {
    // GG80711250 failed on "Stefan  (SP) Els": Coupa joins first, middle and
    // last name, so a person with no middle name has two spaces inside their
    // own name. The value used to be cut at the first such run, leaving
    // "Stefan" -- which matched no customer.
    const po = parsed(SAMPLE.replace('Submitted By    Ramadimetja Maria Mochaki', 'Submitted By    Stefan  (SP) Els'))
    expect(po.submittedBy).toBe('Stefan (SP) Els')
  })

  it('keeps a name whose middle is blank whole, when the value sits below its label', () => {
    // GG80711250's actual layout -- the split-line one, where the two-space run
    // is the only thing on the line that could be mistaken for a column break.
    const po = parsed(SAMPLE_SPLIT_LINES.replaceAll('Richard Tshepang Tladi', 'Stefan  (SP) Els'))
    expect(po.onBehalfOf).toBe('Stefan (SP) Els')
    expect(po.submittedBy).toBe('Stefan (SP) Els')
  })

  it('reads the header fields when every value sits below its label', () => {
    const po = parsed(SAMPLE_SPLIT_LINES)
    expect(po.poNumber).toBe('GG80701939')
    expect(po.total).toBe(2728.81)
    expect(po.currency).toBe('ZAR')
    expect(po.poDate).toBe('2026-07-17')
    expect(po.onBehalfOf).toBe('Richard Tshepang Tladi')
    expect(po.submittedBy).toBe('Richard Tshepang Tladi')
  })

  it('reads a Lines entry split across two rows, quantity and unit on the first', () => {
    // The regression this exists for: GG80701939 parsed to zero lines, because
    // every entry states "60 PKT" on its own row and the item on the next.
    expect(parsed(SAMPLE_SPLIT_LINES).lines).toEqual([
      { code: '16257', name: 'MILK:FULL CREAM ,LONG LIFE ,CARTON', quantity: 60, uom: 'PKT' },
      { code: '215002', name: 'CREAMER, NON DAIRY:ELLIS BROWN, CREMORA', quantity: 5, uom: 'PKT' },
      { code: '140295', name: 'COFFEE, ROASTED:MILD INSTANT ,KRONUNG', quantity: 2, uom: 'EA' },
      { code: '140565', name: 'COFFEE, ROASTED:NIGHT/DAY DECAFFEINATED', quantity: 2, uom: 'EA' },
    ])
  })

  it('still ignores the Items summary when the entries are split', () => {
    // The summary states the same four items as "60 PACKET x 25.22" rows. If
    // those were being joined and matched too, we would see eight lines.
    expect(parsed(SAMPLE_SPLIT_LINES).lines).toHaveLength(4)
  })

  it('names the offending entry when a split line has a zero quantity', () => {
    const result = parseCoupaPoEmail(SAMPLE_SPLIT_LINES.replace('60 PKT\n16257', '0 PKT\n16257'))
    expect(result).toMatchObject({ success: false })
    if (!result.success) {
      expect(result.error).toContain('non-positive quantity')
      // The error names the whole entry, not just the row the quantity was on.
      expect(result.error).toContain('MILK:FULL CREAM')
    }
  })

  it('joins the two halves of an entry across a blank row', () => {
    // Whether the halves end up adjacent depends on how the body was flattened,
    // which is the forwarder's business, not a distinction Coupa is drawing.
    const po = parsed(SAMPLE_SPLIT_LINES.replace('60 PKT\n16257', '60 PKT\n\n16257'))
    expect(po.lines[0]).toMatchObject({ code: '16257', quantity: 60, uom: 'PKT' })
    expect(po.lines).toHaveLength(4)
  })

  it('ignores a trailing quantity row with nothing following it', () => {
    // Truncation must not throw or swallow the entries that did parse.
    const po = parsed(`${SAMPLE_SPLIT_LINES}\n\n7 PKT`)
    expect(po.lines).toHaveLength(4)
  })

  it('ignores a quantity row followed by something that is not an order line', () => {
    const po = parsed(`${SAMPLE_SPLIT_LINES}\n\n7 PKT\nSupplier 100092635 - Rabelani MM Trading Enterprise CC`)
    expect(po.lines).toHaveLength(4)
  })

  it('does not join a quantity row across an unrelated line', () => {
    // "60 PKT" here is followed by a real row, so the entry below it must still
    // be read on its own rather than consumed as the join's continuation.
    const po = parsed(SAMPLE_SPLIT_LINES.replace('60 PKT\n16257', '60 PKT\nStatus Issued\n60 PKT\n16257'))
    expect(po.lines).toHaveLength(4)
    expect(po.lines[0]).toMatchObject({ code: '16257', quantity: 60 })
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

describe('matchNonPoNotification', () => {
  /**
   * A service sheet approval, verbatim. Coupa sends it from the same address as
   * a purchase order, so it clears the sender gate and used to reach support as
   * a failed ingestion -- the noise this function exists to stop.
   */
  const SERVICE_SHEET = `Powered by

http://www.coupa.com

Service Sheet #285159 Approved by Exxaro Resources

Hi Supplier,

The work you submitted as Service Sheet #285159 for Purchase Order #GG80688472 has been reviewed and approved by Exxaro Resources. No further action is required, but please review the details below for more information.

Service Sheet Overview

Purchase Order Number

688472

Total Amount Approved

30,400.00 ZAR

Submitted at

07/21/2026

Approved at

07/22/2026

Summary

PO Line 1 - 200000556-PROVIDE, CATERING:VARIETY OF FUNCTIONS

Total Amount:

30,400.00 ZAR

Due Date: 06/09/2026

Completion Date: None`

  it('names a service sheet notification', () => {
    expect(matchNonPoNotification('Service Sheet #285159 Approved by Exxaro Resources', SERVICE_SHEET)).toBe(
      'Service Sheet',
    )
  })

  it('names a service sheet from its body alone, for a forwarder that sends no subject', () => {
    expect(matchNonPoNotification(undefined, SERVICE_SHEET)).toBe('Service Sheet')
  })

  it('names a service sheet whose subject the forwarder rewrote', () => {
    // Mailbox rules prefix subjects; the body still carries the signature.
    expect(matchNonPoNotification('Fwd: notification from Coupa', SERVICE_SHEET)).toBe('Service Sheet')
  })

  /**
   * The GG80711310 emailed order copy, verbatim down to the terms-and-conditions
   * boilerplate it trails (elided -- it carries no signature either way). Same
   * sender and a subject all but identical to a real PO notification, but it
   * states `PO NUMBER` rather than `PO ID`, so it used to reach support as an
   * unreadable email.
   */
  const EMAILED_PO_COPY = `Powered by

Coupa

Coupa

-----------------------------------------------------------------
Exxaro Coal (Pty) Ltd Grootegeluk Mine Purchase Order #GG80711310
-----------------------------------------------------------------

Order Summary

Date

2026/08/14

PO Total

1 614,60 ZAR

Payment Terms

Z001

Contact

Deeron Meyer

DEERON.MEYER@EXXARO.COM

Manage Order
( https://exxaro.coupahost.com/supplier_order_headers/view_po_via_email/fa2b2b0e0413c0ed2b6983ea954dbbb01dfde39f )


Create Invoice
( https://exxaro.coupahost.com/supplier_invoices/fa2b2b0e0413c0ed2b6983ea954dbbb01dfde39f/create_invoice_from_po_via_email )


Orders details below

acknowledge_email_icon
( https://exxaro.coupahost.com/supplier_order_headers/fa2b2b0e0413c0ed2b6983ea954dbbb01dfde39f/ack_po_via_email )


Acknowledge PO

tracking_email_icon
( https://exxaro.coupahost.com/supplier_order_headers/fa2b2b0e0413c0ed2b6983ea954dbbb01dfde39f/add_shipment_details_via_email )


Add Delivery Tracking

------------------------------
Never Miss an Order with Coupa
------------------------------

COMPANY

Rabelani MM Trading Enterprise CC

02 SNEUFPEUL

LEPHALALE,  Limpopo 0557

Attn: Erick Mulaudzi
rabelanimm@gmail.com

PURCHASE ORDER

PO NUMBER
GG80711310
ERP PR NUMBER

DATE
2026/08/14
BREAK DOWN ORDER
No
PURCHASE GROUP

G44
CONTACT PERSON
Pule Legong

Ship To
Exxaro Coal (Pty) Ltd Grootegeluk Mine
DA01-Main Store

We require an order acknowledgment for the following items:

Line
Description
Need By Date
Qty
Unit

Price

Total

1

CHARCOAL, WOOD: TYPE: CHARKA BRIQUETTES, CONTAINER TYPE: BAG,
CAPACITY: 4 KG

Item Number: 378942

Unloading Point: 152B

2026/08/20
15
Each

107,64

1 614,60

Total net item value excl.tax 1 614,60 ZAR`

  it('names the emailed order copy Exxaro sends alongside the notification', () => {
    expect(
      matchNonPoNotification('Exxaro Coal (Pty) Ltd Grootegeluk Mine Purchase Order #GG80711310', EMAILED_PO_COPY),
    ).toBe('Emailed PO copy')
  })

  it('names the emailed order copy from an HTML body, where the hrefs are gone', () => {
    // htmlToText strips every attribute, so the `..._via_email` routes vanish
    // and only the button text is left to recognise it by.
    const html = htmlToText(`
      <p><a href="https://exxaro.coupahost.com/x/ack_po_via_email">Acknowledge PO</a></p>
      <table><tr><td>PO NUMBER</td><td>GG80711310</td></tr></table>`)
    expect(html).not.toContain('ack_po_via_email')
    expect(matchNonPoNotification(undefined, html)).toBe('Emailed PO copy')
  })

  it('does not claim a real purchase order that happens to link back via email', () => {
    // The PO ID guard, again: the copy's signature must not drop the
    // notification if Coupa ever puts the same action links on it.
    expect(matchNonPoNotification(undefined, `${SAMPLE}\n\nAcknowledge PO`)).toBeNull()
  })

  it('names an invoice notification', () => {
    expect(matchNonPoNotification('Invoice #INV-0012 has been approved', 'Hi Supplier, ...')).toBe('Invoice')
  })

  it('does not claim a real purchase order', () => {
    expect(matchNonPoNotification('Exxaro Resources Purchase Order #GG80700992', SAMPLE)).toBeNull()
  })

  it('does not claim an email that states a PO ID, whatever its subject says', () => {
    // The guard the loose patterns rely on: a PO ID means purchase order, so no
    // signature can drop one. Without this, a PO whose lines happened to mention
    // an invoice number would vanish silently.
    expect(matchNonPoNotification('Service Sheet #285159 Approved by Exxaro Resources', SAMPLE)).toBeNull()
  })

  it('leaves an unrecognised email to fail loudly', () => {
    // The whole point of naming these: an email of an unknown shape is still an
    // incident, because Coupa can change the PO template without warning.
    expect(matchNonPoNotification('Exxaro Resources Purchase Order #GG80700992', 'Something new from Coupa.')).toBeNull()
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

  it('ignores the short name Coupa brackets beside a given name', () => {
    // "Stefan  (SP) Els" is one person; receiver_profiles holds "Stefan Els".
    const els = { id: 'r4', name: 'Stefan', surname: 'Els' }
    expect(resolveCoupaCustomer(po('Stefan (SP) Els', null), [els])).toMatchObject({ success: true, receiverId: 'r4' })
  })

  it('ignores the bracketed short name on the customer record too', () => {
    // Whoever captured the customer may have copied the name out of Coupa
    // whole; neither side is the authority on the bracket.
    const els = { id: 'r4', name: 'Stefan (SP)', surname: 'Els' }
    expect(resolveCoupaCustomer(po('Stefan Els', null), [els])).toMatchObject({ success: true, receiverId: 'r4' })
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

  it('feeds an HTML rendering with split line cells through to a complete parse', () => {
    // GG80701939's shape: each Lines entry is two cells, so htmlToText puts the
    // quantity and the item on separate rows.
    const html = `
      <h1>Exxaro Resources Purchase Order #GG80701939</h1>
      <table>
        <tr><td>Total</td><td>2,728.81 ZAR</td></tr>
        <tr><td>PO ID</td><td>GG80701939</td><td>Department</td><td>None</td></tr>
        <tr><td>Order Date</td><td>07/17/2026</td><td>Acknowledged At</td><td>None</td></tr>
      </table>
      <h2>Lines</h2>
      <table>
        <tr><td>60 PKT</td><td>16257 - MILK:FULL CREAM ,LONG LIFE ,CARTON for 1,513.20 ZAR</td></tr>
        <tr><td>Supplier 100092635 &bull; Need By 07/24/2026</td></tr>
        <tr><td>2 EA</td><td>140295 - COFFEE, ROASTED:MILD INSTANT ,KRONUNG for 357.66 ZAR</td></tr>
        <tr><td>Supplier 100092635 &bull; Need By 07/24/2026</td></tr>
      </table>`

    const po = parsed(htmlToText(html))
    expect(po.poNumber).toBe('GG80701939')
    expect(po.total).toBe(2728.81)
    expect(po.poDate).toBe('2026-07-17')
    expect(po.lines.map((l) => [l.code, l.quantity])).toEqual([
      ['16257', 60],
      ['140295', 2],
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
