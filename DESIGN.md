---
name: Dispatch — Rabelani Express
description: An operational control surface for a courier depot — hi-vis where it acts, quiet everywhere else.
colors:
  cargo-orange: "oklch(0.665 0.185 47)"
  cargo-orange-dark: "oklch(0.7 0.19 48)"
  ink-on-orange: "oklch(0.2 0.03 60)"
  warm-paper: "oklch(0.986 0.004 80)"
  label-stock: "oklch(0.997 0.002 80)"
  depot-ink: "oklch(0.22 0.012 60)"
  depot-graphite: "oklch(0.165 0.006 250)"
  depot-graphite-raised: "oklch(0.196 0.006 250)"
  stencil-grey: "oklch(0.52 0.012 60)"
  hairline: "oklch(0.9 0.006 70)"
  delivered-green: "oklch(0.6 0.13 150)"
  caution-amber: "oklch(0.8 0.15 82)"
  returned-red: "oklch(0.577 0.22 27)"
  route-blue: "oklch(0.55 0.14 245)"
typography:
  display:
    fontFamily: "Archivo Variable, ui-sans-serif, system-ui, sans-serif"
    fontSize: "2.75rem"
    fontWeight: 600
    lineHeight: 1
    letterSpacing: "-0.02em"
  metric:
    fontFamily: "Archivo Variable, ui-sans-serif, system-ui, sans-serif"
    fontSize: "2rem"
    fontWeight: 600
    lineHeight: 1
    letterSpacing: "-0.02em"
    fontFeature: "tabular-nums"
  headline:
    fontFamily: "Archivo Variable, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.75rem"
    fontWeight: 600
    lineHeight: 1.15
    letterSpacing: "-0.015em"
  title:
    fontFamily: "Archivo Variable, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.125rem"
    fontWeight: 600
    lineHeight: 1.3
    letterSpacing: "-0.01em"
  body:
    fontFamily: "Archivo Variable, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: "normal"
  label:
    fontFamily: "Archivo Variable, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.6875rem"
    fontWeight: 600
    lineHeight: 1
    letterSpacing: "0.14em"
  code:
    fontFamily: "JetBrains Mono Variable, ui-monospace, monospace"
    fontSize: "0.8125rem"
    fontWeight: 400
    lineHeight: 1.4
    letterSpacing: "-0.01em"
    fontFeature: "tabular-nums, zero 1"
rounded:
  sm: "2.4px"
  md: "4.4px"
  lg: "6.4px"
  xl: "10.4px"
  stamp: "3px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "16px"
  lg: "24px"
  xl: "32px"
components:
  button-primary:
    backgroundColor: "{colors.cargo-orange}"
    textColor: "{colors.ink-on-orange}"
    rounded: "{rounded.md}"
    padding: "8px 16px"
    height: "36px"
  button-primary-hover:
    backgroundColor: "oklch(0.665 0.185 47 / 90%)"
  button-outline:
    backgroundColor: "{colors.warm-paper}"
    textColor: "{colors.depot-ink}"
    rounded: "{rounded.md}"
    padding: "8px 16px"
    height: "36px"
  button-ghost:
    textColor: "{colors.depot-ink}"
    rounded: "{rounded.md}"
    padding: "8px 16px"
    height: "36px"
  input:
    backgroundColor: "transparent"
    textColor: "{colors.depot-ink}"
    rounded: "{rounded.md}"
    padding: "4px 12px"
    height: "36px"
  card:
    backgroundColor: "{colors.label-stock}"
    textColor: "{colors.depot-ink}"
    rounded: "{rounded.xl}"
    padding: "24px 0"
  status-stamp:
    rounded: "{rounded.stamp}"
    padding: "2px 6px"
    typography: "{typography.label}"
  section-label:
    textColor: "{colors.stencil-grey}"
    typography: "{typography.label}"
  tracking-number:
    textColor: "{colors.depot-ink}"
    typography: "{typography.code}"
  metric-stat:
    textColor: "{colors.depot-ink}"
    typography: "{typography.metric}"
---

# Design System: Dispatch — Rabelani Express

## 1. Overview

**Creative North Star: "The Control Surface"**

Dispatch is the panel a courier depot is run from. The governing image is not a website and not a dashboard — it is a piece of operational equipment: hi-vis exactly where a hand must act, quiet and legible everywhere else, and utterly calm under load. Every surface earns its place by helping someone move a parcel from purchase order to signed proof of delivery without dropping the thread. If an element does not help someone act, confirm, or prove, it does not belong on the panel.

