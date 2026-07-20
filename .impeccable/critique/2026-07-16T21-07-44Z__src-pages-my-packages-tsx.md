---
target: /my-packages
total_score: 22
p0_count: 1
p1_count: 2
timestamp: 2026-07-16T21-07-44Z
slug: src-pages-my-packages-tsx
---
Method: dual-agent (A: a037024ef990d2093 · B: aa71b053d7cf1f856)
Browser evidence: unavailable — Chrome extension not connected. Both agents failed to open a tab; no overlay was injected and no computed styles or screenshots were captured. Findings below are from source review plus the CLI detector. Contrast ratios and touch-target sizes are computed from source values, not measured in a live render.

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 2 | No timeline, ETA, or last-updated. The only date shown is an unlabelled `created_at` (`my-packages.tsx:183`). |
| 2 | Match System / Real World | 3 | `CUSTOMER_STATUS_META` is excellent. Docked for `en-US` dates (`format.ts:13`) in a South African depot. |
| 3 | User Control and Freedom | 2 | A reschedule request is irreversible from the customer side and leaves no visible trace. |
| 4 | Consistency and Standards | 2 | Active chip uses solid accent fill where the codebase convention (`inventory/index.tsx:145`) is a tint; raw `<button>`s miss the system focus ring. |
| 5 | Error Prevention | 3 | The dialog does state the consequence ("The driver won't attempt delivery today") but never says the request can't be undone. |
| 6 | Recognition Rather Than Recall | 3 | Chips carry live counts; search scope is honestly labelled. Docked: no way to search by item or recipient. |
| 7 | Flexibility and Efficiency | 2 | A buyer with many end users cannot find one person's parcel — search is PO-only (`:271`). |
| 8 | Aesthetic and Minimalist Design | 3 | Genuinely restrained and on-brand. Docked for inverted intra-card hierarchy. |
| 9 | Error Recovery | 1 | The error state uses a non-spinning spinner as its error glyph and offers no retry (`:364-366`). |
| 10 | Help and Documentation | 1 | No support contact, no status explanations; the empty state is a dead end (`:367-371`). |
| **Total** | | **22/40** | **Acceptable — significant improvements needed** |

## Anti-Patterns Verdict

**LLM assessment: not slop.** No gradient, no hero metric, no decorative illustration, no invented affordances. The page reaches for real primitives and `CUSTOMER_STATUS_META` (`status.ts:48-57`) is a deliberate translation layer built specifically to protect customers from console jargon. The failure is not strangeness; it is incompleteness at the emotional core.

**Deterministic scan:** 2 advisory findings, both `design-system-font-size`, zero warnings or errors.
- `my-packages.tsx:248` — a 10px count badge, off the type ramp. Genuine, minor.
- `metric-stat.tsx:27` — `2rem`, flagged but documented verbatim in DESIGN.md:237. False positive that reveals a real gap: DESIGN.md's token block and its prose disagree about the 2rem metric step.

**Visual overlays:** none. Injection never ran; the browser extension is not connected.

## Overall Impression

The craft is real and the audience boundary was drawn deliberately — `CustomerLayout` refuses the sidebar, the command palette, and the dashboards, and the status vocabulary is translated for customers. The problem is inside that good decision: the page inherits the console's *hierarchy* even though it rejected the console's *shell*. The largest element on every card is the PO number; the status — the reason a customer opened the page — is the smallest text on it. The single biggest opportunity is to invert that hierarchy and answer "where is my parcel?" on the page itself.

## What's Working

