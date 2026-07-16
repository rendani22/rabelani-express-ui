# Product

## Register

product

## Platform

web

## Users

Depot dispatchers and admins are the primary users. They work a counter and a floor — at a desk when things are calm, on a phone in the depot when they aren't — moving parcels through intake, dispatch, driver assignment, and collection. They are experts in the operation, in it all day, and usually mid-task with someone waiting. The job to be done is moving a parcel from purchase order to a signed proof of delivery without losing the thread.

Customers are a secondary, deliberately narrower audience. They meet the product through `/my-packages` and the transactional emails, not the console — they check one parcel, occasionally, and need the reference and the proof rather than the whole operation.

## Product Purpose

Dispatch runs a courier depot end to end: purchase orders, inventory, package tracking, driver dispatch, proof of delivery, and the customer and staff records around them. It exists to be the **only** place the depot's work lives, replacing the spreadsheets, message threads, and paper waybills that otherwise run alongside a system and quietly become the real source of truth.

Success is four things at once. Nothing gets lost or disputed: every parcel carries a traceable chain of custody and a signed POD, so a disagreement is settled by the record rather than an argument. The console keeps up at the counter — dispatches, pickups, and collections take few enough clicks and seconds to work in real time under pressure. The paper trail is gone, not merely duplicated. And management can see volume, SLA breaches, and revenue without asking anyone to produce a report.

## Positioning

Purchase order to signed POD in one system. The whole courier lifecycle — order, stock, dispatch, driver, signature, proof — lives in one console instead of a set of stitched-together tools, and every screen should reinforce that the thread is never dropped between stages.

## Brand Personality

Calm, industrial, in control. The voice is that of a competent operator: plain, direct, unhurried, never chatty and never alarmed. Visually it borrows from depot signage — hi-vis where action is required, quiet everywhere else, nothing decorative. The intended feeling is a floor supervisor who has already seen today's problem before: this is under control, here is where the parcel is.

## Anti-references

- **Generic SaaS dashboards.** Purple gradients, identical rounded card grids, hero metrics, decorative illustration.
- **Enterprise logistics software.** The dense grey SAP/WMS look — crowded toolbars, no hierarchy, everything at the same weight.
- **Consumer parcel-tracking apps.** Playful, animated, celebratory. Wrong register for people doing this all day.
- **The pre-rewrite Angular app** this replaced (preserved at the `angular-archive` tag). Feature parity was the goal; its look was not.

## Design Principles

**The record is the product.** Proof, chain of custody, and audit trail are what the depot is actually selling. Anything that makes the record clearer, more complete, or harder to dispute wins over anything that makes a screen prettier.

**Density is respect.** These are expert users, in the tool all day, mid-task. Show them the information rather than protecting them from it — but earn the density with hierarchy, so a glance finds the one thing that matters.

**One system, no side channels.** If a workflow pushes someone back to a spreadsheet, a phone call, or a note on paper, that's a design failure, not a user habit.

**Signage, not decoration.** Every visual signal is functional: hi-vis marks the action, semantic color carries a specific meaning and nothing else, depth comes from borders because this is a tool, not a brochure.

**Readable in the worst conditions.** The design target is a phone under depot glare, held one-handed, glanced at for a second — not a designer's monitor.

## Accessibility & Inclusion

WCAG AA is the baseline: contrast, keyboard navigation, and a reduced-motion path for anything that moves. Beyond the standard, the depot conditions are a real constraint — glare, quick glances, one-handed phone use — so status must never rely on color alone. It carries a label, a shape, or a mark as well, which is why package status renders as a stamp with text and a tick rather than a colored dot.
