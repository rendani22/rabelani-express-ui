# Dispatch — Rabelani Express design system

**Direction:** an operational control surface for a courier depot. Dense but breathable,
dark-capable, competent. Not a generic SaaS dashboard.

**Human / task / feel:** depot dispatchers & admins tracking parcels, dispatching drivers,
managing inventory/customers — at a desk or on a phone in the depot. Feel: calm, industrial,
in control.

## Foundations
- **Type:** Archivo Variable (UI + display; industrial signage grotesque) · JetBrains Mono
  Variable (`.mono` — all tracking numbers, codes, timestamps, weights). Hierarchy from
  size **+ weight + color**, not size alone.
- **Type scale (~1.25):** caption 11 · body 14 · h3 18 · h2 22 · h1 28 · display 44+. Negative
  tracking on large sizes (`tracking-tight`). Section labels: 11px, 600, uppercase, `0.14em`.
- **Accent:** cargo orange = `--primary` (oklch(0.665 0.185 47) light / 0.70 dark). Black-on-orange
  like hi-vis signage (`--primary-foreground` is dark in both modes). ONE accent, action/brand only.
- **Semantic (reserved):** green = delivered/collected ONLY. amber-yellow = caution/waiting.
  red = returned/destructive. route-blue (`--chart-2`) = maps/charts/notified only.
