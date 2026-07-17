// The 5 known templates expressed as friendly block documents, on the unified
// shell. This is the canonical structured content: it seeds the DB (see the
// migration) and backs the editor's "Reset to default" action. Emphasis uses
// `**bold**`; dynamic values use `{{tokens}}` inserted via the catalog.
//
// Each template opens with the reference strip — the customer's reference is the
// one thing they actually need, so it leads. The banner title is the document
// label in the masthead ("Collection notice"), not a headline.

import { DEFAULT_BANNER_BG, DELIVERED_ACCENT, type TemplateDoc, type EmailTemplateKey } from './blocks'

// Deterministic ids (no crypto) so the seed is stable across reads.
let n = 0
const id = () => `seed-${(n += 1)}`

const itemsTable = (heading: string, flag: string, source: string, emptyText?: string) => ({
  id: id(),
  kind: 'items_table' as const,
  heading,
  flag,
  source,
  columns: [
    { header: 'Qty', field: 'quantity' as const },
    { header: 'Description', field: 'description' as const },
  ],
  ...(emptyText ? { emptyText } : {}),
})

/** The waybill strip, per template: only the chip text and accent change. */
const strip = (status: string, accent: string = DEFAULT_BANNER_BG) => ({
  id: id(),
  kind: 'reference_strip' as const,
  status,
  accent,
  label: 'Package reference',
  value: '{{reference}}',
  meta: 'Purchase order · {{po_number}}',
  metaShowWhen: 'po_number',
})

export const SEED_CONTENT: Record<EmailTemplateKey, TemplateDoc> = {
  package_registered: {
    version: 1,
    banner: { title: 'Order confirmation', bg: DEFAULT_BANNER_BG, lines: [] },
    blocks: [
      strip('Registered'),
      { id: id(), kind: 'paragraph', text: 'A package has been registered for you and is being prepared. We will email you again when it is ready to collect.' },
      { id: id(), kind: 'note', label: 'Notes', text: '{{notes}}', showWhen: 'notes' },
      itemsTable('Contents', 'has_items', 'items'),
      { id: id(), kind: 'heading', level: 3, text: 'Collection point' },
      { id: id(), kind: 'paragraph', text: '**{{location_name}}**' },
      { id: id(), kind: 'paragraph', text: '{{location_address}}', showWhen: 'location_address' },
      { id: id(), kind: 'paragraph', text: 'Contact {{collection_contact}}' },
    ],
    footerSupportVar: 'support_email',
  },

  package_ready_for_collection: {
    version: 1,
    banner: { title: 'Collection notice', bg: DEFAULT_BANNER_BG, lines: [] },
    blocks: [
      strip('Ready for collection'),
      { id: id(), kind: 'paragraph', text: 'Your package is ready for collection at **{{location_name}}**. Bring the reference above, a valid staff card, and a witness to sign with.' },
      { id: id(), kind: 'note', label: 'Notes', text: '{{notes}}', showWhen: 'notes' },
      itemsTable('Contents', 'has_items', 'items'),
      { id: id(), kind: 'heading', level: 3, text: 'Collection point' },
      { id: id(), kind: 'paragraph', text: '**{{location_name}}**' },
      { id: id(), kind: 'paragraph', text: '{{location_address}}', showWhen: 'location_address' },
      { id: id(), kind: 'paragraph', text: 'Contact {{collection_contact}}' },
      { id: id(), kind: 'heading', level: 3, text: 'Collection hours' },
      { id: id(), kind: 'paragraph', text: '{{collection_hours_weekday}}' },
      { id: id(), kind: 'paragraph', text: '{{collection_hours_saturday}}' },
      { id: id(), kind: 'paragraph', text: '{{collection_hours_sunday}}' },
      { id: id(), kind: 'paragraph', text: '{{collection_hours_holidays}}' },
    ],
    footerSupportVar: 'support_email',
  },

  package_completed: {
    version: 1,
    banner: { title: 'Completion notice', bg: DELIVERED_ACCENT, lines: [] },
    blocks: [
      // The only template that carries green — the order is actually delivered.
      strip('Delivered', DELIVERED_ACCENT),
      { id: id(), kind: 'paragraph', text: 'Collection is complete. The signed proof of delivery is attached to this email as a PDF. Thank you for your order.' },
      { id: id(), kind: 'note', label: 'Notes', text: '{{notes}}', showWhen: 'notes' },
      itemsTable('Contents', 'has_items', 'items'),
    ],
    footerSupportVar: 'support_email',
  },

  package_contents_updated: {
    version: 1,
    banner: { title: 'Amendment notice', bg: DEFAULT_BANNER_BG, lines: [] },
    blocks: [
      strip('Contents updated'),
      { id: id(), kind: 'paragraph', text: 'The contents of your package have been amended. The current contents are below.' },
      itemsTable('Updated contents', 'has_updated_items', 'updated_items', 'No items.'),
      itemsTable('Previous contents', 'has_previous_items', 'previous_items', 'No items.'),
      { id: id(), kind: 'note', label: 'Notes', text: '{{notes}}', showWhen: 'notes' },
    ],
    footerSupportVar: 'support_email',
  },

  customer_invited: {
    version: 1,
    banner: { title: 'Account invitation', bg: DEFAULT_BANNER_BG, lines: [] },
    blocks: [
      { id: id(), kind: 'heading', level: 1, text: 'Welcome to Rabelani Express' },
      { id: id(), kind: 'paragraph', text: 'Hello {{name}}, an account has been created for you at **{{company_name}}**. Set a password to sign in.' },
      { id: id(), kind: 'paragraph', text: 'As a **Buyer**, you can view **your own packages and those of the end users assigned to you** at {{company_name}} — reference, contents, status, and any notes we’ve added for you.', showWhen: 'is_buyer' },
      { id: id(), kind: 'paragraph', text: 'As an **End user**, you can view **the packages assigned to you** — reference, contents, status, and any notes we’ve added for you.', showWhen: 'is_runner' },
      { id: id(), kind: 'button', label: 'Set your password', hrefVar: 'action_link', bg: DEFAULT_BANNER_BG },
      { id: id(), kind: 'paragraph', text: 'This link expires after a while — if it stops working, ask your administrator to re-send the invite.' },
    ],
    footerSupportVar: 'support_email',
    // No review QR: an invited customer has not received a package to review yet.
    footerReview: false,
  },
}
