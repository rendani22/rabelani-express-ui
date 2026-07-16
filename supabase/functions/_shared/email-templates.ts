// Shared email-template loader + mini Mustache-flavoured renderer.
//
// Edge functions (create-package, update-package) load HTML templates from
// `public.email_templates` keyed by slug, and render them with a small
// dependency-free renderer. If the DB row is missing or the load fails we
// fall back to in-code HTML so emails are never blocked by a deploy/seed gap.
//
// Placeholder syntax (subset of Mustache):
//   {{var}}            HTML-escaped scalar
//   {{{var}}}          raw scalar (no escaping)
//   {{#var}}…{{/var}}  section: arrays iterate (per item, item pushed on context),
//                                truthy scalars/objects render once,
//                                falsy / empty arrays render nothing
//   {{^var}}…{{/var}}  inverted section: render only when var is falsy / empty
//
// Variable resolution walks the context stack so {{quantity}} inside
// {{#items}}…{{/items}} resolves against each iterated item first, then the
// outer scope.

// deno-lint-ignore-file no-explicit-any

type Ctx = Record<string, unknown>

interface SupabaseLike {
  from: (table: string) => any
}

export interface EmailTemplate {
  subject: string
  body_html: string
  cc?: string[]
  bcc?: string[]
}

export type EmailTemplateKey =
  | 'package_registered'
  | 'package_ready_for_collection'
  | 'package_completed'
  | 'package_contents_updated'
  | 'customer_invited'

// ----- Renderer ------------------------------------------------------------