- **Depth:** borders + surface-tint shifts. NO heavy shadows (it's a tool). Dark leans on
  low-opacity white borders (`oklch(1 0 0 / 9%)`).
- **Surfaces:** light = warm paper (bg 0.986, card 0.997) + border. Dark = cool depot-night
  graphite (bg 0.165, card 0.196), step lightness ~+3% per elevation.
- **Radius:** `--radius: 0.4rem`. Spacing: 8px grid. Depth = borders, not shadow.
- Tailwind v4 (`@theme inline` in `src/index.css`), shadcn new-york, `radius-ui` primitives,
  `next-themes` (class strategy), lucide icons.

## Signature components (`src/components/dispatch/`)
1. **StatusStamp** — package status as a rubber ink-stamp: rectangular, uppercase, tracked,
   bordered + tinted, leading tick dot. Tones map in `src/lib/status.ts` (`STATUS_META`).
2. **TrackingNumber** — waybill ID as first-class mono token; `copyable` variant.
3. **RouteTimeline** — chain-of-custody as a vertical route line with node stops
   (done = filled orange, current = ping ring, upcoming = hollow).
4. **MetricStat** — dispatch-strip metric: 2rem tabular hero number + tracked SectionLabel +
   signed delta (green up / red down).
5. **SectionLabel** — stencil-on-a-crate label (11px uppercase tracked muted).
6. **`.tear-line`** util — ticked shipping-label edge as a section divider.
7. **POD docket** (`DownloadPodButton` in `pages/my-packages.tsx`) — proof-of-delivery download
   styled as a tear-off docket, NOT a generic button. Plain `<button>` (self-end, floats right), `rounded-md`
   `border-border bg-muted/40` → `hover:bg-muted/70`, `active:scale-[0.98]`, `py-1.5 pl-1.5 pr-3.5`,
   ~40px tall. Left: a 28px (`size-7`) `rounded-[4px]` "verified" stamp glyph — `FileCheck2` in the
   reserved **delivered-green** (`border-success/40 bg-success/12 text-success`), the one place green
   is earned (it marks the completed delivery, echoing StatusStamp's tick). Middle: stencil title
   (11px/600/upper/`0.12em`/`text-foreground/80`) over a `.mono` 11px muted line
   ("Download PDF" / "Preparing PDF…"). Right: `Download` icon muted→foreground on group-hover.
   Secondary action → neutral surface, no orange; green stays semantic. States: hover/active/
   disabled/focus-ring/loading(spinner in stamp). Pattern for "retrieve a signed artifact".

## Conventions
- Vite + React Router + TanStack Query (server state) + Zustand (UI state). Supabase client in
  `src/lib/supabase.ts`; config in `src/lib/config.ts` (anon key is public).
- Use shadcn primitives + dispatch signatures; bind to semantic tokens, never raw hex/gray.
- Button has `active:scale-[0.97]` press feedback. Tabular-nums on all dynamic numbers.
- Legacy Angular app archived in `/legacy-angular` for reference during the port.

## Status
Done: scaffold + design system + `/style-guide` (M1) · Login (M2) · app shell — sidebar (grouped
nav, orange active bar), header (⌘K command palette, notifications/help/user menus, INT badge,
theme toggle), mobile Sheet nav, `ProtectedRoute` + `AppLayout`, `PageHeader`/`PageBody` helpers,
navigable `PlaceholderPage` for un-ported routes (M3).
Done: Dashboard — Operations + Executive tabs (M4). Data services ported to `src/lib/api/
operations-dashboard.ts` (`get_dashboard_metrics` RPC) and `executive-dashboard.ts`
(`get_executive_metrics` + `get_dashboard_metrics` + `purchase_orders`). TanStack Query hooks in
`src/hooks/use-dashboard.ts`. Recharts wrappers in `src/components/dashboard/charts.tsx`
(TrendAreaChart/VolumeBarChart/DonutChart/HorizontalBars), `DashboardCard` wrapper, `src/lib/chart.ts`
(status→token colors, formatZAR/formatCompact). Executive auto-briefing + KPIs + scorecard + funnel
all ported faithfully. Deferred: admin-gating the Executive tab (isAdmin = staff_profiles.role==='admin'),
the hourly heatmap card, and the dashboard date-range filter + create-package action.
Orders (in chunks): CHUNK 1 done — list (server-paginated table: mono tracking, receiver avatars,
status stamps, PO, items, created/updated), search + status filter, pagination; details panel (Sheet)
with info/notes/items, chain-of-custody route-line, context-aware primary status action (draft→notified,
in_transit→ready via edge fns), QR label dialog (qrcode.react), copy-ref, gated delete. Package service
+ models ported to `src/lib/api/packages.ts` + `src/lib/models/package.ts`; `src/lib/api/orders.ts`
(fetchOrders w/ receiver-name resolve + count), `src/hooks/use-orders.ts`, `src/lib/package-timeline.ts`,
`src/lib/format.ts`, `ReceiverAvatar`.
Orders CHUNK 2 done — create-package dialog (receiver/location/PO-lookup+dup-check/notes/items via
inventory-select or PO-line allocation/draft toggle → createPackage), assign-driver dialog
(updatePackage in_transit + driver_user_id), mark-collected POD dialog with dual signature capture
(`SignaturePad` canvas → updatePackage collected + pod payload; PDF attachment deferred to server).
Delete now admin-gated via `src/lib/api/staff.ts` (isCurrentUserAdmin, role==='admin'). Supporting
services ported: `src/lib/api/{receivers,delivery-locations,inventory,drivers}.ts`.
Orders CHUNK 3 done — completed-orders (`/orders/completed`: collected+delivered, date range, select +
bulk POD download), deleted-orders (`/orders/deleted`: admin-gated recycle bin + restore), bulk POD
downloads (`/pods/bulk-downloads`: quick ranges + select + zip). `src/lib/api/pod-export.ts`
(downloadPodsZip via jszip, fetches stored pdf_urls, reports skipped). Orders header has a "More" menu
linking the three. Orders feature COMPLETE for primary flows.
Orders details panel now supports: manual status change (Combobox → any status incl. back to
draft/notified; in_transit→driver modal, collected→POD modal; hidden once POD locked), editable
notes (updatePackage), delivery-photo display (parseNotes in format.ts extracts photo URLs from
notes + strips them from text), and full POD record (getPodForPackage → receiver/witness signatures +
completion_status + reference). fetchCompletedOrders orders/filters by created_at (updated_at ordering
was returning empty). Completed/deleted/bulk pages now surface query errors instead of a blank table.
POD document: full printable proof-of-delivery in `src/pages/orders/pod-document.tsx` (`PodDocument`
matches the old downloadable POD exactly — header w/ PO·ref + Locked, order details w/ delivery-photo→
"Delivered" rule + staff "Delivered/Assisted By", items table + total, receiver/witness blocks w/
employee#/phone/signature, footer legal text). `PodDocumentDialog` renders it + a **Download PDF** button that generates a real PDF via
**html2canvas-pro** (NOT html2canvas/html2pdf.js — those throw on Tailwind v4's `oklch()` colors) +
jsPDF (multi-page), downloaded through an explicit blob `<a download>`. Wired from the details-panel
POD card. GOTCHA: after adding/removing a dep that's dynamically imported, clear `node_modules/.vite`
and restart dev — a stale optimizer ref (e.g. removed html2pdf.js) crashes the whole optimize run →
504 on the new dep's module → "Failed to fetch dynamically imported module". Status change constrained: only Draft/Notified (+ In Transit from
Notified); terminal states (collected/delivered/returned) show no status change.
Item editing DONE — `src/pages/orders/package-items-editor.tsx` (in the details panel, gated to
`isPackageEditable` = draft/pending/notified). Existing rows: edit qty or delete/restore. New rows:
inventory-linked only (Combobox), PO-restricted when the order was created from a PO (via
`getPoRestrictedInventoryIds` → checks `purchase_order_item_allocations`, else unrestricted). Saves
`updatePackage(id,{items:{updates,deletes,creates}})`; server reconciles stock, empties → Returned.
Notes editing now also gated to `isPackageEditable` (was any-status before).
Orders deferred refinements: bulk POD download still bundles STORED pdf_urls only (no client-gen POD PDF).

Drivers page DONE (`src/pages/drivers/`): stats (total/available/on-delivery/offline via getDriverStatus),
search, Map/List toggle, **Leaflet map** (`src/components/drivers/driver-map.tsx` — react-leaflet 5 +
leaflet; theme-aware CARTO tiles light/dark; CircleMarkers colored by status via `src/lib/driver-status.ts`;
fly-to on select), driver cards, and a details panel (contact, live location + speed, active in-transit
deliveries via `listDriverActivePackages`). Add/edit-driver modals (admin) deferred. `use-drivers.ts`
polls every 30s. NOTE ported quirk: getDriverStatus makes 'on_delivery' depend on is_available=false, but
calculateAvailability sets is_available=true for any recent location — faithful to legacy; is_available may
need a real source. Leaflet CSS imported inside driver-map.tsx.

Directory pages DONE (`src/pages/directory/`): Customers (receiver cards + package-history Sheet via
`fetchPackagesByReceiver` + add/edit dialog + manage-contacts dialog), Users (staff cards + role badges +
admin-gated add/edit `UserDialog` → createStaff via `create-staff` edge fn / updateStaff), Locations
(cards + `LocationDialog` create/edit + deactivate/delete), Email Templates (master-detail preview/edit,
`{{var}}` interpolation w/ SAMPLE data + dangerouslySetInnerHTML preview; edit gated to admin — the old
`canEdit` was a no-op bug, replaced with isCurrentUserAdmin). CRUD ported into existing `receivers.ts`
(createReceiver/updateReceiver/de-reactivate + contact CRUD), `staff.ts` (createStaff/updateStaff/
de-reactivate + DTOs), new `email-templates.ts`. Remaining pages: Inventory(+movements), Global PO
(purchase-orders), Settings.
NOTE: `packages` table is RLS-gated — direct reads need an authed session (dashboards used a
SECURITY-DEFINER RPC so they showed data even unauthenticated during dev checks).
Next: finish Orders chunks 2–3, or Drivers, per user direction.

STANDARD: all data-backed dropdowns use the searchable `Combobox` (`src/components/ui/combobox.tsx`,
Popover + cmdk, type-to-filter) — NOT plain `Select`. Use it everywhere a list can be large
(receivers, inventory, drivers, locations, customers, statuses…). Plain `Select` only for tiny fixed
sets like page-size.

Gotcha: with `verbatimModuleSyntax`, split type-only imports into `import type {…}` — Vite/esbuild
erases `export type` at runtime, so mixing them in a value import throws at load (white screen).

Backend gotcha: on the `int` Supabase project the `receive-at-collection` edge function is NOT
deployed (OPTIONS preflight 404s → browser "Failed to fetch"), while create-package / update-package /
driver-pickup ARE (204). `receiveAtCollection()` now catches the network error and falls back to
`updatePackage(status: ready_for_collection)` (deployed); the fallback auto-disables once the dedicated
function is deployed. If a status transition throws "Failed to fetch", suspect an undeployed function —
check the OPTIONS preflight.

Gotcha: `createPackage()` (and the other package mutations) return the `PackageServiceResult` WRAPPER
(`{success, data} | {success, error}`) — check `res.success`. Do NOT call `isCreatePackageSuccess(res)`
on the wrapper (that guard is for the raw edge-function response); it reads false on a real success and
fires a false "failed" toast even though the row was created.

Layout conventions: pages render `<PageBody><PageHeader eyebrow title .../> …</PageBody>`.
Nav config in `src/components/layout/nav-items.ts`. UI state (mobile nav, ⌘K) in
`src/lib/ui-store.ts` (zustand).

Settings page DONE (`src/pages/settings.tsx`, route wired in `App.tsx`). Preferences live in
`src/lib/settings-store.ts` (zustand `persist`, localStorage key `app-settings`): autoRefreshEnabled,
autoRefreshInterval, defaultOrdersFilter, defaultDriversView, compactMode. Sections: Appearance (theme
via next-themes Segmented), Data&refresh (Switch + interval Select), Orders default filter, Drivers
default view, Display/compact, Reset-to-defaults, Account/sign-out. Preferences are actually wired into
consumers, not just stored: `use-drivers.ts` reads refetchInterval from settings; `orders/index.tsx` and
`drivers/index.tsx` seed initial filter/view from `useSettings.getState()` (read once at mount so the
user can still change it in-session); `page-header.tsx` `PageBody` tightens padding when compactMode is
on. New shadcn primitive: `src/components/ui/switch.tsx`.

Inventory DONE (`src/pages/inventory/`): `index.tsx` (main table), `item-dialog.tsx` (create/edit),
`restock-dialog.tsx` (add-stock w/ live before→after preview), `movement-history-panel.tsx` (Sheet
timeline + CSV), `recent-movements.tsx` (route `/inventory/movements`, all-item ledger + CSV). Data in
ported `src/lib/api/inventory.ts` (added `bulkSetInventoryActive`/`bulkDeleteInventoryItems`); hook
`src/hooks/use-inventory.ts` (`useInventory` = items+`computeInventoryStats`; `useItemMovements`).
Shared helpers: `src/lib/csv.ts` (toCsv/downloadCsv/yyyymmdd/slugify) and
`src/lib/inventory-movements.ts` (source label/tone/dot, delta tone/icon, stock-state predicates,
`formatZar`). Movement ledger uses success/destructive for +/- deltas — the "green = delivered only"
rule is a package-status rule; a stock ledger reads like an account so +/- green/red earns its meaning.
Filters: search + category Combobox + mutually-exclusive stock-state chips (low/out/backordered/stale,
modelled as one `stockFilter` union, not 4 booleans) + independent "show inactive". Client-side paginate
+ bulk select (activate/deactivate/delete via `confirm()`). `getStaffNamesByIds` added to `api/staff.ts`
for movement authorship (best-effort; RLS may block → placeholder). No admin gate on inventory CRUD
(matches legacy). `inventory_items`/`inventory_movements` are RLS-gated → verified via TEMP-MOCK.

Global PO DONE (`src/pages/purchase-orders/`): `index.tsx` (stats + search + status tabs + expandable
PO cards), `po-card.tsx` (header row + expanded detail: customer/value/date tiles, delivered-value bar,
linked orders w/ StatusStamp+TrackingNumber, linked inventory ordered/allocated/remaining, footer
actions — Document / PODs zip / Edit / Open in Orders), `create-po-dialog.tsx`, `edit-po-dialog.tsx`
(fetches its edit payload by po-number internally), `po-line-editor.tsx` (shared inventory-line editor
w/ per-line min-quantity), `po-display.ts` (status meta, delivered-value calc, formatPoDate).
Data layer `src/lib/api/purchase-orders.ts` was ported 1:1 by a background subagent (full aggregation:
first-class `purchase_order` POs + synthetic `order`-sourced POs from packages' po_number; create/update
via `create_purchase_order_with_items`/`update_purchase_order_with_items` RPCs; `uploadPODocument` to the
`po-documents` storage bucket; `getPurchaseOrderForEdit` with min-allowed quantities). Reads throw (react
-query); CRUD keeps `{success,error}`. POs are NOT deletable (matches legacy). Two sources: only
`purchase_order` is editable; `order`-sourced are read-only. Per-PO POD zip reuses `downloadPodsZip`.
Delivered-value uses success/warning tones (full/partial) — a value ledger, distinct from package status.
POs/receivers/inventory are RLS-gated → verified via TEMP-MOCK.

POD zip gotcha (fixed): PODs are NOT stored server-side in this app — they're generated client-side from
the `pods` record via `<PodDocument>` → html2canvas-pro → jsPDF. The old `downloadPodsZip` only bundled a
stored `pdfUrl` (always empty) → "no PODs" error on every bulk/PO download. Now `downloadPodsZip`
(`src/lib/api/pod-export.ts`) tries the stored `pdfUrl` first, then falls back to generating each POD via
`generatePodPdfBlob` in `src/lib/pod-pdf.tsx` (renders `<PodDocument>` off-screen with a detached
`createRoot`, captures, unmounts). `nodeToPdfBlob` there is the shared node→PDF helper the single-download
dialog (`pod-document.tsx`) now also uses, so single + bulk output are identical. Skips only orders with no
`pods` row. Static import graph is one-way (pod-export → pod-pdf → pod-document); pod-document imports
pod-pdf dynamically to avoid a cycle.

Order audit view (added): the package details panel (`src/pages/orders/package-details-panel.tsx`) has an
admin-only, collapsible **Audit log** section below Chain of custody — lazily loaded on expand. Reads
`audit_logs` (entity_type='package') via `getPackageAuditLog` in `api/packages.ts`; gated by
`isCurrentUserAdmin`; actor names via `getStaffNamesByIds` (best-effort, shows "System" when no performer).
Display helpers in `src/lib/audit-log.ts` (`formatAuditAction` label map + `auditStatusChange` prev→new
from `metadata.previous_status/new_status`). Matches the legacy admin audit-log 1:1.

Port-parity fixes (old-vs-new audit): (1) **create-package now deducts inventory** — `create-package-dialog`
calls `deductStock` after a successful create for items with `inventory_item_id` + logs `package_deduct`
(the edge fn stores the id but doesn't decrement; delete→returnStock / restore→deductStock were already
wired). (2) `getStaffNamesByIds` queried non-existent `name,surname` cols → fixed to `full_name` (actor
names now resolve in Audit log + Recent movements). (3) Edit-PO can no longer remove persisted lines — the
shared `po-line-editor` shows a Lock (not a trash) when `purchaseOrderItemId !== ''` (protects allocated
qty). (4) Global PO expanded footer restored: PO number/created, allocated+remaining badges (purchase_order)
or completed/active/draft breakdown (order source), + completion progress bar. (5) Inventory `?id=` deep-link
now reveals + name-searches + ring-highlights the row (PO item links use `?id=`); `?search=` still works.
(6) Inventory alert banners regained the "View" jump-to-filter action. (7) Inventory pagination regained
numbered windowed page buttons + the "5 / page" option. (8) Inventory mutation toasts surface the server
error. Also: PO header status badges show a "+N" overflow chip; create/edit PO dialogs can't be closed
mid-submit. NOTE deliberate deviation kept: inventory default page size is 25 (old was 5).

Error handling / logging (livecode-OPS): `src/lib/logger.ts` wraps the real `@rendani22/logger` client
(private GitHub Packages pkg — worktree `.npmrc` maps the `@rendani22` scope, token comes from global
`~/.npmrc`). Config from `import.meta.env.VITE_OPS_INGEST_URL/KEY` with the int ingest as default (same
inline-default convention as the Supabase keys in `config.ts`). NO console mirror — the client buffers +
batch-ships; only a delivery-failure `console.warn` remains. Public API: `logger.error/warn/info/
captureException`, `toUserMessage(err, fallback)`, `reportError(err, fallback, {op})` (logs the real error,
deduped by object identity, + returns a user message). Capture wiring in `main.tsx`: React Query
`QueryCache`/`MutationCache` `onError` log every query/mutation error automatically, `installGlobalError
Handlers()` for window error/unhandledrejection, and `<ErrorBoundary>` (`src/components/error-boundary.tsx`)
for render crashes. All API `console.*` route through `logger`; all UI `toast.error/warning` that carry an
error go through `reportError` (pure client-side validation toasts left as-is). `.env.example` documents
overrides; `.env.local` gitignored. GOTCHA (fixed): the client stores the `fetch` reference and calls it
as a method → `TypeError: Illegal invocation` (detached `this`), which silently dropped EVERY event; pass
`fetchImpl: (...a) => fetch(...a)` in `createLogger` to bind it. Verified `POST /api/logs/ingest → 200`.

Uptime logging: `src/lib/uptime.ts` `startUptimeReporting()` (called from `main.tsx`) emits `info`
`session_start` on boot, a recurring `heartbeat` while the tab is visible (paused when hidden), and
`session_end` on pagehide — each with `sessionId`, `uptimeMs`, `path`, `visibility`. Each ping flushes
immediately (near-real-time liveness, not the 5-min batch). Cadence via `VITE_OPS_HEARTBEAT_MS` (default
300000 = 5min; 0 disables).

ALL rewrite pages now DONE. Every route in `App.tsx` points to a real page (no PlaceholderPage left
except any intentional stubs). Feature set complete: Login, Dashboard (ops+exec), Orders (+completed/
deleted/POD), Drivers, Directory (customers/users/locations/templates), Inventory (+movements), Settings,
Global PO, POD bulk downloads.
