// Compile a TemplateDoc (editor blocks) into the Mustache `body_html` string the
// send pipeline renders. This is the ONLY bridge between the friendly block model
// and what actually gets emailed — on save the editor writes both `content` (the
// doc) and `compileBlocks(...)` (this output) to the DB. All 5 templates share
// one clean shell (branded header band + dark footer).
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

// Brand boilerplate for the shared footer. Kept constant across every email so
// the copyright/website line stays consistent; the year comes from {{current_year}}.
const FOOTER_COMPANY = 'Rabelani MM Trading Enterprise'
const FOOTER_WEBSITE_URL = 'https://www.rabelanimm.co.za/'
const FOOTER_WEBSITE_LABEL = 'www.rabelanimm.co.za'

/**
 * The brand footer, unchanged from the original seeded templates: support line,
 * automated-message disclaimer, review QR + call-to-action, copyright.
 *
 * The review rows are omitted entirely when `review` is false (the invite email),
 * and otherwise gated on their variables so a template rendered without them (or
 * with REVIEW_FORM_URL unset) drops those rows instead of emailing a broken image.
 */
function compileFooter(supportVar: string, review: boolean): string {
  const reviewRows = review
    ? `
      {{#review_qr_code_url}}
      <div style="background: #ffffff; display: inline-block; padding: 14px; border-radius: 8px; margin: 0 0 14px 0;">
        <img src="{{review_qr_code_url}}" alt="Scan to review our services" width="160" height="160" style="display: block; width: 160px; height: 160px;" />
      </div>
      <p style="margin: 0 0 14px 0; font-size: 12px; color: #c9c9c9; letter-spacing: 0.04em;">
        Scan the QR code to review our services
      </p>
      {{/review_qr_code_url}}
      {{#review_form_url}}
      <a href="{{review_form_url}}" style="display: inline-block; padding: 12px 28px; background: #f75757; color: #ffffff; text-decoration: none; font-size: 13px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; border-radius: 50px;">
        Please Review Our Services
      </a>
      {{/review_form_url}}`
    : ''

  return `    <div style="background: #242424; padding: 28px 24px; border-radius: 0 0 8px 8px; text-align: center;">
      <p style="margin: 0 0 12px 0; font-size: 14px; color: #c9c9c9;">
        Questions? Contact us at <a href="mailto:{{${supportVar}}}" style="color: #f75757; text-decoration: none; font-weight: 600;">{{${supportVar}}}</a>
      </p>
      <p style="margin: 0 0 18px 0; font-size: 11px; color: #919194; line-height: 1.5;">
        This is an automated message from the POD System. Please do not reply directly to this email.
      </p>${reviewRows}
      <p style="margin: 18px 0 0 0; font-size: 11px; color: #666666;">
        &copy; {{current_year}} ${FOOTER_COMPANY} &middot; <a href="${FOOTER_WEBSITE_URL}" style="color: #919194; text-decoration: none;">${FOOTER_WEBSITE_LABEL}</a>
      </p>
    </div>`
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

function compileBanner(banner: BannerConfig): string {
  const lines = banner.lines
    .map((l) =>
      gated(l.showWhen, `<p style="color: #ffe7e7; margin: 8px 0 0; font-size: 14px;">${renderRichText(l.text)}</p>`),
    )
    .join('\n      ')
  const title = banner.title
    ? `<h1 style="color: #ffffff; margin: 0; font-size: 24px;">${renderRichText(banner.title)}</h1>`
    : ''
  return `    <div style="background: ${banner.bg}; padding: 28px 24px; text-align: center;">
      ${title}
      ${lines}
    </div>`
}

function compileBlock(b: Block): string {
  switch (b.kind) {
    case 'heading': {
      const size = b.level === 1 ? 22 : b.level === 2 ? 18 : 16
      return `<h${b.level} style="margin: 20px 0 8px; font-size: ${size}px; color: #242424;">${renderRichText(b.text)}</h${b.level}>`
    }
    case 'paragraph':
      return gated(b.showWhen, `<p style="margin: 0 0 12px; line-height: 1.5;">${renderRichText(b.text)}</p>`)
    case 'note':
      return gated(
        b.showWhen,
        `<p style="margin: 0 0 12px; line-height: 1.5;"><strong>${htmlEscape(b.label)}:</strong> ${renderRichText(b.text)}</p>`,
      )
    case 'button':
      return `<p style="text-align: center; margin: 28px 0;"><a href="{{${b.hrefVar}}}" style="background: ${b.bg}; color: #ffffff; text-decoration: none; padding: 12px 22px; border-radius: 6px; font-weight: 600; display: inline-block;">${renderRichText(b.label)}</a></p>`
    case 'divider':
      return `<hr style="border: none; border-top: 1px solid #eeeeee; margin: 20px 0;">`
    case 'items_table': {
      const head = b.columns.map((c) => `<th align="left" style="padding: 6px 8px; border-bottom: 2px solid #eee;">${htmlEscape(c.header)}</th>`).join('')
      const row = b.columns.map((c) => `<td style="padding: 6px 8px; border-bottom: 1px solid #f0f0f0;">{{${c.field}}}</td>`).join('')
      const heading = b.heading ? `<h3 style="margin: 20px 0 8px; font-size: 16px;">${renderRichText(b.heading)}</h3>` : ''
      const table = `{{#${b.flag}}}<table style="width: 100%; border-collapse: collapse; font-size: 14px;"><thead><tr>${head}</tr></thead><tbody>{{#${b.source}}}<tr>${row}</tr>{{/${b.source}}}</tbody></table>{{/${b.flag}}}`
      const empty = b.emptyText ? `{{^${b.flag}}}<p style="margin: 0 0 12px;"><em>${renderRichText(b.emptyText)}</em></p>{{/${b.flag}}}` : ''
      return heading + table + empty
    }
    case 'html':
      return b.html
  }
}

/** The shared shell + blocks → full HTML document with working Mustache. */
export function compileBlocks(doc: TemplateDoc): string {
  // A pure escape-hatch doc (legacy/custom) round-trips its raw HTML verbatim.
  if (isRawHtmlDoc(doc)) return doc.blocks[0].kind === 'html' ? doc.blocks[0].html : ''

  const banner = compileBanner(doc.banner)
  const body = doc.blocks.map(compileBlock).join('\n      ')
  const footer = compileFooter(doc.footerSupportVar, doc.footerReview !== false)

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; color: #242424; background: #ffffff;">
${banner}
    <div style="padding: 24px;">
      ${body}
    </div>
${footer}
</body>
</html>`
}