function htmlEscape(input: unknown): string {
  if (input === null || input === undefined) return ''
  return String(input)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function lookup(stack: Ctx[], name: string): unknown {
  for (let i = stack.length - 1; i >= 0; i--) {
    const frame = stack[i]
    if (frame && Object.prototype.hasOwnProperty.call(frame, name)) {
      return frame[name]
    }
  }
  return undefined
}

function isTruthy(v: unknown): boolean {
  if (v === null || v === undefined || v === false) return false
  if (typeof v === 'string' && v.length === 0) return false
  if (typeof v === 'number' && v === 0) return false
  if (Array.isArray(v) && v.length === 0) return false
  return true
}

/**
 * Render a Mustache-flavoured template against `vars`. Tolerates missing
 * variables (renders empty) and unbalanced sections (logs + treats as empty).
 */
export function renderTemplate(template: string, vars: Ctx): string {
  // Tokenise: split on {{…}} preserving delimiters.
  const tokenRe = /\{\{\{([^}]+?)\}\}\}|\{\{\s*([#^/])\s*([^}]+?)\s*\}\}|\{\{\s*([^#^/{][^}]*?)\s*\}\}/g

  type Tok =
    | { kind: 'text'; value: string }
    | { kind: 'var'; name: string; raw: boolean }
    | { kind: 'open'; name: string; inverted: boolean }
    | { kind: 'close'; name: string }

  const tokens: Tok[] = []
  let lastIndex = 0
  let m: RegExpExecArray | null
  while ((m = tokenRe.exec(template)) !== null) {
    if (m.index > lastIndex) {
      tokens.push({ kind: 'text', value: template.slice(lastIndex, m.index) })
    }
    if (m[1] !== undefined) {
      tokens.push({ kind: 'var', name: m[1].trim(), raw: true })
    } else if (m[2] !== undefined) {
      const sym = m[2]
      const name = m[3].trim()
      if (sym === '/') tokens.push({ kind: 'close', name })
      else tokens.push({ kind: 'open', name, inverted: sym === '^' })
    } else if (m[4] !== undefined) {
      tokens.push({ kind: 'var', name: m[4].trim(), raw: false })
    }
    lastIndex = m.index + m[0].length
  }
  if (lastIndex < template.length) {
    tokens.push({ kind: 'text', value: template.slice(lastIndex) })
  }

  // Render walking tokens with an index-based recursion to support sections.
  const stack: Ctx[] = [vars]

  function render(start: number, end: number, ctx: Ctx[]): string {
    let out = ''
    let i = start
    while (i < end) {
      const t = tokens[i]
      if (t.kind === 'text') {
        out += t.value
        i++
      } else if (t.kind === 'var') {
        const v = lookup(ctx, t.name)
        out += t.raw ? (v === null || v === undefined ? '' : String(v)) : htmlEscape(v)
        i++
      } else if (t.kind === 'open') {
        // Find matching close
        let depth = 1
        let j = i + 1
        for (; j < end; j++) {
          const tj = tokens[j]
          if (tj.kind === 'open' && tj.name === t.name) depth++
          else if (tj.kind === 'close' && tj.name === t.name) {
            depth--
            if (depth === 0) break
          }
        }
        if (j >= end) {
          // Unbalanced — skip the open token and continue.
          console.warn(`renderTemplate: unbalanced section {{#${t.name}}}`)
          i++
          continue
        }
        const value = lookup(ctx, t.name)
        const truthy = isTruthy(value)
        if (t.inverted) {
          if (!truthy) out += render(i + 1, j, ctx)
        } else {
          if (Array.isArray(value)) {
            for (const item of value) {
              const frame: Ctx = (item && typeof item === 'object') ? (item as Ctx) : { '.': item }
              out += render(i + 1, j, [...ctx, frame])
            }
          } else if (truthy) {
            const frame: Ctx = (value && typeof value === 'object') ? (value as Ctx) : {}
            out += render(i + 1, j, frame === ctx[ctx.length - 1] ? ctx : [...ctx, frame])
          }
        }
        i = j + 1
      } else {
        // stray close — skip
        i++
      }
    }
    return out
  }

  return render(0, tokens.length, stack)
}

// ----- Loader --------------------------------------------------------------

/**
 * Load an active template row from the database. Returns null on miss / error
 * so callers can fall back to {@link FALLBACK_TEMPLATES}.
 */
export async function loadTemplate(
  adminClient: SupabaseLike,
  key: EmailTemplateKey
): Promise<EmailTemplate | null> {
  try {
    const { data, error } = await adminClient
      .from('email_templates')
      .select('subject, body_html, is_active, cc, bcc')
      .eq('key', key)
      .maybeSingle()
    if (error) {
      console.warn(`loadTemplate(${key}) error:`, error.message)
      return null
    }
    if (!data || !data.is_active) return null
    return { subject: data.subject, body_html: data.body_html, cc: data.cc ?? [], bcc: data.bcc ?? [] }
  } catch (e) {
    console.warn(`loadTemplate(${key}) exception:`, e)
    return null
  }
}

/**
 * Resolve a template by key — preferring DB, falling back to in-code HTML.
 * Always returns something renderable.
 */
export async function resolveTemplate(
  adminClient: SupabaseLike,
  key: EmailTemplateKey
): Promise<EmailTemplate> {
  const dbTpl = await loadTemplate(adminClient, key)
  if (dbTpl) return dbTpl
  return FALLBACK_TEMPLATES[key]
}

/** Render a template against vars, returning {subject, html}. */
export function renderEmail(tpl: EmailTemplate, vars: Ctx): { subject: string; html: string } {
  return {
    subject: renderTemplate(tpl.subject, vars),
    html:    renderTemplate(tpl.body_html, vars)
  }
}

/**
 * Build the standard environment-driven variables shared by every template.
 * Pulls the same `Deno.env` keys the inline templates used to read directly.
 */
export function buildCommonVars(envGet: (k: string) => string | undefined): Ctx {
  const reviewFormUrl = envGet('REVIEW_FORM_URL') || 'https://docs.google.com/forms/d/e/1FAIpQLSdiySN-ONYROMnjfqAo4fkHyihRWdhD0sUmIu4L8k6UXcGsNg/viewform?usp=preview'
  return {
    collection_hours_weekday:  envGet('COLLECTION_HOURS')          || 'Monday to Friday, 7:00 AM - 16:00 PM',
    collection_hours_saturday: envGet('COLLECTION_HOURS_SATURDAY') || 'Saturdays: Closed',
    collection_hours_sunday:   envGet('COLLECTION_HOURS_SUNDAY')   || 'Sundays: Closed',
    collection_hours_holidays: envGet('COLLECTION_HOURS_HOLIDAYS') || 'Holidays: Closed',
    support_email:             envGet('SUPPORT_EMAIL')             || 'rabelanimm@gmail.com',
    collection_contact:        envGet('COLLECTION_CONTACT')        || 'Ext 4536 and ask for Lesedi or Thato',
    review_form_url:           reviewFormUrl,
    review_qr_code_url:        `https://api.qrserver.com/v1/create-qr-code/?size=180x180&margin=10&data=${encodeURIComponent(reviewFormUrl)}`,
    current_year:              String(new Date().getFullYear())
  }
}

// ----- Fallback templates --------------------------------------------------
// Used only when the DB row is missing or the load fails, so an email is never
// blocked by a deploy/seed gap.
//
// GENERATED, DO NOT HAND-EDIT. These are the exact output of
// `compileBlocks(SEED_CONTENT[key])` in src/lib/email/ — the same bytes the
// migration writes to `body_html` and the same bytes the editor compiles on
// save. Editing the design means editing the block seeds and re-generating all
// three together; hand-patching one copy is how the old templates drifted apart.
//
// Design notes live in src/lib/email/compile.ts ("the depot slip").

const PACKAGE_REGISTERED_HTML = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; background: #f3f1ed; -webkit-font-smoothing: antialiased;">
  <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="background: #f3f1ed;">
    <tr><td align="center" style="padding: 24px 12px;">
    <table width="600" cellpadding="0" cellspacing="0" role="presentation" style="width: 100%; max-width: 600px; background: #fffefd; border: 1px solid #e1ddda; border-radius: 10px; overflow: hidden; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; color: #1f1915;">
      <tr><td style="padding: 18px 28px 16px; border-bottom: 1px solid #e1ddda;">
        <table width="100%" cellpadding="0" cellspacing="0" role="presentation"><tr>
          <td align="left" valign="middle">
            <a href="https://www.rabelanimm.co.za/" style="text-decoration: none;"><img src="https://www.rabelanimm.co.za/images/logo.png" alt="Rabelani MM Trading Enterprise" height="40" style="display: block; height: 40px; width: auto; max-height: 40px; border: 0; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 13px; font-weight: 700; color: #1f1915;" /></a>
          </td>
          <td align="right" valign="middle" style="font-family: ui-monospace, 'SF Mono', Menlo, Consolas, 'Courier New', monospace; font-size: 10px; font-weight: 500; letter-spacing: 0.14em; text-transform: uppercase; color: #6e6762;">Order confirmation</td>
        </tr></table>
        
      </td></tr>
      <tr><td style="height: 4px; line-height: 4px; font-size: 0; background: #ea6600;">&nbsp;</td></tr>
      <tr><td style="padding: 26px 28px 22px; background: #fcfaf7; border-bottom: 1px dashed #e1ddda;">
        <span style="display: inline-block; background: #ea6600; color: #201308; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 10px; font-weight: 700; line-height: 1; letter-spacing: 0.1em; text-transform: uppercase; padding: 6px 10px; border-radius: 4px;">Registered</span>
        <p style="margin: 16px 0 4px; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 10px; font-weight: 500; line-height: 1; letter-spacing: 0.14em; text-transform: uppercase; color: #6e6762;">Package reference</p>
        <p style="margin: 0; font-family: ui-monospace, 'SF Mono', Menlo, Consolas, 'Courier New', monospace; font-size: 26px; font-weight: 600; line-height: 1.15; color: #1f1915;">{{reference}}</p>
        {{#po_number}}<p style="margin: 10px 0 0; font-family: ui-monospace, 'SF Mono', Menlo, Consolas, 'Courier New', monospace; font-size: 12px; color: #6e6762;">Purchase order · {{po_number}}</p>{{/po_number}}
      </td></tr>
      <tr><td style="height: 22px; line-height: 22px; font-size: 0;">&nbsp;</td></tr>
      <tr><td style="padding: 0 28px; "><p style="margin: 0 0 14px; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 14px; line-height: 1.6; color: #1f1915;">A package has been registered for you and is being prepared. We will email you again when it is ready to collect.</p></td></tr>
{{#notes}}      <tr><td style="padding: 0 28px; "><table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="margin: 0 0 14px; background: #f3f1ed; border-radius: 6px;"><tr><td style="padding: 12px 14px;">
          <p style="margin: 0 0 8px; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 10px; font-weight: 600; line-height: 1; letter-spacing: 0.14em; text-transform: uppercase; color: #6e6762;">Notes</p>
          <p style="margin: 0; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 13px; line-height: 1.6; color: #1f1915;">{{notes}}</p>
        </td></tr></table></td></tr>{{/notes}}
      <tr><td style="padding: 0 28px; "><p style="margin: 0 0 8px; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 10px; font-weight: 600; line-height: 1; letter-spacing: 0.14em; text-transform: uppercase; color: #6e6762;">Contents</p>{{#has_items}}<table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="border-collapse: collapse; margin: 0 0 18px;"><thead><tr><th align="left" width="44" style="padding: 0 0 8px; border-bottom: 1px solid #e1ddda; font-family: ui-monospace, 'SF Mono', Menlo, Consolas, 'Courier New', monospace; font-size: 11px; font-weight: 600; letter-spacing: 0.06em; text-transform: uppercase; color: #6e6762;">Qty</th><th align="left" style="padding: 0 0 8px; border-bottom: 1px solid #e1ddda; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 10px; font-weight: 600; letter-spacing: 0.14em; text-transform: uppercase; color: #6e6762;">Description</th></tr></thead><tbody>{{#items}}<tr><td style="padding: 10px 0; border-bottom: 1px solid #f3f1ed; font-family: ui-monospace, 'SF Mono', Menlo, Consolas, 'Courier New', monospace; font-size: 14px; font-weight: 500; font-variant-numeric: tabular-nums; color: #1f1915;">{{quantity}}</td><td style="padding: 10px 0; border-bottom: 1px solid #f3f1ed; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 14px; line-height: 1.5; color: #1f1915;">{{description}}</td></tr>{{/items}}</tbody></table>{{/has_items}}</td></tr>
      <tr><td style="padding: 0 28px; "><p style="margin: 0 0 8px; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 10px; font-weight: 600; line-height: 1; letter-spacing: 0.14em; text-transform: uppercase; color: #6e6762;">Collection point</p></td></tr>
      <tr><td style="padding: 0 28px; "><p style="margin: 0 0 14px; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 14px; line-height: 1.6; color: #1f1915;"><strong>{{location_name}}</strong></p></td></tr>
{{#location_address}}      <tr><td style="padding: 0 28px; "><p style="margin: 0 0 14px; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 14px; line-height: 1.6; color: #1f1915;">{{location_address}}</p></td></tr>{{/location_address}}
      <tr><td style="padding: 0 28px; "><p style="margin: 0 0 14px; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 14px; line-height: 1.6; color: #1f1915;">Contact {{collection_contact}}</p></td></tr>
      <tr><td style="height: 6px; line-height: 6px; font-size: 0;">&nbsp;</td></tr>
      <tr><td style="padding: 18px 28px 22px; background: #fcfaf7; border-top: 1px solid #e1ddda;">
        <table width="100%" cellpadding="0" cellspacing="0" role="presentation"><tr>
          <td valign="middle">
            <p style="margin: 0 0 6px; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 12px; line-height: 1.5; color: #6e6762;">Questions? <a href="mailto:{{support_email}}" style="color: #ea6600; text-decoration: none; font-weight: 600;">{{support_email}}</a></p>
            <p style="margin: 0 0 10px; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 11px; line-height: 1.5; color: #6e6762;">Automated message &middot; please do not reply directly to this email.</p>
            {{#review_form_url}}<p style="margin: 0 0 12px;"><a href="{{review_form_url}}" style="font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 12px; color: #6e6762; text-decoration: underline;">Review our service</a></p>{{/review_form_url}}
            <p style="margin: 0; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 11px; line-height: 1.5; color: #a49d97;">&copy; {{current_year}} Rabelani MM Trading Enterprise &middot; <a href="https://www.rabelanimm.co.za/" style="color: #a49d97; text-decoration: none;">rabelanimm.co.za</a></p>
          </td>
          {{#review_qr_code_url}}
        <td align="right" valign="middle" width="84" style="padding-left: 12px;">
          <img src="{{review_qr_code_url}}" alt="Scan to review our service" width="72" height="72" style="display: block; width: 72px; height: 72px; border: 1px solid #e1ddda; border-radius: 4px;" />
        </td>
        {{/review_qr_code_url}}
        </tr></table>
      </td></tr>
    </table>
    </td></tr>
  </table>
</body>
</html>`

const PACKAGE_READY_FOR_COLLECTION_HTML = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; background: #f3f1ed; -webkit-font-smoothing: antialiased;">
  <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="background: #f3f1ed;">
    <tr><td align="center" style="padding: 24px 12px;">
    <table width="600" cellpadding="0" cellspacing="0" role="presentation" style="width: 100%; max-width: 600px; background: #fffefd; border: 1px solid #e1ddda; border-radius: 10px; overflow: hidden; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; color: #1f1915;">
      <tr><td style="padding: 18px 28px 16px; border-bottom: 1px solid #e1ddda;">
        <table width="100%" cellpadding="0" cellspacing="0" role="presentation"><tr>
          <td align="left" valign="middle">
            <a href="https://www.rabelanimm.co.za/" style="text-decoration: none;"><img src="https://www.rabelanimm.co.za/images/logo.png" alt="Rabelani MM Trading Enterprise" height="40" style="display: block; height: 40px; width: auto; max-height: 40px; border: 0; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 13px; font-weight: 700; color: #1f1915;" /></a>
          </td>
          <td align="right" valign="middle" style="font-family: ui-monospace, 'SF Mono', Menlo, Consolas, 'Courier New', monospace; font-size: 10px; font-weight: 500; letter-spacing: 0.14em; text-transform: uppercase; color: #6e6762;">Collection notice</td>
        </tr></table>
        
      </td></tr>
      <tr><td style="height: 4px; line-height: 4px; font-size: 0; background: #ea6600;">&nbsp;</td></tr>
      <tr><td style="padding: 26px 28px 22px; background: #fcfaf7; border-bottom: 1px dashed #e1ddda;">
        <span style="display: inline-block; background: #ea6600; color: #201308; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 10px; font-weight: 700; line-height: 1; letter-spacing: 0.1em; text-transform: uppercase; padding: 6px 10px; border-radius: 4px;">Ready for collection</span>
        <p style="margin: 16px 0 4px; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 10px; font-weight: 500; line-height: 1; letter-spacing: 0.14em; text-transform: uppercase; color: #6e6762;">Package reference</p>
        <p style="margin: 0; font-family: ui-monospace, 'SF Mono', Menlo, Consolas, 'Courier New', monospace; font-size: 26px; font-weight: 600; line-height: 1.15; color: #1f1915;">{{reference}}</p>
        {{#po_number}}<p style="margin: 10px 0 0; font-family: ui-monospace, 'SF Mono', Menlo, Consolas, 'Courier New', monospace; font-size: 12px; color: #6e6762;">Purchase order · {{po_number}}</p>{{/po_number}}
      </td></tr>
      <tr><td style="height: 22px; line-height: 22px; font-size: 0;">&nbsp;</td></tr>
      <tr><td style="padding: 0 28px; "><p style="margin: 0 0 14px; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 14px; line-height: 1.6; color: #1f1915;">Your package is ready for collection at <strong>{{location_name}}</strong>. Bring the reference above, a valid staff card, and a witness to sign with.</p></td></tr>
      <tr><td style="padding: 0 28px; "><p style="margin: 0 0 8px; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 10px; font-weight: 600; line-height: 1; letter-spacing: 0.14em; text-transform: uppercase; color: #6e6762;">Contents</p>{{#has_items}}<table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="border-collapse: collapse; margin: 0 0 18px;"><thead><tr><th align="left" width="44" style="padding: 0 0 8px; border-bottom: 1px solid #e1ddda; font-family: ui-monospace, 'SF Mono', Menlo, Consolas, 'Courier New', monospace; font-size: 11px; font-weight: 600; letter-spacing: 0.06em; text-transform: uppercase; color: #6e6762;">Qty</th><th align="left" style="padding: 0 0 8px; border-bottom: 1px solid #e1ddda; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 10px; font-weight: 600; letter-spacing: 0.14em; text-transform: uppercase; color: #6e6762;">Description</th></tr></thead><tbody>{{#items}}<tr><td style="padding: 10px 0; border-bottom: 1px solid #f3f1ed; font-family: ui-monospace, 'SF Mono', Menlo, Consolas, 'Courier New', monospace; font-size: 14px; font-weight: 500; font-variant-numeric: tabular-nums; color: #1f1915;">{{quantity}}</td><td style="padding: 10px 0; border-bottom: 1px solid #f3f1ed; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 14px; line-height: 1.5; color: #1f1915;">{{description}}</td></tr>{{/items}}</tbody></table>{{/has_items}}</td></tr>
      <tr><td style="padding: 0 28px; "><p style="margin: 0 0 8px; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 10px; font-weight: 600; line-height: 1; letter-spacing: 0.14em; text-transform: uppercase; color: #6e6762;">Collection point</p></td></tr>
      <tr><td style="padding: 0 28px; "><p style="margin: 0 0 14px; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 14px; line-height: 1.6; color: #1f1915;"><strong>{{location_name}}</strong></p></td></tr>
{{#location_address}}      <tr><td style="padding: 0 28px; "><p style="margin: 0 0 14px; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 14px; line-height: 1.6; color: #1f1915;">{{location_address}}</p></td></tr>{{/location_address}}
      <tr><td style="padding: 0 28px; "><p style="margin: 0 0 14px; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 14px; line-height: 1.6; color: #1f1915;">Contact {{collection_contact}}</p></td></tr>
      <tr><td style="padding: 0 28px; "><p style="margin: 0 0 8px; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 10px; font-weight: 600; line-height: 1; letter-spacing: 0.14em; text-transform: uppercase; color: #6e6762;">Collection hours</p></td></tr>
      <tr><td style="padding: 0 28px; "><p style="margin: 0 0 14px; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 14px; line-height: 1.6; color: #1f1915;">{{collection_hours_weekday}}</p></td></tr>
      <tr><td style="padding: 0 28px; "><p style="margin: 0 0 14px; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 14px; line-height: 1.6; color: #1f1915;">{{collection_hours_saturday}}</p></td></tr>
      <tr><td style="padding: 0 28px; "><p style="margin: 0 0 14px; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 14px; line-height: 1.6; color: #1f1915;">{{collection_hours_sunday}}</p></td></tr>
      <tr><td style="padding: 0 28px; "><p style="margin: 0 0 14px; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 14px; line-height: 1.6; color: #1f1915;">{{collection_hours_holidays}}</p></td></tr>
      <tr><td style="height: 6px; line-height: 6px; font-size: 0;">&nbsp;</td></tr>
      <tr><td style="padding: 18px 28px 22px; background: #fcfaf7; border-top: 1px solid #e1ddda;">
        <table width="100%" cellpadding="0" cellspacing="0" role="presentation"><tr>
          <td valign="middle">
            <p style="margin: 0 0 6px; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 12px; line-height: 1.5; color: #6e6762;">Questions? <a href="mailto:{{support_email}}" style="color: #ea6600; text-decoration: none; font-weight: 600;">{{support_email}}</a></p>
            <p style="margin: 0 0 10px; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 11px; line-height: 1.5; color: #6e6762;">Automated message &middot; please do not reply directly to this email.</p>
            {{#review_form_url}}<p style="margin: 0 0 12px;"><a href="{{review_form_url}}" style="font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 12px; color: #6e6762; text-decoration: underline;">Review our service</a></p>{{/review_form_url}}
            <p style="margin: 0; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 11px; line-height: 1.5; color: #a49d97;">&copy; {{current_year}} Rabelani MM Trading Enterprise &middot; <a href="https://www.rabelanimm.co.za/" style="color: #a49d97; text-decoration: none;">rabelanimm.co.za</a></p>
          </td>
          {{#review_qr_code_url}}
        <td align="right" valign="middle" width="84" style="padding-left: 12px;">
          <img src="{{review_qr_code_url}}" alt="Scan to review our service" width="72" height="72" style="display: block; width: 72px; height: 72px; border: 1px solid #e1ddda; border-radius: 4px;" />
        </td>
        {{/review_qr_code_url}}
        </tr></table>
      </td></tr>
    </table>
    </td></tr>
  </table>
</body>
</html>`

const PACKAGE_COMPLETED_HTML = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; background: #f3f1ed; -webkit-font-smoothing: antialiased;">
  <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="background: #f3f1ed;">
    <tr><td align="center" style="padding: 24px 12px;">
    <table width="600" cellpadding="0" cellspacing="0" role="presentation" style="width: 100%; max-width: 600px; background: #fffefd; border: 1px solid #e1ddda; border-radius: 10px; overflow: hidden; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; color: #1f1915;">
      <tr><td style="padding: 18px 28px 16px; border-bottom: 1px solid #e1ddda;">
        <table width="100%" cellpadding="0" cellspacing="0" role="presentation"><tr>
          <td align="left" valign="middle">
            <a href="https://www.rabelanimm.co.za/" style="text-decoration: none;"><img src="https://www.rabelanimm.co.za/images/logo.png" alt="Rabelani MM Trading Enterprise" height="40" style="display: block; height: 40px; width: auto; max-height: 40px; border: 0; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 13px; font-weight: 700; color: #1f1915;" /></a>
          </td>
          <td align="right" valign="middle" style="font-family: ui-monospace, 'SF Mono', Menlo, Consolas, 'Courier New', monospace; font-size: 10px; font-weight: 500; letter-spacing: 0.14em; text-transform: uppercase; color: #6e6762;">Completion notice</td>
        </tr></table>
        
      </td></tr>
      <tr><td style="height: 4px; line-height: 4px; font-size: 0; background: #3b9555;">&nbsp;</td></tr>
      <tr><td style="padding: 26px 28px 22px; background: #fcfaf7; border-bottom: 1px dashed #e1ddda;">
        <span style="display: inline-block; background: #3b9555; color: #201308; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 10px; font-weight: 700; line-height: 1; letter-spacing: 0.1em; text-transform: uppercase; padding: 6px 10px; border-radius: 4px;">Delivered</span>
        <p style="margin: 16px 0 4px; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 10px; font-weight: 500; line-height: 1; letter-spacing: 0.14em; text-transform: uppercase; color: #6e6762;">Package reference</p>
        <p style="margin: 0; font-family: ui-monospace, 'SF Mono', Menlo, Consolas, 'Courier New', monospace; font-size: 26px; font-weight: 600; line-height: 1.15; color: #1f1915;">{{reference}}</p>
        {{#po_number}}<p style="margin: 10px 0 0; font-family: ui-monospace, 'SF Mono', Menlo, Consolas, 'Courier New', monospace; font-size: 12px; color: #6e6762;">Purchase order · {{po_number}}</p>{{/po_number}}
      </td></tr>
      <tr><td style="height: 22px; line-height: 22px; font-size: 0;">&nbsp;</td></tr>
      <tr><td style="padding: 0 28px; "><p style="margin: 0 0 14px; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 14px; line-height: 1.6; color: #1f1915;">Collection is complete. The signed proof of delivery is attached to this email as a PDF. Thank you for your order.</p></td></tr>
      <tr><td style="padding: 0 28px; "><p style="margin: 0 0 8px; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 10px; font-weight: 600; line-height: 1; letter-spacing: 0.14em; text-transform: uppercase; color: #6e6762;">Contents</p>{{#has_items}}<table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="border-collapse: collapse; margin: 0 0 18px;"><thead><tr><th align="left" width="44" style="padding: 0 0 8px; border-bottom: 1px solid #e1ddda; font-family: ui-monospace, 'SF Mono', Menlo, Consolas, 'Courier New', monospace; font-size: 11px; font-weight: 600; letter-spacing: 0.06em; text-transform: uppercase; color: #6e6762;">Qty</th><th align="left" style="padding: 0 0 8px; border-bottom: 1px solid #e1ddda; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 10px; font-weight: 600; letter-spacing: 0.14em; text-transform: uppercase; color: #6e6762;">Description</th></tr></thead><tbody>{{#items}}<tr><td style="padding: 10px 0; border-bottom: 1px solid #f3f1ed; font-family: ui-monospace, 'SF Mono', Menlo, Consolas, 'Courier New', monospace; font-size: 14px; font-weight: 500; font-variant-numeric: tabular-nums; color: #1f1915;">{{quantity}}</td><td style="padding: 10px 0; border-bottom: 1px solid #f3f1ed; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 14px; line-height: 1.5; color: #1f1915;">{{description}}</td></tr>{{/items}}</tbody></table>{{/has_items}}</td></tr>
      <tr><td style="height: 6px; line-height: 6px; font-size: 0;">&nbsp;</td></tr>
      <tr><td style="padding: 18px 28px 22px; background: #fcfaf7; border-top: 1px solid #e1ddda;">
        <table width="100%" cellpadding="0" cellspacing="0" role="presentation"><tr>
          <td valign="middle">
            <p style="margin: 0 0 6px; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 12px; line-height: 1.5; color: #6e6762;">Questions? <a href="mailto:{{support_email}}" style="color: #ea6600; text-decoration: none; font-weight: 600;">{{support_email}}</a></p>
            <p style="margin: 0 0 10px; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 11px; line-height: 1.5; color: #6e6762;">Automated message &middot; please do not reply directly to this email.</p>
            {{#review_form_url}}<p style="margin: 0 0 12px;"><a href="{{review_form_url}}" style="font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 12px; color: #6e6762; text-decoration: underline;">Review our service</a></p>{{/review_form_url}}
            <p style="margin: 0; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 11px; line-height: 1.5; color: #a49d97;">&copy; {{current_year}} Rabelani MM Trading Enterprise &middot; <a href="https://www.rabelanimm.co.za/" style="color: #a49d97; text-decoration: none;">rabelanimm.co.za</a></p>
          </td>
          {{#review_qr_code_url}}
        <td align="right" valign="middle" width="84" style="padding-left: 12px;">
          <img src="{{review_qr_code_url}}" alt="Scan to review our service" width="72" height="72" style="display: block; width: 72px; height: 72px; border: 1px solid #e1ddda; border-radius: 4px;" />
        </td>
        {{/review_qr_code_url}}
        </tr></table>
      </td></tr>
    </table>
    </td></tr>
  </table>
</body>
</html>`

const PACKAGE_CONTENTS_UPDATED_HTML = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; background: #f3f1ed; -webkit-font-smoothing: antialiased;">
  <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="background: #f3f1ed;">
    <tr><td align="center" style="padding: 24px 12px;">
    <table width="600" cellpadding="0" cellspacing="0" role="presentation" style="width: 100%; max-width: 600px; background: #fffefd; border: 1px solid #e1ddda; border-radius: 10px; overflow: hidden; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; color: #1f1915;">
      <tr><td style="padding: 18px 28px 16px; border-bottom: 1px solid #e1ddda;">
        <table width="100%" cellpadding="0" cellspacing="0" role="presentation"><tr>
          <td align="left" valign="middle">
            <a href="https://www.rabelanimm.co.za/" style="text-decoration: none;"><img src="https://www.rabelanimm.co.za/images/logo.png" alt="Rabelani MM Trading Enterprise" height="40" style="display: block; height: 40px; width: auto; max-height: 40px; border: 0; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 13px; font-weight: 700; color: #1f1915;" /></a>
          </td>
          <td align="right" valign="middle" style="font-family: ui-monospace, 'SF Mono', Menlo, Consolas, 'Courier New', monospace; font-size: 10px; font-weight: 500; letter-spacing: 0.14em; text-transform: uppercase; color: #6e6762;">Amendment notice</td>
        </tr></table>
        
      </td></tr>
      <tr><td style="height: 4px; line-height: 4px; font-size: 0; background: #ea6600;">&nbsp;</td></tr>
      <tr><td style="padding: 26px 28px 22px; background: #fcfaf7; border-bottom: 1px dashed #e1ddda;">
        <span style="display: inline-block; background: #ea6600; color: #201308; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 10px; font-weight: 700; line-height: 1; letter-spacing: 0.1em; text-transform: uppercase; padding: 6px 10px; border-radius: 4px;">Contents updated</span>
        <p style="margin: 16px 0 4px; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 10px; font-weight: 500; line-height: 1; letter-spacing: 0.14em; text-transform: uppercase; color: #6e6762;">Package reference</p>
        <p style="margin: 0; font-family: ui-monospace, 'SF Mono', Menlo, Consolas, 'Courier New', monospace; font-size: 26px; font-weight: 600; line-height: 1.15; color: #1f1915;">{{reference}}</p>
        {{#po_number}}<p style="margin: 10px 0 0; font-family: ui-monospace, 'SF Mono', Menlo, Consolas, 'Courier New', monospace; font-size: 12px; color: #6e6762;">Purchase order · {{po_number}}</p>{{/po_number}}
      </td></tr>
      <tr><td style="height: 22px; line-height: 22px; font-size: 0;">&nbsp;</td></tr>
      <tr><td style="padding: 0 28px; "><p style="margin: 0 0 14px; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 14px; line-height: 1.6; color: #1f1915;">The contents of your package have been amended. The current contents are below.</p></td></tr>
      <tr><td style="padding: 0 28px; "><p style="margin: 0 0 8px; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 10px; font-weight: 600; line-height: 1; letter-spacing: 0.14em; text-transform: uppercase; color: #6e6762;">Updated contents</p>{{#has_updated_items}}<table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="border-collapse: collapse; margin: 0 0 18px;"><thead><tr><th align="left" width="44" style="padding: 0 0 8px; border-bottom: 1px solid #e1ddda; font-family: ui-monospace, 'SF Mono', Menlo, Consolas, 'Courier New', monospace; font-size: 11px; font-weight: 600; letter-spacing: 0.06em; text-transform: uppercase; color: #6e6762;">Qty</th><th align="left" style="padding: 0 0 8px; border-bottom: 1px solid #e1ddda; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 10px; font-weight: 600; letter-spacing: 0.14em; text-transform: uppercase; color: #6e6762;">Description</th></tr></thead><tbody>{{#updated_items}}<tr><td style="padding: 10px 0; border-bottom: 1px solid #f3f1ed; font-family: ui-monospace, 'SF Mono', Menlo, Consolas, 'Courier New', monospace; font-size: 14px; font-weight: 500; font-variant-numeric: tabular-nums; color: #1f1915;">{{quantity}}</td><td style="padding: 10px 0; border-bottom: 1px solid #f3f1ed; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 14px; line-height: 1.5; color: #1f1915;">{{description}}</td></tr>{{/updated_items}}</tbody></table>{{/has_updated_items}}{{^has_updated_items}}<p style="margin: 0 0 18px; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 13px; color: #6e6762;">No items.</p>{{/has_updated_items}}</td></tr>
      <tr><td style="padding: 0 28px; "><p style="margin: 0 0 8px; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 10px; font-weight: 600; line-height: 1; letter-spacing: 0.14em; text-transform: uppercase; color: #6e6762;">Previous contents</p>{{#has_previous_items}}<table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="border-collapse: collapse; margin: 0 0 18px;"><thead><tr><th align="left" width="44" style="padding: 0 0 8px; border-bottom: 1px solid #e1ddda; font-family: ui-monospace, 'SF Mono', Menlo, Consolas, 'Courier New', monospace; font-size: 11px; font-weight: 600; letter-spacing: 0.06em; text-transform: uppercase; color: #6e6762;">Qty</th><th align="left" style="padding: 0 0 8px; border-bottom: 1px solid #e1ddda; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 10px; font-weight: 600; letter-spacing: 0.14em; text-transform: uppercase; color: #6e6762;">Description</th></tr></thead><tbody>{{#previous_items}}<tr><td style="padding: 10px 0; border-bottom: 1px solid #f3f1ed; font-family: ui-monospace, 'SF Mono', Menlo, Consolas, 'Courier New', monospace; font-size: 14px; font-weight: 500; font-variant-numeric: tabular-nums; color: #1f1915;">{{quantity}}</td><td style="padding: 10px 0; border-bottom: 1px solid #f3f1ed; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 14px; line-height: 1.5; color: #1f1915;">{{description}}</td></tr>{{/previous_items}}</tbody></table>{{/has_previous_items}}{{^has_previous_items}}<p style="margin: 0 0 18px; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 13px; color: #6e6762;">No items.</p>{{/has_previous_items}}</td></tr>
{{#notes}}      <tr><td style="padding: 0 28px; "><table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="margin: 0 0 14px; background: #f3f1ed; border-radius: 6px;"><tr><td style="padding: 12px 14px;">
          <p style="margin: 0 0 8px; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 10px; font-weight: 600; line-height: 1; letter-spacing: 0.14em; text-transform: uppercase; color: #6e6762;">Notes</p>
          <p style="margin: 0; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 13px; line-height: 1.6; color: #1f1915;">{{notes}}</p>
        </td></tr></table></td></tr>{{/notes}}
      <tr><td style="height: 6px; line-height: 6px; font-size: 0;">&nbsp;</td></tr>
      <tr><td style="padding: 18px 28px 22px; background: #fcfaf7; border-top: 1px solid #e1ddda;">
        <table width="100%" cellpadding="0" cellspacing="0" role="presentation"><tr>
          <td valign="middle">
            <p style="margin: 0 0 6px; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 12px; line-height: 1.5; color: #6e6762;">Questions? <a href="mailto:{{support_email}}" style="color: #ea6600; text-decoration: none; font-weight: 600;">{{support_email}}</a></p>
            <p style="margin: 0 0 10px; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 11px; line-height: 1.5; color: #6e6762;">Automated message &middot; please do not reply directly to this email.</p>
            {{#review_form_url}}<p style="margin: 0 0 12px;"><a href="{{review_form_url}}" style="font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 12px; color: #6e6762; text-decoration: underline;">Review our service</a></p>{{/review_form_url}}
            <p style="margin: 0; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 11px; line-height: 1.5; color: #a49d97;">&copy; {{current_year}} Rabelani MM Trading Enterprise &middot; <a href="https://www.rabelanimm.co.za/" style="color: #a49d97; text-decoration: none;">rabelanimm.co.za</a></p>
          </td>
          {{#review_qr_code_url}}
        <td align="right" valign="middle" width="84" style="padding-left: 12px;">
          <img src="{{review_qr_code_url}}" alt="Scan to review our service" width="72" height="72" style="display: block; width: 72px; height: 72px; border: 1px solid #e1ddda; border-radius: 4px;" />
        </td>
        {{/review_qr_code_url}}
        </tr></table>
      </td></tr>
    </table>
    </td></tr>
  </table>
</body>
</html>`

const CUSTOMER_INVITED_HTML = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; background: #f3f1ed; -webkit-font-smoothing: antialiased;">
  <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="background: #f3f1ed;">
    <tr><td align="center" style="padding: 24px 12px;">
    <table width="600" cellpadding="0" cellspacing="0" role="presentation" style="width: 100%; max-width: 600px; background: #fffefd; border: 1px solid #e1ddda; border-radius: 10px; overflow: hidden; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; color: #1f1915;">
      <tr><td style="padding: 18px 28px 16px; border-bottom: 1px solid #e1ddda;">
        <table width="100%" cellpadding="0" cellspacing="0" role="presentation"><tr>
          <td align="left" valign="middle">
            <a href="https://www.rabelanimm.co.za/" style="text-decoration: none;"><img src="https://www.rabelanimm.co.za/images/logo.png" alt="Rabelani MM Trading Enterprise" height="40" style="display: block; height: 40px; width: auto; max-height: 40px; border: 0; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 13px; font-weight: 700; color: #1f1915;" /></a>
          </td>
          <td align="right" valign="middle" style="font-family: ui-monospace, 'SF Mono', Menlo, Consolas, 'Courier New', monospace; font-size: 10px; font-weight: 500; letter-spacing: 0.14em; text-transform: uppercase; color: #6e6762;">Account invitation</td>
        </tr></table>
        
      </td></tr>
      <tr><td style="height: 4px; line-height: 4px; font-size: 0; background: #ea6600;">&nbsp;</td></tr>
      <tr><td style="height: 24px; line-height: 24px; font-size: 0;">&nbsp;</td></tr>
      <tr><td style="padding: 0 28px; "><h1 style="margin: 0 0 10px; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 20px; font-weight: 600; letter-spacing: -0.01em; color: #1f1915;">Welcome to Rabelani Express</h1></td></tr>
      <tr><td style="padding: 0 28px; "><p style="margin: 0 0 14px; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 14px; line-height: 1.6; color: #1f1915;">Hello {{name}}, an account has been created for you at <strong>{{company_name}}</strong>. Set a password to sign in.</p></td></tr>
{{#is_buyer}}      <tr><td style="padding: 0 28px; "><p style="margin: 0 0 14px; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 14px; line-height: 1.6; color: #1f1915;">As a <strong>Buyer</strong>, you can view <strong>your own packages and those of the end users assigned to you</strong> at {{company_name}} — reference, contents, status, and any notes we’ve added for you.</p></td></tr>{{/is_buyer}}
{{#is_runner}}      <tr><td style="padding: 0 28px; "><p style="margin: 0 0 14px; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 14px; line-height: 1.6; color: #1f1915;">As an <strong>End user</strong>, you can view <strong>the packages assigned to you</strong> — reference, contents, status, and any notes we’ve added for you.</p></td></tr>{{/is_runner}}
      <tr><td style="padding: 0 28px; "><p style="margin: 8px 0 18px;"><a href="{{action_link}}" style="display: inline-block; background: #ea6600; color: #201308; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 13px; font-weight: 700; letter-spacing: 0.02em; text-decoration: none; padding: 12px 20px; border-radius: 6px;">Set your password</a></p></td></tr>
      <tr><td style="padding: 0 28px; "><p style="margin: 0 0 14px; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 14px; line-height: 1.6; color: #1f1915;">This link expires after a while — if it stops working, ask your administrator to re-send the invite.</p></td></tr>
      <tr><td style="height: 6px; line-height: 6px; font-size: 0;">&nbsp;</td></tr>
      <tr><td style="padding: 18px 28px 22px; background: #fcfaf7; border-top: 1px solid #e1ddda;">
        <table width="100%" cellpadding="0" cellspacing="0" role="presentation"><tr>
          <td valign="middle">
            <p style="margin: 0 0 6px; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 12px; line-height: 1.5; color: #6e6762;">Questions? <a href="mailto:{{support_email}}" style="color: #ea6600; text-decoration: none; font-weight: 600;">{{support_email}}</a></p>
            <p style="margin: 0 0 10px; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 11px; line-height: 1.5; color: #6e6762;">Automated message &middot; please do not reply directly to this email.</p>
            
            <p style="margin: 0; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 11px; line-height: 1.5; color: #a49d97;">&copy; {{current_year}} Rabelani MM Trading Enterprise &middot; <a href="https://www.rabelanimm.co.za/" style="color: #a49d97; text-decoration: none;">rabelanimm.co.za</a></p>
          </td>
          
        </tr></table>
      </td></tr>
    </table>
    </td></tr>
  </table>
</body>
</html>`

export const FALLBACK_TEMPLATES: Record<EmailTemplateKey, EmailTemplate> = {
  package_registered: {
    subject: 'Purchase Order Confirmation{{#po_number}} - {{po_number}}{{/po_number}} - {{reference}}',
    body_html: PACKAGE_REGISTERED_HTML
  },
  package_ready_for_collection: {
    subject: 'Ready for Collection{{#po_number}} - {{po_number}}{{/po_number}} - {{reference}}',
    body_html: PACKAGE_READY_FOR_COLLECTION_HTML
  },
  package_completed: {
    subject: 'Package Completed{{#po_number}} - {{po_number}}{{/po_number}} - {{reference}}',
    body_html: PACKAGE_COMPLETED_HTML
  },
  package_contents_updated: {
    subject: 'Package Contents Updated{{#po_number}} - {{po_number}}{{/po_number}} - {{reference}}',
    body_html: PACKAGE_CONTENTS_UPDATED_HTML
  },
  customer_invited: {
    subject: 'Welcome to Rabelani Express',
    body_html: CUSTOMER_INVITED_HTML
  }
}