Light mode is warm label stock — the paper a waybill is printed on. Dark mode is cool depot-at-night graphite, which exists because the work does not stop when the light does, and because a single cargo orange reads like a hi-vis vest against it. Depth is carried by borders and small tonal shifts between surfaces, never by shadow: this is a tool, and tools are flat. Density is high because the users are experts who are in this all day, but density is paid for with hierarchy — size, weight, and colour working together so a one-second glance finds the one thing that matters.

The system explicitly rejects the registers it could easily have drifted into. Not a generic SaaS dashboard: no gradients, no identical rounded card grids, no hero-metric theatre. Not enterprise logistics software: no undifferentiated grey wall where everything has the same weight. Not a consumer parcel-tracking app: nothing playful, animated, or celebratory in a tool that someone operates for eight hours.

**Key Characteristics:**
- One accent (cargo orange), reserved for action and brand — roughly 10% of any screen.
- Colour is semantic before it is decorative; green means delivered, and nothing else.
- Flat by doctrine: borders and surface tint, never shadow.
- Machine values (references, codes, timestamps, weights, money) are always monospace and tabular.
- Hierarchy from size **plus weight plus colour** — never size alone.
- Legible at a glance on a phone, under depot glare, held one-handed.

## 2. Colors

A working palette drawn from the depot itself: paper and ink for the record, hi-vis orange for the hand, and a small set of reserved signal colours that each mean exactly one thing.

### Primary
- **Cargo Orange** (`{colors.cargo-orange}`, dark mode `{colors.cargo-orange-dark}`): The single accent. Primary actions, the active nav bar, focus rings, brand marks, and the first chart series. It is always set with **Ink-on-Orange** (`{colors.ink-on-orange}`) text rather than white — black-on-orange is how hi-vis signage works, and it holds contrast where white would glare. Never used to decorate, never used to mean a status.

### Secondary
There is no secondary accent, by design. Anything competing with cargo orange for the eye would cost it its meaning. Where a second visual voice is genuinely needed, use a neutral surface or a reserved signal colour below.

### Tertiary
- **Route Blue** (`{colors.route-blue}`): Maps, chart series, and the "notified" state only. It is the one colour permitted to appear alongside orange without contesting it, because it never marks an action.

### Neutral
- **Warm Paper** (`{colors.warm-paper}`): The light-mode canvas. Label stock, not white — it takes the glare off a long shift.
- **Label Stock** (`{colors.label-stock}`): Raised surfaces in light mode (cards, popovers). Lighter than the canvas: elevation reads as *closer to the light*.
- **Depot Ink** (`{colors.depot-ink}`): Body and heading text in light mode. A warm near-black, never a grey.
- **Depot Graphite** (`{colors.depot-graphite}`) / **Graphite Raised** (`{colors.depot-graphite-raised}`): The dark-mode canvas and its raised surfaces, stepped roughly +3% lightness per level of elevation. Cool, so the orange stays warm against it.
- **Stencil Grey** (`{colors.stencil-grey}`): Section labels, secondary metadata, and de-emphasised text. The demotion tool.
- **Hairline** (`{colors.hairline}`): Borders and dividers. In dark mode, borders become a low-opacity white (`oklch(1 0 0 / 9%)`) rather than a lighter grey.

### Named Rules

**The One Voice Rule.** Cargo orange is the only accent, and it appears on no more than ~10% of any screen. Its rarity is what makes it mean "act here". A screen where two things are orange is a screen where nothing is.

**The Reserved Colour Rule.** Signal colours are vocabulary, not decoration, and each has exactly one meaning: **Delivered Green** (`{colors.delivered-green}`) = delivered or collected, and nothing else, ever. **Caution Amber** (`{colors.caution-amber}`) = waiting or caution, kept deliberately distinct in hue from cargo orange. **Returned Red** (`{colors.returned-red}`) = returned or destructive. If you want green because a number is good, you want the wrong colour — the one documented exception is a ledger of quantities (inventory movements, delivered value), where +/- green/red reads as an account rather than a package status.

**The Orange-Is-Not-Ink Rule.** Cargo orange measures **3.3:1 on a light surface** — it is a *surface* colour and a *marker*, never body text. `text-primary` below 18px (or below 14px bold) fails WCAG AA on the light theme, tinted backgrounds included; the orange looks fine to a designer on a bright monitor and disappears under depot glare. Set the text in ink and let the orange carry the tint, the border, the underline, or the fill behind ink-on-orange. Dark mode passes comfortably (6.4:1), so this is a light-theme rule — and light is where the depot works by day. Measure, don't eyeball.

**The Never-Colour-Alone Rule.** No state is communicated by hue alone. Depot glare, a one-second glance, and colour blindness all break it. Every status carries a word, a mark, or a shape as well — which is why a package status is a stamp with text and a tick, not a coloured dot.

## 3. Typography

