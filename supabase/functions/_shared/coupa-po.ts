// Parser for the purchase-order notification emails Coupa sends on Exxaro's
// behalf (from do_not_reply@exxaro.coupahost.com).
//
// Deliberately pure and Deno-free so vitest can cover it from the main app's
// test run -- this is the piece most likely to break silently, because Coupa
// owns the template and can change it without warning.
//
// The email states its lines twice: an "Items" summary near the top, and a
// "Lines" block lower down. We parse "Lines", which is the authoritative
// per-line record; the summary is a rendering of it.

/** One PO line. `code` matches `inventory_items.sku`. */
export interface CoupaPoLine {
  readonly code: string
  readonly name: string
  readonly quantity: number
  readonly uom: string
}

/** A purchase order as stated by the email. */
export interface CoupaPo {
  readonly poNumber: string
  /** ISO `yyyy-mm-dd`, or null when the email omits an order date. */
  readonly poDate: string | null
  readonly total: number
  readonly currency: string
  /**
   * The person the order is raised for -- the customer. Null when the email
   * omits the field or renders it as `None`.
   */
  readonly onBehalfOf: string | null
  /** Who keyed the order into Coupa. The customer only when `onBehalfOf` is absent. */
  readonly submittedBy: string | null
  readonly lines: readonly CoupaPoLine[]
}

export type ParseCoupaPoResult =
  | { readonly success: true; readonly data: CoupaPo }
  | { readonly success: false; readonly error: string }

/** The only sender whose emails may create purchase orders. */
export const COUPA_SENDER = 'do_not_reply@exxaro.coupahost.com'

/**
 * `purchase_orders.po_value` is a bare numeric with no currency column, so a
 * non-ZAR order would be recorded as though it were rands. Reject instead.
 */
const EXPECTED_CURRENCY = 'ZAR'

/**
 * `49 PKT 37869 - VOUCHER:OVERTIME MEAL,TICKET for 3,628.94 ZAR`
 *
 * The name runs greedily to the LAST ` for `, so a line whose description
 * contains the word "for" still resolves against the trailing amount.
 */
const LINE_RE =
  /^\s*([\d,]+(?:\.\d+)?)\s+(\S+)\s+(\S+)\s+-\s+(.+)\s+for\s+([\d,]+(?:\.\d{2})?)\s+([A-Z]{3})\s*$/

/**
 * `60 PKT` -- a Lines entry whose quantity and unit sit alone on their own row,
 * the item following on the next. Coupa renders the block both ways.
 *
 * Exactly two tokens, the second alphabetic, so the Items summary's
 * `60 PACKET x 25.22` cannot match. The real guard against a stray join is
 * LINE_RE itself, which the joined string must satisfy whole -- and only the
 * Lines block carries the trailing ` for <amount> <CUR>` it demands.
 */
const QTY_UOM_ONLY_RE = /^\s*([\d,]+(?:\.\d+)?)\s+([A-Za-z]+)\s*$/

const PO_NUMBER_RE = /\bPO ID\s+(\S+)/
const ORDER_DATE_RE = /\bOrder Date\s+(\d{2})\/(\d{2})\/(\d{4})/
const TOTAL_RE = /\bTotal\s+([\d,]+\.\d{2})\s+([A-Z]{3})\b/

/**
 * `Submitted By    Ramadimetja Maria Mochaki`
 *
 * The value ends at a run of 2+ spaces or the line end, because Coupa lays two
 * label/value pairs side by side on one line (`PO ID  GG80700992  Department
 * None`) and a greedy capture would swallow the neighbouring column.
 *
 * The label/value separator is `\s+` rather than `[ \t]+` because `htmlToText`
 * puts every table cell on its own line, so in an HTML body the value sits on
 * the line *after* its label. `.` never matches a newline, so the capture still
 * stops at the end of the value's own line either way.
 */
const SUBMITTED_BY_RE = /^[ \t]*Submitted By\s+(.+?)(?:[ \t]{2,}|[ \t]*$)/m
const ON_BEHALF_OF_RE = /^[ \t]*On Behalf Of\s+(.+?)(?:[ \t]{2,}|[ \t]*$)/m

