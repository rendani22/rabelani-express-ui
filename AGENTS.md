# AGENTS.md - AI Coding Agent Guidelines

## Project Overview

**Rabelani Express UI** ("Dispatch") — a **React 19 + Vite 8** delivery/package-management dashboard with a Supabase backend. Features package tracking, driver management, inventory, proof-of-delivery (POD), purchase orders, QR label printing, and user/customer/staff management.

> This app was rewritten from Angular to React. The pre-rewrite Angular source is preserved only at the git tag **`angular-archive`**; it is no longer in the tree. Where code comments say "ported from the Angular …", they refer to that lineage.

## Architecture

### Directory Structure

```
src/
├── main.tsx              # Entry: providers (theme, error boundary, query client, tooltip, auth, router)
├── App.tsx               # All routes (react-router-dom v7), no lazy loading
├── index.css             # Tailwind v4 + design tokens (the whole "Dispatch" theme)
├── components/
│   ├── ui/               # shadcn/ui primitives (button, dialog, table, select, …)
│   ├── dispatch/         # domain UI primitives (status-stamp, tracking-number, route-timeline,
│   │                     #   signature-pad, metric-stat, receiver-avatar, section-label) — barrel: index.ts
│   ├── layout/           # app-layout, app-header, sidebar, page-header, command-palette, nav-items
│   ├── dashboard/        # dashboard-card, charts
│   ├── drivers/          # driver-map (react-leaflet)
│   ├── brand/            # logo
│   ├── protected-route.tsx, error-boundary.tsx, mode-toggle.tsx
├── pages/                # Route screens, grouped by feature (see routes below)
├── hooks/                # TanStack Query hooks (use-orders, use-drivers, use-inventory, use-dashboard)
└── lib/
    ├── api/              # Framework-agnostic data-access modules (Supabase). NO React here.
    ├── models/           # Domain types (package.ts: types, EDGE_FUNCTIONS, guards, status flow)
    ├── supabase.ts       # Shared Supabase client
    ├── config.ts         # Runtime config (Supabase URL/keys), VITE_* overridable
    ├── auth.tsx          # AuthProvider / useAuth (React Context over Supabase auth)
    ├── logger.ts         # livecode-OPS logger wrapper + reportError/toUserMessage helpers
    ├── ui-store.ts       # Zustand: UI-only state (mobile nav, command palette)
    ├── settings-store.ts # Zustand + persist: user preferences (localStorage)
    └── status.ts, driver-status.ts, format.ts, csv.ts, utils.ts, …  # pure helpers
```

### Key Patterns

**Path alias**: `@/*` → `src/*`, configured in `vite.config.ts` and the tsconfigs. Always import via `@/…`, e.g. `import { supabase } from '@/lib/supabase'`.

**Server state = TanStack Query.** Every server read/write goes through `useQuery`/`useMutation`. Query hooks live in `src/hooks/`; the `QueryClient` (in `main.tsx`) sets `staleTime: 30s`, `refetchOnWindowFocus: false`, `retry: 1`, and centrally logs every failed query/mutation via `QueryCache`/`MutationCache` `onError`. Query keys are arrays, e.g. `['orders', query]`, `['dashboard', 'operations']`.

```ts
export function useOrders(query: OrdersQuery) {
  return useQuery({
    queryKey: ['orders', query],
    queryFn: () => fetchOrders(query),
    placeholderData: keepPreviousData,
  })
}
```

**UI-only state = Zustand.** No server data in Zustand. `ui-store.ts` holds transient UI flags (mobile nav open, command-palette open); `settings-store.ts` uses the `persist` middleware to keep preferences in localStorage.

**Auth = React Context.** `AuthProvider` in `lib/auth.tsx` subscribes to `supabase.auth.onAuthStateChange` and exposes `{ user, session, initializing, signIn, signOut, resetPassword }` via `useAuth()`. `<ProtectedRoute>` redirects to `/login` when there is no session.

**Data-access modules are framework-agnostic.** `lib/api/*.ts` are plain async functions over the Supabase client — no React imports. They either return typed result shapes (`{ success: true, data }` / `{ success: false, error }`) or throw for TanStack Query to catch. Keep React out of `lib/api/`.

### Routing (all in `src/App.tsx`)

| Path | Page |
|------|------|
| `/login` | `pages/login.tsx` (public) |
| `/style-guide` | `pages/style-guide.tsx` (public) |
| `/dashboard` | `pages/dashboard/` (operations + executive tabs) |
| `/orders`, `/orders/completed`, `/orders/deleted` | `pages/orders/` |
| `/pods/bulk-downloads` | `pages/pods/bulk-pod-downloads.tsx` |
| `/inventory`, `/inventory/movements` | `pages/inventory/` |
| `/purchase-orders` | `pages/purchase-orders/` |
| `/drivers` | `pages/drivers/` |
| `/customers`, `/user-management`, `/delivery-locations`, `/email-templates` | `pages/directory/` |
| `/settings` | `pages/settings.tsx` |