**Display Font:** Archivo Variable (with `ui-sans-serif, system-ui, sans-serif`)
**Body Font:** Archivo Variable — one family, many weights
**Label/Mono Font:** JetBrains Mono Variable (with `ui-monospace, monospace`)

**Character:** Archivo is an industrial signage grotesque: it looks stencilled onto a crate, holds up at 11px, and does not perform. Pairing it with JetBrains Mono contrasts on a real axis (grotesque against monospace) rather than the mushy near-match of two similar sans faces. The mono is not a stylistic flourish — it marks the values a machine produced and a human must read back correctly.

### Hierarchy
- **Display** (600, 2.75rem+, line-height 1, `-0.02em`): The largest numbers. Tabular, always. Rare.
- **Metric** (600, 2rem, line-height 1, `-0.02em`): The `MetricStat` hero number — the dispatch-strip step. Tabular, always.
- **Headline** (600, 1.75rem, 1.15, `-0.015em`): Page titles.
- **Title** (600, 1.125rem, 1.3, `-0.01em`): Panel and card headings.
- **Body** (400, 0.875rem, 1.5): The working default. Prose caps at 65–75ch, though genuine prose is rare here.
- **Label** (600, 0.6875rem, `0.14em`, uppercase): Section labels — the stencil-on-a-crate mark that heads panels and metric groups. Always in Stencil Grey.
- **Code** (400, 0.8125rem, tabular, `zero: 1`): Tracking numbers, references, PO numbers, timestamps, weights, quantities, money.

### Named Rules

**The Three Levers Rule.** Hierarchy comes from size, weight, and colour together. Making a thing bigger is the laziest of the three and the first to break a dense screen; a demoted label at the same size in Stencil Grey does more work than a point size ever will.

**The Machine Value Rule.** If a value came from a machine and a human might read it aloud, type it, or compare it in a column, it is monospace and tabular. Tracking numbers, references, POs, timestamps, weights, quantities, money. No exceptions — a tracking number set in the body face is a bug.

## 4. Elevation

This system has no shadow vocabulary, and that is a decision rather than an omission. Depth is built from **borders and surface tint**: a raised surface is a different lightness than its canvas plus a hairline border, stepped about +3% lightness per level. Light mode raises *toward* the light (Label Stock is lighter than Warm Paper); dark mode does the same against graphite, and swaps grey borders for low-opacity white so edges read without turning milky. The residual `shadow-xs` / `shadow-sm` on inherited shadcn primitives is a legacy default, not a design signal — never build on it.

### Named Rules

**The Flat Tool Rule.** No decorative shadows, no glassmorphism, no blur. Shadows imply objects floating in space; this is a panel, and a panel's parts are set into the surface. If a surface needs to separate, give it a border or a tint step. If it needs to lift, ask whether it should be a dialog instead.

**The Audit Test.** If a screenshot looks like it could carry a drop shadow without anything changing, the borders are doing too little work. Fix the border and the tint step, not the shadow.

## 5. Components

### Buttons
- **Shape:** Slightly softened corners (4.4px), never a pill.
- **Primary:** Cargo orange with ink-on-orange text (`{components.button-primary}`), hovering to 90% opacity. This is the one action on the screen that matters; there should rarely be two.
- **Hover / Focus:** 150ms transition; focus-visible draws a 3px ring in `{colors.cargo-orange}` at 50% plus a border shift. Press gives `active:scale-[0.97]` — a small mechanical acknowledgement, like a real key.
- **Secondary / Outline / Ghost:** Neutral surfaces, no orange. A secondary action that borrows the accent steals the primary's meaning.
- **Sizes:** A real range down to 24px (`xs`) and up to 40px (`lg`), because dense tables and depot phones need different targets. Default is 36px.

### Chips
- **Style:** See the **Status Stamp** signature below — it replaces the generic chip for anything status-bearing. Filter chips are neutral surfaces with a border, selected state via tint rather than accent fill.

### Cards / Containers
- **Corner Style:** 10.4px (`{rounded.xl}`) — the softest thing in the system, and only because a container's job is to be quiet.
- **Background:** Label Stock in light, Graphite Raised in dark.
- **Shadow Strategy:** None. Border plus tint step. See Elevation.
- **Border:** Always. It is the entire depth mechanism.
- **Internal Padding:** 24px vertical, on the 8px grid.
- Cards are not the default answer to grouping. Nested cards are always wrong.

### Inputs / Fields
- **Style:** Transparent background over a hairline border, 4.4px corners, 36px tall. In dark mode a faint fill (`input/30`) keeps the field findable.
- **Focus:** Border shifts to cargo orange with a 3px ring at 50% — the same focus language as buttons, so the panel behaves consistently under a keyboard.
- **Error / Disabled:** `aria-invalid` drives a Returned Red border and ring; disabled drops to 50% opacity with pointer events off.
- Native number spinners are stripped globally — they crowd multi-digit values.
- Any dropdown backed by data uses the searchable **Combobox**, not a plain select. Plain selects are for tiny fixed sets like page size.