/**
 * Reads a `label  value` person field. Coupa renders an unset field as the
 * literal `None` (see `Department None` in the sample), which is a name only by
 * accident -- treat it as absent so it can never be matched to a customer.
 */
function matchPerson(body: string, re: RegExp): string | null {
  const value = body.match(re)?.[1]?.trim()
  if (!value || value.toLowerCase() === 'none') return null
  return value
}

/** Strips the thousands separators Coupa renders (`3,628.94` -> `3628.94`). */
function parseAmount(raw: string): number {
  return Number(raw.replace(/,/g, ''))
}

/**
 * Flattens an HTML body to the `label  value` text `parseCoupaPoEmail` expects.
 *
 * Coupa lays the notification out as tables, so cell and block boundaries must
 * become whitespace -- strip the tags naively and `PO ID` runs together with
 * `GG80700992`, or two table cells merge into one unparseable token.
 */
export function htmlToText(html: string): string {
  return html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<\/(td|th|tr|div|p|li|h[1-6]|table)>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&quot;/gi, '"')
    // Ampersand last: unescaping it earlier would let `&amp;lt;` become `<`.
    .replace(/&amp;/gi, '&')
    .replace(/[ \t]+/g, ' ')
    .replace(/^[ \t]+|[ \t]+$/gm, '')
    .replace(/\n{2,}/g, '\n')
}

/**
 * Coupa renders dates US-style (MM/DD/YYYY) -- `07/15/2026` is 15 July 2026.
 * Unambiguous only while one component exceeds 12; see the note in
 * `parseCoupaPoEmail` for why we do not attempt to disambiguate here.
 */
function toIsoDate(month: string, day: string, year: string): string | null {
  const m = Number(month)
  const d = Number(day)
  if (m < 1 || m > 12 || d < 1 || d > 31) return null
  return `${year}-${month}-${day}`
}

/** One Lines entry, resolved from however many rows Coupa spread it over. */
interface MatchedOrderLine {
  readonly match: RegExpMatchArray
  /** The entry as a single line, so an error can name the whole of it. */
  readonly text: string
  /** The last row the entry occupies; the scan resumes after it. */
  readonly consumedTo: number
}

/**
 * Reads the Lines entry starting at `rows[i]`, or null if none starts there.
 *
 * Coupa renders an entry either on one row (`49 PKT 37869 - VOUCHER... for
 * 3,628.94 ZAR`) or split across two, with the quantity and unit alone on the
 * first. Both are the same record, so the split form is stitched back together
 * and matched against the one pattern rather than given a pattern of its own.
 */
function matchOrderLine(rows: readonly string[], i: number): MatchedOrderLine | null {
  const direct = rows[i].match(LINE_RE)
  if (direct) return { match: direct, text: rows[i].trim(), consumedTo: i }

  const split = rows[i].match(QTY_UOM_ONLY_RE)
  if (!split) return null

  // Blank rows between the two halves are an artefact of how the body was
  // flattened, not a separator Coupa means anything by.
  let j = i + 1
  while (j < rows.length && !rows[j].trim()) j++
  if (j >= rows.length) return null

  const text = `${split[1]} ${split[2]} ${rows[j].trim()}`
  const joined = text.match(LINE_RE)
  // A quantity-shaped row followed by anything else is not an entry. Nothing is
  // consumed, so the next row is still scanned on its own terms.
  if (!joined) return null
  return { match: joined, text, consumedTo: j }
}

/**
 * The Coupa notifications that are not purchase orders, by the label the
 * ingest reports them as.
 *
 * Matched loosely, against the subject and body together, because
 * `matchNonPoNotification` refuses to fire on any email stating a PO ID. That
 * guard -- not the precision of these patterns -- is what keeps a real order
 * from being dropped, so a pattern here only has to be recognisable.
 *
 * Adding a kind is one entry. Coupa sends plenty more from this address
 * (requisitions, comments, portal account mail); they are absent because they
 * have not been seen, and an unrecognised email failing loudly is the correct
 * outcome until one is.
 */
