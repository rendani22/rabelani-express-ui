// The 5 known templates expressed as friendly block documents, on the unified
// shell. This is the canonical structured content: it seeds the DB (see the
// migration) and backs the editor's "Reset to default" action. Emphasis uses
// `**bold**`; dynamic values use `{{tokens}}` inserted via the catalog.

import { DEFAULT_BANNER_BG, type TemplateDoc, type EmailTemplateKey } from './blocks'

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

const refLines = [
  { text: 'Purchase Order Number: **{{po_number}}**', showWhen: 'po_number' },
  { text: 'Your Package Reference: **{{reference}}**' },
]

export const SEED_CONTENT: Record<EmailTemplateKey, TemplateDoc> = {
  package_registered: {
    version: 1,
    banner: { title: 'Purchase Order Confirmation', bg: DEFAULT_BANNER_BG, lines: refLines },
    blocks: [
      { id: id(), kind: 'paragraph', text: 'Hello,' },
      { id: id(), kind: 'paragraph', text: 'A package has been registered for you and is being prepared.' },
      { id: id(), kind: 'note', label: 'Notes', text: '{{notes}}', showWhen: 'notes' },
      itemsTable('Package Contents', 'has_items', 'items'),
      { id: id(), kind: 'heading', level: 3, text: 'Delivery Point' },
      { id: id(), kind: 'paragraph', text: '**{{location_name}}**' },
      { id: id(), kind: 'paragraph', text: '{{location_address}}', showWhen: 'location_address' },
      { id: id(), kind: 'paragraph', text: 'Contact Number: {{collection_contact}}' },
    ],
    footerSupportVar: 'support_email',
  },

  package_ready_for_collection: {
    version: 1,
    banner: { title: 'Ready for Collection', bg: DEFAULT_BANNER_BG, lines: refLines },
    blocks: [
      { id: id(), kind: 'paragraph', text: 'Your package is ready for collection at **{{location_name}}**.' },
      itemsTable('Package Contents', 'has_items', 'items'),
      { id: id(), kind: 'divider' },
      { id: id(), kind: 'heading', level: 3, text: '📍 Delivery Point' },
      { id: id(), kind: 'paragraph', text: '**{{location_name}}**' },
      { id: id(), kind: 'paragraph', text: '{{location_address}}', showWhen: 'location_address' },
      { id: id(), kind: 'paragraph', text: 'Contact Number: {{collection_contact}}' },
      { id: id(), kind: 'heading', level: 3, text: 'Collection Hours' },
      { id: id(), kind: 'paragraph', text: '{{collection_hours_weekday}}' },
      { id: id(), kind: 'paragraph', text: '{{collection_hours_saturday}}' },
      { id: id(), kind: 'paragraph', text: '{{collection_hours_sunday}}' },
      { id: id(), kind: 'paragraph', text: '{{collection_hours_holidays}}' },
      { id: id(), kind: 'heading', level: 3, text: 'What to bring when collecting' },
      { id: id(), kind: 'paragraph', text: '• Your PO reference number (shown above)' },
      { id: id(), kind: 'paragraph', text: '• Valid Staff Employee Card for verification, and a Witness to sign with' },
    ],
    footerSupportVar: 'support_email',
  },

  package_completed: {
    version: 1,
    banner: { title: 'Package Completed', bg: DEFAULT_BANNER_BG, lines: refLines },
    blocks: [
      { id: id(), kind: 'paragraph', text: 'Your Package Collection/Delivery has been completed. Thank you for your Order.' },
      itemsTable('Package Contents', 'has_items', 'items'),
    ],
    footerSupportVar: 'support_email',
  },

  package_contents_updated: {
    version: 1,
    banner: { title: 'Package Contents Updated', bg: DEFAULT_BANNER_BG, lines: refLines },
    blocks: [
      { id: id(), kind: 'paragraph', text: 'Your Package has been edited.' },
      itemsTable('Updated Contents', 'has_updated_items', 'updated_items', 'No items.'),
      itemsTable('Previous Contents', 'has_previous_items', 'previous_items', 'No items.'),
      { id: id(), kind: 'note', label: 'Notes', text: '{{notes}}', showWhen: 'notes' },
      { id: id(), kind: 'paragraph', text: 'Thank you for your Order.' },
    ],
    footerSupportVar: 'support_email',
  },

  customer_invited: {
    version: 1,
    banner: { title: 'Welcome to Rabelani Express', bg: DEFAULT_BANNER_BG, lines: [] },
    blocks: [
      { id: id(), kind: 'paragraph', text: 'Hello {{name}},' },
      { id: id(), kind: 'paragraph', text: 'An account has been created for you at **{{company_name}}**. Click the button below to set your password and sign in.' },
      { id: id(), kind: 'paragraph', text: 'As a **Buyer**, you can view **every package ordered under {{company_name}}** — reference, contents, status, and any notes we’ve added for you.', showWhen: 'is_buyer' },
      { id: id(), kind: 'paragraph', text: 'As a **Runner**, you can view **the packages assigned to you** — reference, contents, status, and any notes we’ve added for you.', showWhen: 'is_runner' },
      { id: id(), kind: 'button', label: 'Set your password', hrefVar: 'action_link', bg: DEFAULT_BANNER_BG },
      { id: id(), kind: 'paragraph', text: 'This link expires after a while — if it stops working, ask your administrator to re-send the invite.' },
    ],
    footerSupportVar: 'support_email',
    // No review QR: an invited customer has not received a package to review yet.
    footerReview: false,
  },
}