1. **`CUSTOMER_STATUS_META` (`status.ts:48-57`)** — "Pending"→"Order received", "Notified"→"Being prepared", "In Transit"→"On the way". It recognises that console vocabulary is an operational artifact and the customer's model is a journey. The unknown-status fallback returning "Processing" rather than echoing raw jargon proves it was thought through.
2. **The POD button earns its green.** `DownloadPodButton` only renders when `podAvailable` (`:177`, `:201`), so `bg-success/12 text-success` appears exclusively on delivered/collected — a clean pass on the Reserved Colour Rule. It carries an icon and the words "Proof of delivery", satisfying Never-Colour-Alone, and is shaped as a docket stub rather than a generic download button.
3. **`CustomerLayout` holds the audience line at the shell level** (`customer-layout.tsx:13-32`): no sidebar, no command palette, `max-w-3xl`.

## Priority Issues

**[P0] A reschedule request leaves no trace for the person who made it** — `my-packages.tsx:202`
`reschedule_requested` is declared on the customer interface with the comment "persists; never clears" (`customer-packages.ts:22`), and is rendered on two staff screens (`orders/index.tsx:248`, `package-details-panel.tsx:308`). It is never read on this page. After a successful request the toast fires, the status flips, `canReschedule` goes false, the button vanishes — and an hour later the customer finds zero evidence their request was received.
*Why it matters:* This is the highest-anxiety action a customer can take here, and the product forgets it in front of them. They will phone the depot — the exact side-channel PRODUCT.md names as a design failure. It also inverts the first principle: the record is the product, yet the record is withheld from the one person who is anxious about it. The data is already on the client; this is a pure display omission.
*Fix:* When `pkg.reschedule_requested`, render a persistent line — "Reschedule requested — the warehouse will arrange a new time" — regardless of status, and suppress the button.
*Suggested command:* `/impeccable harden`

**[P1] The page's most-wanted answer has no chain of custody** — `my-packages.tsx:194`
Status is a single stamp. `RouteTimeline` — which DESIGN.md calls "the visual argument for the whole product — proof that the thread was never dropped" — is never imported here. It ships only to staff, who already believe the argument.
*Why it matters:* An in-flight customer currently gets strictly less than the notification email that brought them here: "On the way" and nothing else. No ETA, no last scan. There is no reason to load the page before delivery.
*Fix:* Render a compact `RouteTimeline` per package (collapsed to the current node on mobile). It exists at `src/components/dispatch/route-timeline.tsx`.
*Suggested command:* `/impeccable craft`

**[P1] Inverted card hierarchy, and an unlabelled date that reads as an ETA** — `my-packages.tsx:183`, `:402`
The PO number renders at `text-base font-semibold` while the status stamp is 10.5px. Separately, `formatDateTime(pkg.created_at)` renders bare — no label — in the same flex row as the stamp. `updated_at` is fetched (`customer-packages.ts:21`) and never used.
*Why it matters:* "Jul 16, 2026, 2:30 PM" sitting left of a stamp reading "On the way" reads as *when it's arriving*. It is when the order was created. A customer planning around a misread date is a support call. It also breaks the Machine Value Rule — timestamps should be `.mono`, and this is in the body face.
*Fix:* Promote the status, demote the PO. Label the date ("Ordered <date>"), set it in `.mono`, and surface `updated_at` as "Last updated".
*Suggested command:* `/impeccable layout`

**[P2] The error state uses a spinner as its error icon and offers no way out** — `my-packages.tsx:364-366`
`<Loader2 className="size-4" /> Could not load your packages.` — `Loader2` with no `animate-spin`, used as an error glyph.
*Why it matters:* A frozen spinner beside failure text reads as "still loading" to anyone scanning; the interface contradicts itself. There is no retry — the only recovery is a manual reload, which a non-technical customer may not attempt. Lowest-scoring heuristic on the page and the cheapest to fix.
*Fix:* `AlertTriangle`, a "Try again" button wired to the query's `refetch()`, and a support contact line.
*Suggested command:* `/impeccable harden`

