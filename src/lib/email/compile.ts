// Compile a TemplateDoc (editor blocks) into the Mustache `body_html` string the
// send pipeline renders. This is the ONLY bridge between the friendly block model
// and what actually gets emailed — on save the editor writes both `content` (the
// doc) and `compileBlocks(...)` (this output) to the DB.
//
// Design — "the depot slip". The email reads as the paper slip a customer is
// handed at the collection counter: warm paper, ink, one hi-vis cargo-orange
// accent, and machine-readable values (reference, PO, quantities) in mono. It is
// the Dispatch console's own design language — the palette below is the app's
// oklch token set converted to hex, since mail clients don't understand oklch.
// Green is semantic and appears ONLY on a delivered/completed order.
//
// Email-client constraints shape the markup: tables for layout (Outlook ignores
// flex/grid), inline styles only (no <style> support in Gmail), hex colours, and
// no web fonts — so the type does its work through weight, size and tracking on
// a system stack rather than a typeface.
//
// Literal text is HTML-escaped but `{{tokens}}` are preserved, and a markdown-ish
// `**bold**` is turned into <strong> so non-technical editors get emphasis without
// typing HTML.

import {
  type Block,
  type BannerConfig,
  type RichText,
  type TemplateDoc,
  isRawHtmlDoc,
} from './blocks'
import { escapeLiteralPreservingTokens, htmlEscape } from './render'

// ---------------------------------------------------------------------------
// Design tokens — the app's CSS custom properties, resolved to email-safe hex.
// ---------------------------------------------------------------------------
const PAGE = '#f3f1ed'    // the surface the card sits on (--muted)
const CARD = '#fffefd'    // the slip itself (--card)
const PAPER = '#fcfaf7'   // strip + footer fill (--background, warm paper)
const INK = '#1f1915'     // primary text (--foreground)
const MUTED = '#6e6762'   // labels, meta (--muted-foreground)
const FAINT = '#a49d97'   // copyright, the quietest tier
const BORDER = '#e1ddda'  // standard hairline (--border)
const HAIRLINE = '#f3f1ed' // softer separation, inside tables
const ON_ACCENT = '#201308' // ink on cargo orange — black-on-orange, hi-vis signage
const ACCENT = '#ea6600'  // cargo orange (--primary); the one accent, used sparingly

const SANS = "'Helvetica Neue', Helvetica, Arial, sans-serif"
const MONO = "ui-monospace, 'SF Mono', Menlo, Consolas, 'Courier New', monospace"

/** Small uppercase section label — the workhorse of the hierarchy's third tier. */
const LABEL = `margin: 0 0 8px; font-family: ${SANS}; font-size: 10px; font-weight: 600; line-height: 1; letter-spacing: 0.14em; text-transform: uppercase; color: ${MUTED};`

// Brand boilerplate. Kept constant across every email so the masthead and the
// copyright line stay consistent; the year comes from {{current_year}}.
const FOOTER_COMPANY = 'Rabelani MM Trading Enterprise'
const FOOTER_WEBSITE_URL = 'https://www.rabelanimm.co.za/'
const FOOTER_WEBSITE_LABEL = 'rabelanimm.co.za'

// The Rabelani MM mark, served from the company site (the same asset the original
// templates used). `height` is set as an attribute as well as in CSS because
// Outlook ignores the style; `alt` carries the company name so the masthead still
// reads as branded in the many clients that block images by default.
const LOGO_URL = 'https://www.rabelanimm.co.za/images/logo.png'
const LOGO_HEIGHT = 40

/** A full-width row inside the slip, with the standard horizontal gutter. */
function row(inner: string, style = ''): string {
  return `      <tr><td style="padding: 0 28px; ${style}">${inner}</td></tr>`
}

/** Vertical rhythm between rows — spacing is structural here, not a margin. */
function spacer(px: number): string {
  return `      <tr><td style="height: ${px}px; line-height: ${px}px; font-size: 0;">&nbsp;</td></tr>`
}