const NON_PO_NOTIFICATIONS: readonly { readonly label: string; readonly re: RegExp }[] = [
  // `Service Sheet #285159 Approved by Exxaro Resources`, and the rejected and
  // submitted variants, which differ from it only in the trailing verb.
  { label: 'Service Sheet', re: /\bservice sheet\s+#?\d+/i },
  // `Invoice #INV-0012 has been approved` -- also disputed, paid, voided.
  { label: 'Invoice', re: /\binvoice\s+#\S+/i },
]

/**
 * Names the kind of non-PO Coupa notification this email is, or null if it is
 * not one this system knows about.
 *
 * Coupa sends far more than purchase orders from the one address, and every
 * other kind used to reach support as a failed ingestion -- because an
 * unreadable email is deliberately treated as an incident, Coupa owning the PO
 * template and being free to change it without warning. Dropping the kinds we
 * can name keeps that alarm worth listening to; anything of an unrecognised
 * shape still fails exactly as loudly as it did before.
 *
 * An email stating a `PO ID` is a purchase order no matter what its subject
 * claims, and is never matched here. Nothing else stands between a loose
 * pattern and a silently discarded order, so that check comes first.
 */
export function matchNonPoNotification(subject: string | undefined, body: string): string | null {
  if (PO_NUMBER_RE.test(body)) return null
  // Both, not one or the other: a mailbox rule that rewrites the subject must
  // not hide the body's signature, and a body this system cannot read at all
  // must not hide the subject's.
  const haystack = `${subject ?? ''}\n${body}`
  return NON_PO_NOTIFICATIONS.find((kind) => kind.re.test(haystack))?.label ?? null
}

/**
 * Parses the plain-text body of a Coupa PO notification.
 *
 * Callers pass the text/plain part where available; an HTML-only body must be
 * flattened to text first (cell and block boundaries becoming whitespace)
 * because the fields here are matched as `label  value` pairs.
 *
 * Every failure is reported rather than guessed at: a PO that silently loses a
 * line is worse than one that never gets created, since the second is visible
 * and the first is not.
 */
export function parseCoupaPoEmail(body: string): ParseCoupaPoResult {
  if (!body || !body.trim()) {
    return { success: false, error: 'Email body is empty.' }
  }

  const poNumberMatch = body.match(PO_NUMBER_RE)
  if (!poNumberMatch) {
    return { success: false, error: 'No "PO ID" field found -- the Coupa template may have changed.' }
  }
  const poNumber = normalizePoNumber(poNumberMatch[1])

  const totalMatch = body.match(TOTAL_RE)
  if (!totalMatch) {
    return { success: false, error: 'No "Total" field found -- the Coupa template may have changed.' }
  }
  const total = parseAmount(totalMatch[1])
  const currency = totalMatch[2]
  if (currency !== EXPECTED_CURRENCY) {
    return {
      success: false,
      error: `Order total is in ${currency}; only ${EXPECTED_CURRENCY} can be recorded (po_value has no currency).`,
    }
  }

  const dateMatch = body.match(ORDER_DATE_RE)
  const poDate = dateMatch ? toIsoDate(dateMatch[1], dateMatch[2], dateMatch[3]) : null

  const rows = body.split(/\r?\n/)
  const lines: CoupaPoLine[] = []
  for (let i = 0; i < rows.length; i++) {
    const entry = matchOrderLine(rows, i)
    if (!entry) continue
    const m = entry.match
    // parseAmount cannot yield NaN here -- LINE_RE admits only digits, commas
    // and a decimal tail -- so a zero is the only unusable quantity. The RPC
    // would reject it anyway (ordered_quantity has a CHECK > 0); failing here
    // names the offending line instead of surfacing a constraint violation.
    const quantity = parseAmount(m[1])
    if (quantity <= 0) {
      return { success: false, error: `Line "${entry.text}" has a non-positive quantity.` }
    }
    lines.push({
      quantity,
      uom: m[2],
      code: m[3],
      name: m[4].trim(),
      // m[5] (line value) and m[6] (line currency) are deliberately dropped:
      // only the order total is recorded, and purchase_order_items has nowhere
      // to put a per-line price.
    })
    // Skip the entry's continuation row, if it had one.
    i = entry.consumedTo
  }

  if (lines.length === 0) {
    return {
      success: false,
      error: 'No order lines found -- the Coupa template may have changed.',
    }
  }

  // Not required to parse: an order missing both names is a real order, and the
  // caller can say far more about it ("no customer is named on this email")
  // than a parse failure can. Resolving them to a customer is its own step.
  const onBehalfOf = matchPerson(body, ON_BEHALF_OF_RE)
  const submittedBy = matchPerson(body, SUBMITTED_BY_RE)

  return { success: true, data: { poNumber, poDate, total, currency, onBehalfOf, submittedBy, lines } }
}

/** One customer, as `resolveCoupaCustomer` needs to see it. */
export interface CoupaCustomerCandidate {
  readonly id: string
  readonly name: string
  readonly surname: string
}

export type ResolveCoupaCustomerResult =
  | {
      readonly success: true
      readonly receiverId: string
      /** Which email field matched, for the ingestion audit trail. */
      readonly source: 'On Behalf Of' | 'Submitted By'
      /** The name as the email stated it. */
      readonly matchedName: string
    }
  | { readonly success: false; readonly error: string }

/**
 * Coupa states one full name; `receiver_profiles` splits into name + surname,
 * and where the split falls for "Ramadimetja Maria Mochaki" is a guess. So both
 * sides are flattened to a single case- and space-insensitive string and
 * compared whole, which is the only comparison that does not depend on that
 * guess being right.
 */
function normalizePersonName(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, ' ')
}

/**
 * Picks the customer a Coupa order belongs to.
 *
 * "On Behalf Of" is the person the order is *for*, so it is the customer;
 * "Submitted By" is whoever typed it in, and is the customer only when Coupa
 * states no one else. In the sample they are the same person, which is the
 * common case and the reason the difference is easy to miss.
 *
 * Never guesses. An unmatched or ambiguous name returns an error so the caller
 * can route the order to a human: a PO silently filed against no customer is
 * invisible to the company-scoped dashboards, which is the same as losing it.
 */
export function resolveCoupaCustomer(
  po: CoupaPo,
  candidates: readonly CoupaCustomerCandidate[],
): ResolveCoupaCustomerResult {
  const stated = [
    { source: 'On Behalf Of' as const, value: po.onBehalfOf },
    { source: 'Submitted By' as const, value: po.submittedBy },
  ].filter((field): field is { source: 'On Behalf Of' | 'Submitted By'; value: string } => !!field.value)

  if (stated.length === 0) {
    return {
      success: false,
      error: 'The email names neither an "On Behalf Of" nor a "Submitted By" person, so there is nothing to match a customer against.',
    }
  }

  const byName = new Map<string, CoupaCustomerCandidate[]>()
  for (const candidate of candidates) {
    const key = normalizePersonName(`${candidate.name} ${candidate.surname}`)
    const existing = byName.get(key)
    if (existing) existing.push(candidate)
    else byName.set(key, [candidate])
  }

  for (const { source, value } of stated) {
    const matches = byName.get(normalizePersonName(value))
    if (!matches) continue
    if (matches.length > 1) {
      // Two active customers share the name. Picking one at random files the
      // order against the wrong company half the time; refusing is honest.
      return {
        success: false,
        error: `"${value}" (${source}) matches ${matches.length} customers, so the right one cannot be told apart by name.`,
      }
    }
    return { success: true, receiverId: matches[0].id, source, matchedName: value }
  }

  const tried = stated.map((field) => `"${field.value}" (${field.source})`).join(' or ')
  return { success: false, error: `No active customer is named ${tried}.` }
}

/**
 * PO numbers are compared as strings across two write paths -- this parser and
 * hand-typed `packages.po_number` -- and `loadPurchaseOrders` fabricates a
 * synthetic PO for any package number absent from `purchase_orders`. Without a
 * shared normalization, `gg80700992 ` and `GG80700992` render as two separate
 * purchase orders on the Global PO page.
 */
export function normalizePoNumber(raw: string): string {
  return raw.trim().toUpperCase()
}