**[P2] The active filter chip is the only solid orange on the page — and it marks a filter, not an action** — `my-packages.tsx:241`
Active state is `border-primary bg-primary text-primary-foreground`. The codebase convention (`inventory/index.tsx:145`) is a tint: `bg-primary/12 text-primary`. Meanwhile the page's actual action, "Request reschedule", is `variant="outline"` (`:136`).
*Why it matters:* Orange is the One Voice — it means "act here". On this page it marks a filter while the real action is neutral. The accent is pointing at the wrong thing.
*Fix:* Tint the active chip (`bg-primary/12 text-primary`) to match inventory, and let the reschedule button carry the accent.
*Suggested command:* `/impeccable colorize`

## Persona Red Flags

**Casey (distracted mobile user)**
- Filter chips compute to ~28-30px tall (`px-3 py-1.5 text-xs`, `:239`) — under the 44px thumb target. DESIGN.md permits small targets "because dense tables and depot phones need different targets" — that licence is for staff, and this page borrowed it.
- The clear-search `X` is `size-8` = 32px (`:330`) — a miss-and-retry target one-handed.
- `autoFocus` on the reschedule textarea (`:159`) throws the keyboard up instantly, covering the DialogDescription that explains what reschedule does.
- Interrupted mid-reschedule: `reason` survives in state, but if the mutation fired, see the P0.

**Jordan (confused first-timer)**
- "Request reschedule" is disabled with no explanation (`:165`, `disabled={... || !reason.trim()}`). The `Textarea` has no label, only a placeholder, so the field reads as optional. Jordan taps and nothing happens.
- "Purchase order" is the headline of every card (`:401`). Jordan has a thing they ordered, not a PO.
- Search is PO-only. The placeholder is honest, but typing an item name yields `No orders match "headphones"` (`:377`) — Jordan concludes their order is missing.
- `No orders to show yet.` (`:370`) is a dead end: no explanation, no support contact.

**Priya (the once-a-month buyer — PRODUCT.md's secondary audience)**
- She came for one question and the page answers it in 10.5px, while pointing her at an invoice number.
- "Your orders, and those of the end users assigned to you" (`:302`) is role-taxonomy vocabulary surfaced verbatim. She thinks *my team*, not *end users assigned to me*.
- The unlabelled `created_at` beside "On the way" is exactly the trap she falls into.
- Her question — where is it right now? — is unanswerable here, so her session ends in a phone call. She is the persona the page was built for and the one it serves worst.

## Minor Observations

- `formatDateTime` hardcodes `en-US` (`format.ts:5`, `:13`). "Jul 16, 2026" for South African customers who read "16 Jul 2026". Fix at the shared helper.
- `font-mono` on the PO (`:402`) gets the family but not `tabular-nums`/`zero: 1` — use the `.mono` utility (`index.css:214`).
- Item quantities (`:64`) use `tabular-nums` in the body face; DESIGN.md names quantities as machine values → `.mono`.
- `<Card>` bakes in `shadow-sm` (`card.tsx:10`), used four times here. DESIGN.md calls this "a legacy default, not a design signal". Systemic, not this page's fault.
- The 10px count badge (`:248`) matches no documented step — the detector's one genuine hit.
- The IIFE at `:192-195` computing status meta inline should be hoisted.
- A buyer viewing an end user's out-for-delivery parcel gets no reschedule button and no explanation why (`:178`) — silent capability absence.
- `maxLength={600}` (`:157`) with no character counter — keystrokes just stop.
- Packages without a PO render a bare `Order` label (`:405`) and no identifier at all — nothing to quote on the phone, and unsearchable by construction.

## Questions to Consider

1. If the customer already knows the status from the email, what is this page *for* before delivery?
2. Why is the PO number the largest thing on a card built for someone asking "where is my parcel?"
3. The record is the product — so why can staff see `reschedule_requested` and the customer who created it cannot?
4. "Density is respect" was written about experts in the tool all day. Does it apply to someone here for forty seconds a month, or did it come along in the import?
5. What does an anxious customer do at 9pm when the page says "On the way" and the parcel hasn't arrived? There is no ETA, no contact, no next step.
