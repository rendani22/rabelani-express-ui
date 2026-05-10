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
}

export type EmailTemplateKey =
  | 'package_registered'
  | 'package_ready_for_collection'
  | 'package_completed'
  | 'package_contents_updated'

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
      .select('subject, body_html, is_active')
      .eq('key', key)
      .maybeSingle()
    if (error) {
      console.warn(`loadTemplate(${key}) error:`, error.message)
      return null
    }
    if (!data || !data.is_active) return null
    return { subject: data.subject, body_html: data.body_html }
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
// Mirrors the seeded HTML in the email_templates migration. Kept in sync by
// the Email Templates admin page; if you edit one, edit both.

const REGISTERED_HTML = `
              <!DOCTYPE html>
              <html>
              <head>
                <meta charset="utf-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
              </head>
              <body style="font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; color: #242424; background: #ffffff;">
                <div style="background: #f75757; padding: 28px 24px; text-align: center;">
                  <h1 style="color: #ffffff; margin: 0; font-size: 24px;">Purchase Order Confirmation</h1>
                  {{#po_number}}<p style="color: #ffe7e7;">Purchase Order Number: <strong>{{po_number}}</strong></p>{{/po_number}}
                  <p style="color: #ffe7e7;">Your Package Reference: <strong>{{reference}}</strong></p>
                </div>
                <div style="padding: 24px;">
                  <p>Hello,</p>
                  <p>A package has been registered for you and is being prepared.</p>
                  {{#notes}}<p><strong>Notes:</strong> {{notes}}</p>{{/notes}}
                  {{#has_items}}
                  <h3>Package Contents</h3>
                  <table style="width:100%; border-collapse: collapse;">
                    <thead><tr><th align="left">Qty</th><th align="left">Description</th></tr></thead>
                    <tbody>{{#items}}<tr><td>{{quantity}}</td><td>{{description}}</td></tr>{{/items}}</tbody>
                  </table>
                  {{/has_items}}
                  <h3>Delivery Point</h3>
                  <p><strong>{{location_name}}</strong></p>
                  {{#location_address}}<p>{{location_address}}</p>{{/location_address}}
                  <p>Contact Number: {{collection_contact}}</p>
                </div>
                <div style="background: #242424; color: #ccc; padding: 16px; text-align: center;">
                  Questions? <a href="mailto:{{support_email}}" style="color: #f75757;">{{support_email}}</a>
                </div>
              </body></html>`

const READY_HTML = `
              <!DOCTYPE html>
              <html><body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                <div style="background: #f75757; padding: 28px; text-align: center;">
                  <h1 style="color: #fff; margin: 0;">Ready for Collection</h1>
                  {{#po_number}}<p style="color:#ffe7e7;">PO: <strong>{{po_number}}</strong></p>{{/po_number}}
                  <p style="color:#ffe7e7;">Reference: <strong>{{reference}}</strong></p>
                </div>
                <div style="padding: 24px;">
                  <p>Your package is ready for collection at {{location_name}}.</p>
                  {{#has_items}}
                  <table style="width:100%; border-collapse: collapse;">
                    <thead><tr><th align="left">Qty</th><th align="left">Description</th></tr></thead>
                    <tbody>{{#items}}<tr><td>{{quantity}}</td><td>{{description}}</td></tr>{{/items}}</tbody>
                  </table>
                  {{/has_items}}
                  <p>Contact: {{collection_contact}}</p>
                </div>
                <div style="background:#242424; color:#ccc; padding: 16px; text-align:center;">
                  <a href="mailto:{{support_email}}" style="color:#f75757;">{{support_email}}</a>
                </div>
              </body></html>`

const COMPLETED_HTML = `
              <!DOCTYPE html>
              <html><body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                <div style="background: #f75757; padding: 28px; text-align: center;">
                  <h1 style="color: #fff; margin: 0;">Package Completed</h1>
                  {{#po_number}}<p style="color:#ffe7e7;">PO: <strong>{{po_number}}</strong></p>{{/po_number}}
                  <p style="color:#ffe7e7;">Reference: <strong>{{reference}}</strong></p>
                </div>
                <div style="padding: 24px;">
                  <p>Your Package Collection/Delivery has been completed. Thank you for your Order.</p>
                  {{#has_items}}
                  <table style="width:100%; border-collapse: collapse;">
                    <thead><tr><th align="left">Qty</th><th align="left">Description</th></tr></thead>
                    <tbody>{{#items}}<tr><td>{{quantity}}</td><td>{{description}}</td></tr>{{/items}}</tbody>
                  </table>
                  {{/has_items}}
                </div>
                <div style="background:#242424; color:#ccc; padding: 16px; text-align:center;">
                  <a href="mailto:{{support_email}}" style="color:#f75757;">{{support_email}}</a>
                </div>
              </body></html>`

const CONTENTS_UPDATED_HTML = `
              <!DOCTYPE html>
              <html><body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                <div style="background: #f75757; padding: 28px; text-align: center;">
                  <h1 style="color: #fff; margin: 0;">Package Contents Updated</h1>
                  {{#po_number}}<p style="color:#ffe7e7;">PO: <strong>{{po_number}}</strong></p>{{/po_number}}
                  <p style="color:#ffe7e7;">Reference: <strong>{{reference}}</strong></p>
                </div>
                <div style="padding: 24px;">
                  <p>Your Package has been edited.</p>
                  <h3>Updated Contents</h3>
                  {{#has_updated_items}}
                  <table style="width:100%; border-collapse: collapse;">
                    <thead><tr><th align="left">Qty</th><th align="left">Description</th></tr></thead>
                    <tbody>{{#updated_items}}<tr><td>{{quantity}}</td><td>{{description}}</td></tr>{{/updated_items}}</tbody>
                  </table>
                  {{/has_updated_items}}
                  {{^has_updated_items}}<p><em>No items.</em></p>{{/has_updated_items}}
                  <h3>Previous Contents</h3>
                  {{#has_previous_items}}
                  <table style="width:100%; border-collapse: collapse;">
                    <thead><tr><th align="left">Qty</th><th align="left">Description</th></tr></thead>
                    <tbody>{{#previous_items}}<tr><td>{{quantity}}</td><td>{{description}}</td></tr>{{/previous_items}}</tbody>
                  </table>
                  {{/has_previous_items}}
                  {{^has_previous_items}}<p><em>No items.</em></p>{{/has_previous_items}}
                  <p>Thank you for your Order.</p>
                </div>
                <div style="background:#242424; color:#ccc; padding: 16px; text-align:center;">
                  <a href="mailto:{{support_email}}" style="color:#f75757;">{{support_email}}</a>
                </div>
              </body></html>`

export const FALLBACK_TEMPLATES: Record<EmailTemplateKey, EmailTemplate> = {
  package_registered: {
    subject: 'Purchase Order Confirmation{{#po_number}} - {{po_number}}{{/po_number}} - {{reference}}',
    body_html: REGISTERED_HTML
  },
  package_ready_for_collection: {
    subject: 'Ready for Collection{{#po_number}} - {{po_number}}{{/po_number}} - {{reference}}',
    body_html: READY_HTML
  },
  package_completed: {
    subject: 'Package Completed{{#po_number}} - {{po_number}}{{/po_number}} - {{reference}}',
    body_html: COMPLETED_HTML
  },
  package_contents_updated: {
    subject: 'Package Contents Updated{{#po_number}} - {{po_number}}{{/po_number}} - {{reference}}',
    body_html: CONTENTS_UPDATED_HTML
  }
}

