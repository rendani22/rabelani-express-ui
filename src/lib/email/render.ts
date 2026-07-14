// Client-side mirror of the server Mustache renderer.
//
// This is a VERBATIM port of `renderTemplate`/`htmlEscape`/`lookup`/`isTruthy`
// from `supabase/functions/_shared/email-templates.ts`. It exists so the editor
// preview renders exactly what the send pipeline produces. The two copies must
// stay in sync — the fidelity check (scripts/email-fidelity) guards drift. Do
// not import the Deno edge module into the browser bundle.
//
// Placeholder syntax (subset of Mustache):
//   {{var}}            HTML-escaped scalar
//   {{{var}}}          raw scalar (no escaping)
//   {{#var}}…{{/var}}  section (arrays iterate; truthy renders once; empty → nothing)
//   {{^var}}…{{/var}}  inverted section (renders only when falsy/empty)

type Ctx = Record<string, unknown>

export function htmlEscape(input: unknown): string {
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

/** The token regex used by the renderer — also reused to protect tokens when escaping literals. */
export const TOKEN_RE =
  /\{\{\{([^}]+?)\}\}\}|\{\{\s*([#^/])\s*([^}]+?)\s*\}\}|\{\{\s*([^#^/{][^}]*?)\s*\}\}/g

/**
 * Render a Mustache-flavoured template against `vars`. Tolerates missing
 * variables (renders empty) and unbalanced sections (treats as empty).
 */
export function renderTemplate(template: string, vars: Ctx): string {
  const tokenRe = new RegExp(TOKEN_RE.source, 'g')

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
              const frame: Ctx = item && typeof item === 'object' ? (item as Ctx) : { '.': item }
              out += render(i + 1, j, [...ctx, frame])
            }
          } else if (truthy) {
            const frame: Ctx = value && typeof value === 'object' ? (value as Ctx) : {}
            out += render(i + 1, j, frame === ctx[ctx.length - 1] ? ctx : [...ctx, frame])
          }
        }
        i = j + 1
      } else {
        i++
      }
    }
    return out
  }

  return render(0, tokens.length, stack)
}

/**
 * HTML-escape authored literal text while leaving `{{token}}` sequences intact,
 * so compiled blocks keep working Mustache but literal `<`, `&`, quotes are safe.
 */
export function escapeLiteralPreservingTokens(text: string): string {
  const re = new RegExp(TOKEN_RE.source, 'g')
  let out = ''
  let last = 0
  let m: RegExpExecArray | null
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) out += htmlEscape(text.slice(last, m.index))
    out += m[0] // preserve the token verbatim
    last = m.index + m[0].length
  }
  if (last < text.length) out += htmlEscape(text.slice(last))
  return out
}
