type TemplateContext = Record<string, unknown>;

type Token =
  | { kind: 'text'; value: string }
  | { kind: 'var'; name: string; raw: boolean }
  | { kind: 'open'; name: string; inverted: boolean }
  | { kind: 'close'; name: string };

function escapeHtml(value: unknown): string {
  if (value === null || value === undefined) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function lookup(stack: TemplateContext[], name: string): unknown {
  for (let i = stack.length - 1; i >= 0; i--) {
    if (Object.prototype.hasOwnProperty.call(stack[i], name)) {
      return stack[i][name];
    }
  }
  return undefined;
}

function isTruthy(value: unknown): boolean {
  if (value === null || value === undefined || value === false) return false;
  if (typeof value === 'string' && value.length === 0) return false;
  if (typeof value === 'number' && value === 0) return false;
  return !(Array.isArray(value) && value.length === 0);
}

function tokenize(template: string): Token[] {
  const regex = /\{\{\{([^}]+?)}}}|\{\{\s*([#^/])\s*([^}]+?)\s*}}|\{\{\s*([^#^/{][^}]*?)\s*}}/g;
  const tokens: Token[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(template)) !== null) {
    if (match.index > lastIndex) {
      tokens.push({ kind: 'text', value: template.slice(lastIndex, match.index) });
    }

    if (match[1] !== undefined) {
      tokens.push({ kind: 'var', name: match[1].trim(), raw: true });
    } else if (match[2] !== undefined) {
      const name = match[3].trim();
      if (match[2] === '/') {
        tokens.push({ kind: 'close', name });
      } else {
        tokens.push({ kind: 'open', name, inverted: match[2] === '^' });
      }
    } else if (match[4] !== undefined) {
      tokens.push({ kind: 'var', name: match[4].trim(), raw: false });
    }

    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < template.length) {
    tokens.push({ kind: 'text', value: template.slice(lastIndex) });
  }

  return tokens;
}

/**
 * Small Mustache-style renderer shared by the Email Templates preview.
 * Supports {{var}}, {{{raw}}}, {{#section}}...{{/section}}, and inverted sections.
 */
export function renderTemplate(template: string, context: TemplateContext): string {
  const tokens = tokenize(template);

  function renderRange(start: number, end: number, stack: TemplateContext[]): string {
    let output = '';
    let i = start;

    while (i < end) {
      const token = tokens[i];

      if (token.kind === 'text') {
        output += token.value;
        i++;
        continue;
      }

      if (token.kind === 'var') {
        const value = lookup(stack, token.name);
        output += token.raw ? (value === null || value === undefined ? '' : String(value)) : escapeHtml(value);
        i++;
        continue;
      }

      if (token.kind === 'close') {
        i++;
        continue;
      }

      let depth = 1;
      let closeIndex = i + 1;
      for (; closeIndex < end; closeIndex++) {
        const candidate = tokens[closeIndex];
        if (candidate.kind === 'open' && candidate.name === token.name) depth++;
        if (candidate.kind === 'close' && candidate.name === token.name) {
          depth--;
          if (depth === 0) break;
        }
      }

      if (closeIndex >= end) {
        i++;
        continue;
      }

      const value = lookup(stack, token.name);
      const truthy = isTruthy(value);

      if (token.inverted) {
        if (!truthy) output += renderRange(i + 1, closeIndex, stack);
      } else if (Array.isArray(value)) {
        for (const item of value) {
          const frame: TemplateContext = item && typeof item === 'object' ? item as TemplateContext : { '.': item };
          output += renderRange(i + 1, closeIndex, [...stack, frame]);
        }
      } else if (truthy) {
        const frame: TemplateContext = value && typeof value === 'object' ? value as TemplateContext : {};
        output += renderRange(i + 1, closeIndex, Object.keys(frame).length ? [...stack, frame] : stack);
      }

      i = closeIndex + 1;
    }

    return output;
  }

  return renderRange(0, tokens.length, [context]);
}


