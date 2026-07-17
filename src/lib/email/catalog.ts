// Per-template variable catalog + preview sample data.
//
// The catalog gives every dynamic value a friendly label so the "Insert value"
// menu reads in plain language instead of raw `{{tokens}}`. It is code-defined
// (not read from the unreliable `variables` DB column) and derived from the exact
// payloads each edge function injects:
//   - create-package/index.ts        → package_registered
//   - update-package/index.ts         → ready_for_collection / completed / contents_updated
//   - invite-customer/index.ts        → customer_invited
//   - _shared/email-templates.ts buildCommonVars() → COMMON_VARS (every template)

import type { EmailTemplateKey } from './blocks'

export type VarKind = 'scalar' | 'flag' | 'list'
export type VarGroup = 'This email' | 'Contact & hours' | 'Advanced'

export interface CatalogEntry {
  /** Token name inserted, e.g. `reference`. */
  name: string
  /** Friendly label shown in the menu, e.g. "Package reference". */
  label: string
  description: string
  kind: VarKind
  group: VarGroup
}

/** Injected into every template by buildCommonVars(). */
export const COMMON_VARS: CatalogEntry[] = [
  { name: 'support_email', label: 'Support email', description: 'Support inbox address.', kind: 'scalar', group: 'Contact & hours' },
  { name: 'collection_contact', label: 'Collection contact', description: 'Who to contact / extension for collection.', kind: 'scalar', group: 'Contact & hours' },
  { name: 'collection_hours_weekday', label: 'Hours — weekdays', description: 'Weekday collection hours.', kind: 'scalar', group: 'Contact & hours' },
  { name: 'collection_hours_saturday', label: 'Hours — Saturday', description: 'Saturday collection hours.', kind: 'scalar', group: 'Contact & hours' },
  { name: 'collection_hours_sunday', label: 'Hours — Sunday', description: 'Sunday collection hours.', kind: 'scalar', group: 'Contact & hours' },
  { name: 'collection_hours_holidays', label: 'Hours — holidays', description: 'Holiday collection hours.', kind: 'scalar', group: 'Contact & hours' },
  { name: 'review_form_url', label: 'Review form URL', description: 'Link to the feedback form.', kind: 'scalar', group: 'Advanced' },
  { name: 'review_qr_code_url', label: 'Review QR code URL', description: 'QR image URL for the feedback form.', kind: 'scalar', group: 'Advanced' },
  { name: 'current_year', label: 'Current year', description: 'The current calendar year.', kind: 'scalar', group: 'Advanced' },
]

const REFERENCE: CatalogEntry = { name: 'reference', label: 'Package reference', description: 'The package reference number.', kind: 'scalar', group: 'This email' }
const PO_NUMBER: CatalogEntry = { name: 'po_number', label: 'PO number', description: 'Purchase order number (may be blank).', kind: 'scalar', group: 'This email' }
const HAS_ITEMS: CatalogEntry = { name: 'has_items', label: 'Has items?', description: 'True when the package has contents.', kind: 'flag', group: 'This email' }
const ITEMS: CatalogEntry = { name: 'items', label: 'Items list', description: 'The package contents (quantity + description).', kind: 'list', group: 'This email' }
const NOTES: CatalogEntry = { name: 'notes', label: 'Customer notes', description: 'Customer-facing notes (may be blank).', kind: 'scalar', group: 'This email' }
const LOCATION_NAME: CatalogEntry = { name: 'location_name', label: 'Delivery point name', description: 'Name of the collection/delivery point.', kind: 'scalar', group: 'This email' }
const LOCATION_ADDRESS: CatalogEntry = { name: 'location_address', label: 'Delivery point address', description: 'Address of the collection point (may be blank).', kind: 'scalar', group: 'This email' }
const LOCATION_MAPS: CatalogEntry = { name: 'location_maps_link', label: 'Delivery point map link', description: 'Google Maps link for the collection point.', kind: 'scalar', group: 'Advanced' }