### Navigation
- **Style:** Sidebar shares the canvas background, separated by a border rather than a fill. Nav items are grouped; the active item is marked with a cargo-orange bar — the one place the accent appears without being a button.
- **Mobile:** The sidebar becomes a Sheet. The header carries the command palette (⌘K), notifications, and theme toggle.

### Status Stamp (signature)
A package status rendered as a rubber ink-stamp on a waybill, and the most recognisable element in the product. Rectangular (3px corners — **not** a pill), uppercase, 10.5px/700 at `0.09em`, with a bordered and tinted surface in its tone and a small leading tick dot. Tones map from `src/lib/status.ts`: neutral, route, transit, wait, done, alert. It embodies the Never-Colour-Alone Rule — the word and the tick do the work; the tint only confirms it.

### Tracking Number (signature)
The waybill ID as a first-class monospace token, at 0.8125rem with tight tracking. It is the recurring texture of the whole product — the thing a user's eye hunts for on every screen. The `copyable` variant reveals a copy icon on hover and flashes a Delivered Green check on success.

### Route Timeline (signature)
Chain of custody drawn as a vertical route line with node stops: done nodes filled orange, the current node ringed with a ping, upcoming nodes hollow. It is the visual argument for the whole product — proof that the thread was never dropped.

### Metric Stat (signature)
A dispatch-strip metric: a 2rem tabular number, a demoted tracked Section Label above it, and an optional signed delta (green up, red down — a ledger, not a package status). Three type levers, not size alone.

### Section Label (signature)
A stencil-on-a-crate label: 11px, 600, uppercase, `0.14em`, Stencil Grey. The workhorse of hierarchy. Reach for it before reaching for a bigger heading.

## 6. Do's and Don'ts

### Do:
- **Do** bind to semantic tokens (`bg-primary`, `text-muted-foreground`, `border-border`). Raw hex or a Tailwind grey is always a bug — it breaks dark mode silently.
- **Do** set every machine-produced value in `.mono` with tabular figures: tracking numbers, references, POs, timestamps, weights, quantities, money.
- **Do** build depth from borders and a tint step of ~3% lightness per elevation level.
- **Do** reach for the dispatch signatures (`StatusStamp`, `TrackingNumber`, `RouteTimeline`, `MetricStat`, `SectionLabel`) before inventing a new pattern, and for shadcn primitives before raw HTML.
- **Do** demote with Stencil Grey and the 11px tracked label before promoting with size.
- **Do** give every status a word or a mark alongside its colour.
- **Do** keep cargo orange to ~10% of the screen, and to actions and brand only.
- **Do** use the searchable Combobox for any data-backed dropdown.
- **Do** design for the worst case: a phone under depot glare, one-handed, glanced at for a second.
- **Do** give every animation a `prefers-reduced-motion` alternative.

### Don't:
- **Don't** ship anything that reads as a **generic SaaS dashboard** — no gradients, no gradient text, no identical rounded card grids, no hero-metric theatre, no decorative illustration.
- **Don't** ship anything that reads as **enterprise logistics software** — a grey wall where every element has the same weight is the failure mode this design exists to avoid.
- **Don't** ship anything that reads as a **consumer parcel-tracking app** — nothing playful, celebratory, or animated for its own sake in a tool someone operates all day.
- **Don't** use green for anything but delivered or collected. A good number is not green. The only exception is a quantity ledger, where +/- reads as an account.
- **Don't** put cargo orange on a secondary action, a status, or a decoration. If two things are orange, neither is primary.
- **Don't** set small text in `text-primary` on a light surface — it measures 3.3:1 and fails AA. See the Orange-Is-Not-Ink Rule. Known offenders outside this rule's reach today: the inventory filter chips (`inventory/index.tsx:145`), the bulk-POD quick ranges (`bulk-pod-downloads.tsx:116`), and shadcn's `Button variant="link"`.
- **Don't** add a drop shadow, a glass blur, or a backdrop-filter. This is a tool; tools are flat.
- **Don't** use a coloured `border-left` as an accent stripe on cards, rows, or callouts. Use a full border, a tint, or a stamp.
- **Don't** nest a card inside a card.
- **Don't** communicate state with a bare coloured dot.
- **Don't** build hierarchy from size alone.
- **Don't** use a pill radius on a status — the stamp is rectangular, and that is the point.
- **Don't** let a workflow push someone back to a spreadsheet, a phone call, or paper. That is a design failure, not a user habit.
