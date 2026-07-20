// Builds the support alert sent when a Coupa purchase-order email arrives but
// no Global PO could be created from it.
//
// Every dead end in ingest-coupa-po routes through here, because they all mean
// the same thing operationally: Exxaro issued a real purchase order and this
// system has no record of it. Without the forward, that is silent -- nobody is
// waiting for a PO they don't know exists.
//
// Pure and Deno-free so vitest can cover it; the sending lives in the function.

import type { CoupaPo } from './coupa-po.ts'

/** Why the email could not become a Global PO. */
export interface IngestFailure {
  /** Short human phrase for the subject line and heading. */
  readonly reason: string
  /** The technical detail -- parser error, RPC message, exception text. */
  readonly details: string
  /** What a human should do next. Omitted when there is nothing useful to say. */
  readonly action?: string
  /** Original email subject, when the payload carried one. */
  readonly emailSubject?: string
  /** Original envelope sender. */
  readonly from?: string
  /** Whatever was extracted before the failure. Null when parsing itself failed. */
  readonly po?: CoupaPo | null
  /** Item codes with no matching inventory_items.sku. */
  readonly unknownCodes?: readonly string[]
  /** The original email text, so support can act without hunting for it. */
  readonly body?: string
}

export interface SupportEmail {
  readonly subject: string
  readonly html: string
}

/** Escapes text for embedding in HTML. The body is third-party input. */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function row(label: string, value: string): string {
  return `<tr><td style="padding:4px 12px 4px 0;color:#666;white-space:nowrap;vertical-align:top">${escapeHtml(label)}</td><td style="padding:4px 0"><strong>${escapeHtml(value)}</strong></td></tr>`
}

/** The parsed PO, rendered as the detail block a human needs to key it in by hand. */
function poDetails(po: CoupaPo): string {
  const lines = po.lines
    .map(
      (line) =>
        `<tr><td style="padding:4px 12px 4px 0"><code>${escapeHtml(line.code)}</code></td><td style="padding:4px 12px 4px 0">${escapeHtml(line.name)}</td><td style="padding:4px 0;text-align:right">${escapeHtml(String(line.quantity))} ${escapeHtml(line.uom)}</td></tr>`,
    )
    .join('')

  return `
    <h3 style="margin:24px 0 8px;font-size:14px">Purchase order</h3>
    <table style="border-collapse:collapse;font-size:14px">
      ${row('PO number', po.poNumber)}
      ${row('PO date', po.poDate ?? 'not stated')}
      ${row('Total', `${po.total.toFixed(2)} ${po.currency}`)}
      ${row('On behalf of', po.onBehalfOf ?? 'not stated')}
      ${row('Submitted by', po.submittedBy ?? 'not stated')}
    </table>
    <h3 style="margin:24px 0 8px;font-size:14px">Lines</h3>
    <table style="border-collapse:collapse;font-size:14px">
      <tr style="color:#666"><td style="padding:4px 12px 4px 0">Code</td><td style="padding:4px 12px 4px 0">Description</td><td style="padding:4px 0;text-align:right">Quantity</td></tr>
      ${lines}
    </table>`
}

/**
 * Renders the alert. Always includes the original email, because the reason a
 * parse failed is usually only visible in the body Coupa actually sent.
 */
export function buildIngestFailureEmail(failure: IngestFailure): SupportEmail {
  // Identify by PO number when it parsed, else fall back to the email subject:
  // the subject carries the number too ("Purchase Order #GG80700992"), which is
  // the only handle left when the body did not parse.
  const identifier = failure.po?.poNumber ?? failure.emailSubject ?? 'unknown PO'
  const subject = `[Dispatch] Global PO not created — ${identifier}`

  const meta = [
    failure.emailSubject ? row('Email subject', failure.emailSubject) : '',
    failure.from ? row('From', failure.from) : '',
    row('Reason', failure.reason),
    row('Detail', failure.details),
    failure.unknownCodes?.length ? row('Unknown codes', failure.unknownCodes.join(', ')) : '',
  ]
    .filter(Boolean)
    .join('')

  const action = failure.action
    ? `<p style="margin:16px 0;padding:12px;background:#fff4e5;border-left:3px solid #e07b39;font-size:14px"><strong>What to do:</strong> ${escapeHtml(failure.action)}</p>`
    : ''

  const original = failure.body?.trim()
    ? `<h3 style="margin:24px 0 8px;font-size:14px">Original email</h3>
       <pre style="white-space:pre-wrap;word-break:break-word;background:#f6f6f6;padding:12px;font-size:12px;font-family:ui-monospace,monospace">${escapeHtml(failure.body)}</pre>`
    : ''

  const html = `<div style="font-family:system-ui,-apple-system,sans-serif;color:#111;max-width:720px">
    <h2 style="margin:0 0 4px;font-size:18px">A Coupa purchase order could not be recorded</h2>
    <p style="margin:0 0 16px;color:#666;font-size:14px">Exxaro issued this purchase order, but no Global PO was created. It needs to be handled by hand.</p>
    <table style="border-collapse:collapse;font-size:14px">${meta}</table>
    ${action}
    ${failure.po ? poDetails(failure.po) : ''}
    ${original}
  </div>`

  return { subject, html }
}