/** Escape literals, keep tokens, and turn `**bold**` into <strong>bold</strong>. */
export function renderRichText(text: RichText): string {
  const escaped = escapeLiteralPreservingTokens(text)
  return escaped.replace(/\*\*([\s\S]+?)\*\*/g, '<strong>$1</strong>')
}

/** Wrap `inner` in a `{{#var}}…{{/var}}` section when `showWhen` is set. */
function gated(showWhen: string | undefined, inner: string): string {
  if (!showWhen) return inner
  return `{{#${showWhen}}}${inner}{{/${showWhen}}}`
}

/**
 * The masthead: wordmark left, document label right, closed by a 4px hi-vis rule
 * in the template's accent. `banner.title` is that document label ("Collection
 * notice"); `banner.bg` is the accent. Sub-lines still render — legacy docs put
 * the reference there — but the seeded templates carry it in the strip instead.
 */
function compileBanner(banner: BannerConfig): string {
  const label = banner.title
    ? `<td align="right" valign="middle" style="font-family: ${MONO}; font-size: 10px; font-weight: 500; letter-spacing: 0.14em; text-transform: uppercase; color: ${MUTED};">${renderRichText(banner.title)}</td>`
    : '<td></td>'

  const lines = banner.lines
    .map((l) =>
      gated(
        l.showWhen,
        `<p style="margin: 6px 0 0; font-family: ${MONO}; font-size: 12px; color: ${MUTED};">${renderRichText(l.text)}</p>`,
      ),
    )
    .join('\n        ')

  return `      <tr><td style="padding: 18px 28px 16px; border-bottom: 1px solid ${BORDER};">
        <table width="100%" cellpadding="0" cellspacing="0" role="presentation"><tr>
          <td align="left" valign="middle">
            <a href="${FOOTER_WEBSITE_URL}" style="text-decoration: none;"><img src="${LOGO_URL}" alt="${FOOTER_COMPANY}" height="${LOGO_HEIGHT}" style="display: block; height: ${LOGO_HEIGHT}px; width: auto; max-height: ${LOGO_HEIGHT}px; border: 0; font-family: ${SANS}; font-size: 13px; font-weight: 700; color: ${INK};" /></a>
          </td>
          ${label}
        </tr></table>
        ${lines}
      </td></tr>
      <tr><td style="height: 4px; line-height: 4px; font-size: 0; background: ${banner.bg};">&nbsp;</td></tr>`
}

/**
 * The waybill strip — full-bleed paper, status chip, then the reference at 26px
 * in mono. This is the focal element: it wins on size, weight and the air around
 * it, and the tear-line below it separates "what you need" from "the detail".
 */
function compileReferenceStrip(b: Extract<Block, { kind: 'reference_strip' }>): string {
  const chip = b.status
    ? `<span style="display: inline-block; background: ${b.accent}; color: ${ON_ACCENT}; font-family: ${SANS}; font-size: 10px; font-weight: 700; line-height: 1; letter-spacing: 0.1em; text-transform: uppercase; padding: 6px 10px; border-radius: 4px;">${renderRichText(b.status)}</span>`
    : ''
  const meta = b.meta
    ? gated(
        b.metaShowWhen,
        `<p style="margin: 10px 0 0; font-family: ${MONO}; font-size: 12px; color: ${MUTED};">${renderRichText(b.meta)}</p>`,
      )
    : ''

  return `      <tr><td style="padding: 26px 28px 22px; background: ${PAPER}; border-bottom: 1px dashed ${BORDER};">
        ${chip}
        <p style="margin: 16px 0 4px; font-family: ${SANS}; font-size: 10px; font-weight: 500; line-height: 1; letter-spacing: 0.14em; text-transform: uppercase; color: ${MUTED};">${htmlEscape(b.label)}</p>
        <p style="margin: 0; font-family: ${MONO}; font-size: 26px; font-weight: 600; line-height: 1.15; color: ${INK};">${renderRichText(b.value)}</p>
        ${meta}
      </td></tr>`
}

