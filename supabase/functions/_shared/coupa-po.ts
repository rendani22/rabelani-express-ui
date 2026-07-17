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

  const lines: CoupaPoLine[] = []
  for (const raw of body.split(/\r?\n/)) {
    const m = raw.match(LINE_RE)
    if (!m) continue
    // parseAmount cannot yield NaN here -- LINE_RE admits only digits, commas
    // and a decimal tail -- so a zero is the only unusable quantity. The RPC
    // would reject it anyway (ordered_quantity has a CHECK > 0); failing here
    // names the offending line instead of surfacing a constraint violation.
    const quantity = parseAmount(m[1])
    if (quantity <= 0) {
      return { success: false, error: `Line "${raw.trim()}" has a non-positive quantity.` }
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
