/**
 * Pre-fills the New package dialog from a looked-up purchase order: the PO's
 * customer becomes the receiver, and its ship-to (read off the Coupa email at
 * ingest) is matched to a delivery location.
 *
 * Pure, so the matching rules are testable without the dialog. Every match is
 * "one or nothing" -- a PO that could mean two locations selects neither, and
 * the user picks, rather than an order quietly going to the wrong site.
 */

/** What a PO lookup knows about where and to whom the order goes. */
export interface PoAutofillSource {
  readonly receiverId?: string | null
  readonly shipToName?: string | null
  readonly shipToAddress?: string | null
}

export interface AutofillReceiver {
  readonly id: string
  readonly email: string
}

export interface AutofillLocation {
  readonly id: string
  readonly name: string
  readonly address?: string | null
}

export interface PoAutofill {
  /** The receiver's email (the dialog's receiver value), or null. */
  readonly receiverEmail: string | null
  readonly locationId: string | null
}

/** Case-, punctuation- and spacing-insensitive: `DA01-Main Store` -> `da01 main store`. */
function normalize(value: string | null | undefined): string {
  return (value ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

/** Whether `needle` appears in `haystack` as whole words. */
function containsWords(haystack: string, needle: string): boolean {
  return ` ${haystack} `.includes(` ${needle} `)
}

/** The single entry of `list`, or null when there are none or several. */
function only<T>(list: readonly T[]): T | null {
  return list.length === 1 ? list[0] : null
}

/**
 * Picks the delivery location a ship-to names, trying the strictest rule first:
 *
 * 1. the location's name equals the ship-to name (`DA01-Main Store`);
 * 2. one name contains the other as whole words (`Main Store` in
 *    `DA01-Main Store`, the site code being optional on either side);
 * 3. the location's name appears in the ship-to address.
 *
 * A rule that matches several locations stops the search rather than falling
 * through: a looser rule cannot settle an ambiguity a stricter one found.
 */
export function matchDeliveryLocation(
  shipToName: string | null | undefined,
  shipToAddress: string | null | undefined,
  locations: readonly AutofillLocation[],
): string | null {
  const name = normalize(shipToName)
  if (!name) return null
  const address = normalize(shipToAddress)

  const named = locations
    .map((location) => ({ id: location.id, name: normalize(location.name) }))
    .filter((location) => location.name)

  const rules: ((location: { name: string }) => boolean)[] = [
    (location) => location.name === name,
    (location) => containsWords(name, location.name) || containsWords(location.name, name),
    (location) => !!address && containsWords(address, location.name),
  ]

  for (const rule of rules) {
    const matches = named.filter(rule)
    if (matches.length) return only(matches)?.id ?? null
  }
  return null
}

/** Resolves a PO lookup to the receiver and location the dialog should pre-select. */
export function resolvePoAutofill(
  po: PoAutofillSource,
  receivers: readonly AutofillReceiver[],
  locations: readonly AutofillLocation[],
): PoAutofill {
  const receiver = po.receiverId ? receivers.find((r) => r.id === po.receiverId) : undefined
  return {
    receiverEmail: receiver?.email ?? null,
    locationId: matchDeliveryLocation(po.shipToName, po.shipToAddress, locations),
  }
}