function compileBlock(b: Block): string {
  switch (b.kind) {
    case 'reference_strip':
      return compileReferenceStrip(b)

    case 'heading': {
      // Level 3 is the section label (the uppercase tier); 1 and 2 are real
      // headings. Hierarchy comes from weight and colour, not size alone.
      if (b.level === 3) {
        return row(`<p style="${LABEL}">${renderRichText(b.text)}</p>`)
      }
      const size = b.level === 1 ? 20 : 16
      return row(
        `<h${b.level} style="margin: 0 0 10px; font-family: ${SANS}; font-size: ${size}px; font-weight: 600; letter-spacing: -0.01em; color: ${INK};">${renderRichText(b.text)}</h${b.level}>`,
      )
    }

    case 'paragraph':
      return gated(
        b.showWhen,
        row(
          `<p style="margin: 0 0 14px; font-family: ${SANS}; font-size: 14px; line-height: 1.6; color: ${INK};">${renderRichText(b.text)}</p>`,
        ),
      )

    case 'note':
      // A callout, not a bold run-in: tinted surface, no border — hierarchy
      // through tone, which is quieter than a rule and reads as a slip stamp.
      return gated(
        b.showWhen,
        row(
          `<table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="margin: 0 0 14px; background: ${PAGE}; border-radius: 6px;"><tr><td style="padding: 12px 14px;">
          <p style="${LABEL}">${htmlEscape(b.label)}</p>
          <p style="margin: 0; font-family: ${SANS}; font-size: 13px; line-height: 1.6; color: ${INK};">${renderRichText(b.text)}</p>
        </td></tr></table>`,
        ),
      )

    case 'button':
      // Black-on-orange, like the hi-vis signage the palette comes from.
      return row(
        `<p style="margin: 8px 0 18px;"><a href="{{${b.hrefVar}}}" style="display: inline-block; background: ${b.bg}; color: ${ON_ACCENT}; font-family: ${SANS}; font-size: 13px; font-weight: 700; letter-spacing: 0.02em; text-decoration: none; padding: 12px 20px; border-radius: 6px;">${renderRichText(b.label)}</a></p>`,
      )

    case 'divider':
      return row(`<div style="height: 1px; line-height: 1px; font-size: 0; background: ${BORDER}; margin: 8px 0 18px;">&nbsp;</div>`)

    case 'items_table': {
      const heading = b.heading ? `<p style="${LABEL}">${renderRichText(b.heading)}</p>` : ''

      const head = b.columns
        .map((c, i) =>
          i === 0
            ? `<th align="left" width="44" style="padding: 0 0 8px; border-bottom: 1px solid ${BORDER}; font-family: ${MONO}; font-size: 11px; font-weight: 600; letter-spacing: 0.06em; text-transform: uppercase; color: ${MUTED};">${htmlEscape(c.header)}</th>`
            : `<th align="left" style="padding: 0 0 8px; border-bottom: 1px solid ${BORDER}; font-family: ${SANS}; font-size: 10px; font-weight: 600; letter-spacing: 0.14em; text-transform: uppercase; color: ${MUTED};">${htmlEscape(c.header)}</th>`,
        )
        .join('')

      // Quantities are mono + tabular so the column stays a column.
      const cells = b.columns
        .map((c) =>
          c.field === 'quantity'
            ? `<td style="padding: 10px 0; border-bottom: 1px solid ${HAIRLINE}; font-family: ${MONO}; font-size: 14px; font-weight: 500; font-variant-numeric: tabular-nums; color: ${INK};">{{${c.field}}}</td>`
            : `<td style="padding: 10px 0; border-bottom: 1px solid ${HAIRLINE}; font-family: ${SANS}; font-size: 14px; line-height: 1.5; color: ${INK};">{{${c.field}}}</td>`,
        )
        .join('')

      const table = `{{#${b.flag}}}<table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="border-collapse: collapse; margin: 0 0 18px;"><thead><tr>${head}</tr></thead><tbody>{{#${b.source}}}<tr>${cells}</tr>{{/${b.source}}}</tbody></table>{{/${b.flag}}}`
      const empty = b.emptyText
        ? `{{^${b.flag}}}<p style="margin: 0 0 18px; font-family: ${SANS}; font-size: 13px; color: ${MUTED};">${renderRichText(b.emptyText)}</p>{{/${b.flag}}}`
        : ''

      return row(heading + table + empty)
    }

    case 'html':
      return row(b.html)
  }
}