All authenticated routes render inside `<ProtectedRoute>` → `<AppLayout>`. `/` and unknown paths redirect to `/dashboard`.

## Backend Integration

- **Supabase** for auth and database. Client: `src/lib/supabase.ts`; config in `src/lib/config.ts` (overridable via `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_SUPABASE_FUNCTIONS_URL`). The anon key is a **public** client key — intentionally committed.
- **Package mutations use Supabase Edge Functions**: `create-package`, `update-package`, `driver-pickup`, `receive-at-collection` — called via the private `callEdgeFunction` helper in `lib/api/packages.ts`, with typed responses and type guards.
- **Reads and most other entities use direct Supabase queries** (`supabase.from(...)`): package reads, and the `drivers`, `inventory`, `delivery-locations`, `receivers`, `staff`, `purchase-orders`, `email-templates` modules.
- **RPCs**: lock status (`is_pod_locked`, `get_pod_lock_status`) and soft-delete/restore (`soft_delete_package`, `restore_package`).
- Edge-function **source** lives under `supabase/functions/` (`create-package`, `update-package`, `_shared`); `driver-pickup` & `receive-at-collection` are deployed but not vendored here. Migrations under `supabase/migrations/`.

### Edge function call pattern (`lib/api/packages.ts`)

```ts
// EDGE_FUNCTIONS map lives in src/lib/models/package.ts
const response = await callEdgeFunction<CreatePackageApiResponse>(
  EDGE_FUNCTIONS.CREATE_PACKAGE, accessToken, request,
)
if (isCreatePackageSuccess(response)) { /* … */ }
if (isApiError(response)) { /* … */ }
```

### Supabase result typing note

`.maybeSingle()`/`.single()` with a string `.select()` can infer a `GenericStringError` union, so a direct `data as SomeType` cast fails under TS 6. After null-checking, cast through `unknown`: `return data as unknown as PodRecord` (see the existing pattern in `lib/api/packages.ts`).

## Errors & Logging

All error reporting funnels through `src/lib/logger.ts`, a wrapper over `@rendani22/logger` (the shared **livecode-OPS** client — installed from GitHub Packages; see the registry config in `.npmrc`). It buffers events and flushes in batches / on page-hide, adds auto-context (URL + user-agent), and de-dupes by error-object identity.

- `logger.error/warn/info/debug(payload, ctx)` — ship an event.
- `reportError(err, fallback, ctx)` — log the real error **and** return a user-facing string. Use in catch blocks and mutation `onError`:
  ```ts
  onError: (e) => toast.error(reportError(e, 'Could not save the item.', { op: 'inventory.update' }))
  ```
- `installGlobalErrorHandlers()` + `startUptimeReporting()` run once in `main.tsx`. Query/mutation failures are logged centrally by the `QueryClient` caches.

Config via `VITE_OPS_INGEST_URL`, `VITE_OPS_INGEST_KEY`, `VITE_APP_VERSION` (defaults target the OPS `int` ingest).

## Styling

- **Tailwind CSS v4** via `@tailwindcss/vite` — **no `tailwind.config.js`**. Everything is in `src/index.css`: `@import 'tailwindcss'`, the token definitions, `.dark` overrides, and an `@theme inline` block mapping tokens to Tailwind color utilities.
- **Design tokens** are CSS custom properties in **oklch**. The "Dispatch" system is deliberate:
  - Light = warm "label-stock" paper; dark = cool graphite depot-at-night.
  - One accent: **cargo orange** (`--primary`) — primary actions & brand only.
  - **Green is semantic**: reserved for "delivered"/"collected" status, not decoration.
  - Route-blue for maps/charts; amber-yellow for caution/waiting.
  - Depth = borders + surface-tint shifts, not heavy shadows (this is a tool, not a marketing page).
- **Dark mode** is class-based, driven by `next-themes` (`ThemeProvider attribute="class" defaultTheme="dark"`); `mode-toggle.tsx` flips it.
- Status → tone/label mapping lives in `lib/status.ts` (`PACKAGE_STATUS`, `StatusTone`); render with the `status-stamp` primitive.

## Component Conventions

