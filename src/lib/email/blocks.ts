// Block content model for the structured email-template editor.
//
// A template's editable content is a `TemplateDoc` — a banner + an ordered list
// of typed blocks. The editor reads/writes this; on save it is compiled to the
// `body_html` Mustache HTML the send pipeline renders (see `compile.ts`). Users
// never see HTML or Mustache: they edit plain text and insert `{{tokens}}` via a
// friendly menu.

/** The 5 transactional templates the app sends. Mirrors the edge module's keys. */
export type EmailTemplateKey =
  | 'package_registered'
  | 'package_ready_for_collection'
  | 'package_completed'
  | 'package_contents_updated'
  | 'customer_invited'

export const KNOWN_TEMPLATE_KEYS: EmailTemplateKey[] = [
  'package_registered',
  'package_ready_for_collection',
  'package_completed',
  'package_contents_updated',
  'customer_invited',
]

export function isKnownTemplateKey(key: string): key is EmailTemplateKey {
  return (KNOWN_TEMPLATE_KEYS as string[]).includes(key)
}

/**
 * Plain authored text that may embed `{{token}}` references. Stored raw; the
 * compiler HTML-escapes the literal characters but preserves token sequences.
 */
export type RichText = string

export type BlockKind =
  | 'heading'
  | 'paragraph'
  | 'note'
  | 'button'
  | 'divider'
  | 'items_table'
  | 'html'

interface BaseBlock {
  /** Stable id for React keys + reordering. */
  id: string
}

export interface HeadingBlock extends BaseBlock {
  kind: 'heading'
  text: RichText
  /** 1 = section title, 3 = sub-heading (matches the current <h3> usage). */
  level: 1 | 2 | 3
}

export interface ParagraphBlock extends BaseBlock {
  kind: 'paragraph'
  text: RichText
  /** Optional variable name — wraps the paragraph in `{{#showWhen}}…{{/showWhen}}`. */
  showWhen?: string
}

export interface NoteBlock extends BaseBlock {
  kind: 'note'
  /** Bold lead-in, e.g. "Notes". */
  label: string
  text: RichText
  showWhen?: string
}

export interface ButtonBlock extends BaseBlock {
  kind: 'button'
  label: RichText
  /** Variable name whose value is the href, e.g. `action_link`. */
  hrefVar: string
  /** Button background colour (hex). */
  bg: string
}

export interface DividerBlock extends BaseBlock {
  kind: 'divider'
}

export type ItemsColumn = { header: string; field: 'quantity' | 'description' }

export interface ItemsTableBlock extends BaseBlock {
  kind: 'items_table'
  heading?: RichText
  /** Flag variable gating the table, e.g. `has_items`. */
  flag: string
  /** Array variable iterated for rows, e.g. `items`. */
  source: string
  columns: ItemsColumn[]
  /** When set, an inverted `{{^flag}}…{{/flag}}` branch renders this instead. */
  emptyText?: RichText
}

/** Escape hatch: raw HTML/Mustache. Used for unknown templates + advanced edits. */
export interface HtmlBlock extends BaseBlock {
  kind: 'html'
  html: string
}

export type Block =
  | HeadingBlock
  | ParagraphBlock
  | NoteBlock
  | ButtonBlock
  | DividerBlock
  | ItemsTableBlock
  | HtmlBlock

export interface BannerLine {
  text: RichText
  /** Optional variable name gating the line (e.g. `po_number`). */
  showWhen?: string
}

export interface BannerConfig {
  title: RichText
  /** Banner background colour (hex). Default cargo-orange `#f75757`. */
  bg: string
  lines: BannerLine[]
}

/** The whole editable document persisted in `email_templates.content`. */
export interface TemplateDoc {
  /** Content-schema version (NOT the DB row version). */
  version: 1
  banner: BannerConfig
  blocks: Block[]
  /** Variable name used for the footer "Questions?" contact, e.g. `support_email`. */
  footerSupportVar: string
  /**
   * Whether the footer carries the review QR + "Please Review Our Services"
   * button. Defaults to true; the invite email sets it false — a customer who
   * has not received anything yet has nothing to review.
   */
  footerReview?: boolean
}

export const DEFAULT_BANNER_BG = '#f75757'

let idCounter = 0
/** Stable-ish id: crypto.randomUUID when available, else a counter fallback. */
function newId(): string {
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto
  if (c?.randomUUID) return c.randomUUID()
  idCounter += 1
  return `blk-${idCounter}`
}

/** Create a fresh block of the given kind with sensible defaults. */
export function makeBlock(kind: BlockKind): Block {
  const id = newId()
  switch (kind) {
    case 'heading':
      return { id, kind, text: 'Heading', level: 3 }
    case 'paragraph':
      return { id, kind, text: '' }
    case 'note':
      return { id, kind, label: 'Note', text: '' }
    case 'button':
      return { id, kind, label: 'Open', hrefVar: 'action_link', bg: DEFAULT_BANNER_BG }
    case 'divider':
      return { id, kind }
    case 'items_table':
      return {
        id,
        kind,
        heading: 'Package Contents',
        flag: 'has_items',
        source: 'items',
        columns: [
          { header: 'Qty', field: 'quantity' },
          { header: 'Description', field: 'description' },
        ],
      }
    case 'html':
      return { id, kind, html: '' }
  }
}

/** Human labels for the "Add block" menu. */
export const BLOCK_LABELS: Record<BlockKind, string> = {
  heading: 'Heading',
  paragraph: 'Paragraph',
  note: 'Note / callout',
  button: 'Button',
  divider: 'Divider',
  items_table: 'Items table',
  html: 'Advanced HTML',
}

/** Best-effort runtime validation of a parsed `content` value into a TemplateDoc. */
export function isTemplateDoc(value: unknown): value is TemplateDoc {
  if (!value || typeof value !== 'object') return false
  const v = value as Record<string, unknown>
  return (
    v.version === 1 &&
    !!v.banner &&
    typeof v.banner === 'object' &&
    Array.isArray(v.blocks) &&
    typeof v.footerSupportVar === 'string'
  )
}

/** Wrap an existing raw body_html into a single-block escape-hatch doc. */
export function docFromRawHtml(html: string): TemplateDoc {
  return {
    version: 1,
    banner: { title: '', bg: DEFAULT_BANNER_BG, lines: [] },
    blocks: [{ id: newId(), kind: 'html', html }],
    footerSupportVar: 'support_email',
  }
}

/** True when the doc is just a single escape-hatch HTML block (legacy/custom). */
export function isRawHtmlDoc(doc: TemplateDoc): boolean {
  return doc.blocks.length === 1 && doc.blocks[0].kind === 'html' && doc.banner.title === ''
}