/**
 * The footer, deliberately demoted. The old one was a dark slab whose 160px QR
 * outweighed the email's actual content; here it's quiet paper, a hairline, and
 * small print — with the review QR shrunk to 72px and the call-to-action reduced
 * to a text link. It's a footer, not a billboard.
 *
 * The review rows are omitted entirely when `review` is false (the invite email),
 * and otherwise gated on their variables so a template rendered without them (or
 * with REVIEW_FORM_URL unset) drops those rows instead of emailing a broken image.
 */
function compileFooter(supportVar: string, review: boolean): string {
  const qr = review
    ? `{{#review_qr_code_url}}
        <td align="right" valign="middle" width="84" style="padding-left: 12px;">
          <img src="{{review_qr_code_url}}" alt="Scan to review our service" width="72" height="72" style="display: block; width: 72px; height: 72px; border: 1px solid ${BORDER}; border-radius: 4px;" />
        </td>
        {{/review_qr_code_url}}`
    : ''

  const reviewLink = review
    ? `{{#review_form_url}}<p style="margin: 0 0 12px;"><a href="{{review_form_url}}" style="font-family: ${SANS}; font-size: 12px; color: ${MUTED}; text-decoration: underline;">Review our service</a></p>{{/review_form_url}}`
    : ''

  return `      <tr><td style="padding: 18px 28px 22px; background: ${PAPER}; border-top: 1px solid ${BORDER};">
        <table width="100%" cellpadding="0" cellspacing="0" role="presentation"><tr>
          <td valign="middle">
            <p style="margin: 0 0 6px; font-family: ${SANS}; font-size: 12px; line-height: 1.5; color: ${MUTED};">Questions? <a href="mailto:{{${supportVar}}}" style="color: ${ACCENT}; text-decoration: none; font-weight: 600;">{{${supportVar}}}</a></p>
            <p style="margin: 0 0 10px; font-family: ${SANS}; font-size: 11px; line-height: 1.5; color: ${MUTED};">Automated message &middot; please do not reply directly to this email.</p>
            ${reviewLink}
            <p style="margin: 0; font-family: ${SANS}; font-size: 11px; line-height: 1.5; color: ${FAINT};">&copy; {{current_year}} ${FOOTER_COMPANY} &middot; <a href="${FOOTER_WEBSITE_URL}" style="color: ${FAINT}; text-decoration: none;">${FOOTER_WEBSITE_LABEL}</a></p>
          </td>
          ${qr}
        </tr></table>
      </td></tr>`
}

/** The shared shell + blocks → full HTML document with working Mustache. */
export function compileBlocks(doc: TemplateDoc): string {
  // A pure escape-hatch doc (legacy/custom) round-trips its raw HTML verbatim.
  if (isRawHtmlDoc(doc)) return doc.blocks[0].kind === 'html' ? doc.blocks[0].html : ''

  const banner = compileBanner(doc.banner)
  const footer = compileFooter(doc.footerSupportVar, doc.footerReview !== false)

  // The strip is full-bleed and sets its own padding; every other block sits in
  // the gutter, so it needs air after whatever rule sits above it.
  const rows: string[] = []
  if (doc.blocks[0]?.kind !== 'reference_strip') rows.push(spacer(24))
  for (const b of doc.blocks) {
    rows.push(compileBlock(b))
    if (b.kind === 'reference_strip') rows.push(spacer(22))
  }
  const body = rows.join('\n')

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; background: ${PAGE}; -webkit-font-smoothing: antialiased;">
  <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="background: ${PAGE};">
    <tr><td align="center" style="padding: 24px 12px;">
    <table width="600" cellpadding="0" cellspacing="0" role="presentation" style="width: 100%; max-width: 600px; background: ${CARD}; border: 1px solid ${BORDER}; border-radius: 10px; overflow: hidden; font-family: ${SANS}; color: ${INK};">
${banner}
${body}
${spacer(6)}
${footer}
    </table>
    </td></tr>
  </table>
</body>
</html>`
}