export const VARIABLE_CATALOG: Record<EmailTemplateKey, CatalogEntry[]> = {
  package_registered: [REFERENCE, PO_NUMBER, NOTES, HAS_ITEMS, ITEMS, LOCATION_NAME, LOCATION_ADDRESS, LOCATION_MAPS, ...COMMON_VARS],
  package_ready_for_collection: [REFERENCE, PO_NUMBER, NOTES, HAS_ITEMS, ITEMS, LOCATION_NAME, LOCATION_ADDRESS, LOCATION_MAPS, ...COMMON_VARS],
  package_completed: [REFERENCE, PO_NUMBER, NOTES, HAS_ITEMS, ITEMS, ...COMMON_VARS],
  package_contents_updated: [
    REFERENCE,
    PO_NUMBER,
    NOTES,
    { name: 'has_updated_items', label: 'Has updated items?', description: 'True when there are updated contents.', kind: 'flag', group: 'This email' },
    { name: 'updated_items', label: 'Updated items list', description: 'The new package contents.', kind: 'list', group: 'This email' },
    { name: 'has_previous_items', label: 'Has previous items?', description: 'True when there were previous contents.', kind: 'flag', group: 'This email' },
    { name: 'previous_items', label: 'Previous items list', description: 'The package contents before the edit.', kind: 'list', group: 'This email' },
    ...COMMON_VARS,
  ],
  customer_invited: [
    { name: 'name', label: 'Customer first name', description: "The customer's first name.", kind: 'scalar', group: 'This email' },
    { name: 'company_name', label: 'Company name', description: "The customer's company.", kind: 'scalar', group: 'This email' },
    { name: 'action_link', label: 'Set-password link', description: 'The button link to set a password and sign in.', kind: 'scalar', group: 'This email' },
    { name: 'portal_url', label: 'Portal URL', description: 'Link to the customer portal.', kind: 'scalar', group: 'This email' },
    { name: 'is_buyer', label: 'Is a Buyer?', description: 'True when the customer is a Buyer.', kind: 'flag', group: 'This email' },
    { name: 'is_runner', label: 'Is an End user?', description: 'True when the customer is an End user.', kind: 'flag', group: 'This email' },
    ...COMMON_VARS,
  ],
}

/** Common preview values injected for every template (mirror of buildCommonVars defaults). */
const COMMON_SAMPLE: Record<string, unknown> = {
  support_email: 'rabelanimm@gmail.com',
  collection_contact: 'Ext 4536 and ask for Lesedi or Thato',
  collection_hours_weekday: 'Monday to Friday, 7:00 AM - 16:00 PM',
  collection_hours_saturday: 'Saturdays: Closed',
  collection_hours_sunday: 'Sundays: Closed',
  collection_hours_holidays: 'Holidays: Closed',
  review_form_url: 'https://example.com/review',
  review_qr_code_url: 'https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=review',
  current_year: '2026',
}

const SAMPLE_ITEMS = [
  { quantity: 2, description: 'Ceramic mug set' },
  { quantity: 1, description: 'Wireless keyboard' },
]

/** Realistic per-template preview data so loops/conditionals actually render. */
export const SAMPLE_DATA: Record<EmailTemplateKey, Record<string, unknown>> = {
  package_registered: {
    ...COMMON_SAMPLE,
    reference: 'PKG-20260712-71E9',
    po_number: 'GG80666810',
    notes: 'Please handle the glassware with care.',
    items: SAMPLE_ITEMS,
    has_items: true,
    location_name: 'Polokwane Depot',
    location_address: '12 Market St, Polokwane',
    location_maps_link: 'https://maps.example/xyz',
  },
  package_ready_for_collection: {
    ...COMMON_SAMPLE,
    reference: 'PKG-20260712-71E9',
    po_number: 'GG80666810',
    notes: 'Please handle the glassware with care.',
    items: SAMPLE_ITEMS,
    has_items: true,
    location_name: 'Polokwane Depot',
    location_address: '12 Market St, Polokwane',
    location_maps_link: 'https://maps.example/xyz',
  },
  package_completed: {
    ...COMMON_SAMPLE,
    reference: 'PKG-20260712-71E9',
    po_number: 'GG80666810',
    notes: 'Please handle the glassware with care.',
    items: SAMPLE_ITEMS,
    has_items: true,
  },
  package_contents_updated: {
    ...COMMON_SAMPLE,
    reference: 'PKG-20260712-71E9',
    po_number: 'GG80666810',
    notes: 'Swapped the keyboard for a mouse.',
    updated_items: [
      { quantity: 2, description: 'Ceramic mug set' },
      { quantity: 1, description: 'Wireless mouse' },
    ],
    has_updated_items: true,
    previous_items: SAMPLE_ITEMS,
    has_previous_items: true,
  },
  customer_invited: {
    ...COMMON_SAMPLE,
    name: 'Thabo Mokoena',
    company_name: 'Acme Trading',
    action_link: 'https://app.example/set-password?token=sample',
    portal_url: 'https://app.example/my-packages',
    is_buyer: true,
    is_runner: false,
  },
}