- **File naming**: kebab-case `.tsx` / `.ts` (e.g. `create-package-dialog.tsx`, `po-line-editor.tsx`). No `.component` suffix. One concern per file; dialogs/panels live beside their feature page.
- **shadcn/ui** primitives in `src/components/ui/` (new-york style, `radix-ui` + `cva`). Add new ones with the shadcn CLI — config in `components.json` (aliases: `@/components`, `@/components/ui`, `@/lib`, `@/lib/utils`, `@/hooks`). Merge classes with `cn()` from `@/lib/utils`.
- **Domain primitives** in `src/components/dispatch/` (barrel `index.ts`): `StatusStamp`, `TrackingNumber`, `RouteTimeline`, `SignaturePad`, `MetricStat`, `ReceiverAvatar`, `SectionLabel`. Prefer these for delivery-domain UI.
- **Layout**: `AppLayout` (shell) composes `Sidebar` + `AppHeader` + `<Outlet/>`; `CommandPalette` (cmdk) is global; `nav-items.ts` is the single nav source.
- **Toasts**: sonner — `import { toast } from 'sonner'`; `<Toaster/>` is mounted in `main.tsx`. **Icons**: `lucide-react`.
- **Forms**: controlled React state / component-local; validate before calling the `lib/api` function or mutation. (No Angular reactive-forms equivalent.)

## Key Dependencies

| Package | Purpose |
|---------|---------|
| `react` 19 / `react-dom` | UI runtime |
| `vite` 8 + `@vitejs/plugin-react` | Build/dev |
| `@tailwindcss/vite` + `tailwindcss` v4 + `tw-animate-css` | Styling |
| `radix-ui` + `class-variance-authority` + `tailwind-merge` + `clsx` | shadcn/ui primitives |
| `react-router-dom` v7 | Routing |
| `@tanstack/react-query` v5 | Server state |
| `zustand` | UI/preferences state |
| `@supabase/supabase-js` v2 | Auth + database + edge functions |
| `@rendani22/logger` | livecode-OPS logging client |
| `recharts` | Dashboard charts |
| `leaflet` + `react-leaflet` | Driver map |
| `qrcode.react` | QR label generation |
| `jspdf` + `html2canvas-pro` | POD PDF rendering (`lib/pod-pdf.tsx`) |
| `jszip` | Bulk POD downloads |
| `cmdk` | Command palette |
| `next-themes` | Dark-mode class toggling |
| `sonner` | Toast notifications |
| `lucide-react` | Icons |
| `@fontsource-variable/archivo` + `.../jetbrains-mono` | Typefaces (Archivo signage grotesque + JetBrains Mono for codes/IDs) |

## Commands

```bash
npm run dev       # Vite dev server at localhost:5173 (host + *.trycloudflare.com allowed for remote review)
npm run build     # tsc -b (typecheck) then vite build → dist/
npm run preview   # Serve the production build
npm run lint      # oxlint

npm test               # Vitest, single run
npm run test:watch     # Vitest, watch mode
npm run test:coverage  # Coverage — 100% thresholds on a scoped logic layer

npx vitest run src/lib/format.test.ts   # a single file
npx vitest run -t 'formats date and time'  # a single test by name
```

Vitest + jsdom + Testing Library; setup in `src/test/setup.ts`. Coverage is deliberately scoped via `coverage.include` in `vitest.config.ts` to the framework-agnostic logic layer, at 100% thresholds — see the **Testing** section of `CLAUDE.md` for what's in scope and why pages/`lib/api` are not.

No Storybook in the React app. No `:int` build variant — environments differ only by `VITE_*` env vars, not build configurations.

## Important Files

| File | Purpose |
|------|---------|
| `src/main.tsx` | Provider tree, QueryClient config, global error/uptime install |
| `src/App.tsx` | All route declarations |
| `src/index.css` | Tailwind v4 + full "Dispatch" token system |
| `src/lib/supabase.ts` / `src/lib/config.ts` | Supabase client + runtime config |
| `src/lib/auth.tsx` | Auth context (`AuthProvider`, `useAuth`) |
| `src/lib/logger.ts` | livecode-OPS logger + `reportError`/`toUserMessage` |
| `src/lib/models/package.ts` | Package types, `EDGE_FUNCTIONS`, type guards, status flow |
| `src/lib/status.ts` / `src/lib/driver-status.ts` | Status constants + tone/label mapping |
| `src/lib/api/packages.ts` | Package mutations (edge fns) + reads + `callEdgeFunction` |
| `src/lib/api/*.ts` | drivers, inventory, delivery-locations, receivers, staff, purchase-orders, email-templates, operations/executive dashboards, pod-export |
| `src/lib/ui-store.ts` / `src/lib/settings-store.ts` | Zustand stores |
| `src/lib/pod-pdf.tsx` | POD PDF generation (jspdf + html2canvas-pro) |
| `src/hooks/*.ts` | TanStack Query hooks per feature |
| `src/components/ui/` | shadcn/ui primitives |
| `src/components/dispatch/` | Domain UI primitives (barrel `index.ts`) |
| `src/components/layout/app-layout.tsx` | App shell |
| `components.json` | shadcn/ui config |
| `vite.config.ts` | Vite + React + Tailwind plugins, `@` alias, dev server |
| `supabase/functions/` | Edge function sources (`create-package`, `update-package`, `_shared`) |
| `supabase/migrations/` | Database migrations |
