# AGENTS.md - AI Coding Agent Guidelines

## Project Overview

**Rabelani Express UI** – Angular 21+ delivery/package management dashboard with Supabase backend. Features package tracking, driver management, user authentication, and QR code label printing.

## Architecture

### Directory Structure
```
src/app/
├── core/           # Shared models, services, guards, utils (barrel exported via index.ts)
├── features/       # Feature modules: dashboard, orders, drivers, login, user-management,
│                   #   customer-management, delivery-locations, email-templates, inventory,
│                   #   inventory/recent-movements, settings
└── shared/         # Reusable UI components, directives, services (Supabase client)
```

### Key Patterns

**Barrel Exports**: Core module exports everything via `src/app/core/index.ts`. Import from `'../../core'` not individual files:
```typescript
import { AuthService, Package, PackageService, authGuard } from '../../core';
```

**State Management**: Uses Angular signals (not NgRx). Services expose readonly signals for state:
```typescript
private readonly _packages = signal<Package[]>([]);
readonly packages = this._packages.asReadonly();
readonly isLoading = signal(false);
```

**Standalone Components**: All components are standalone with explicit imports array. No NgModules.

**Lazy Loading**: Routes use `loadComponent` pattern in `app.routes.ts`.

**Feature-level services**: Complex features own their own service under `features/<name>/services/`. Example: `features/dashboard/services/dashboard.service.ts` exposes typed stats interfaces (`PackageStats`, `DriverStats`, `StatusDistribution`) and is not re-exported from core.

## Backend Integration

- **Supabase** for auth and database (configured in `src/environments/environment.ts`)
- `SupabaseService` (`shared/services/supabase.service.ts`) wraps Supabase client
- `AuthService` is a facade over `SupabaseService` for auth operations
- Package **mutations** use **Supabase Edge Functions**: `create-package`, `update-package`, `driver-pickup`, `receive-at-collection`
- Package **reads** (`loadPackages`, `getPackage`) query Supabase directly via `supabaseService.client.from('packages')`
- `DeliveryLocationService` uses direct Supabase CRUD (no Edge Functions) against `delivery_locations` table
- `DriverService` uses direct Supabase queries for driver profiles and locations
- `InventoryService` uses direct Supabase CRUD against `inventory_items` / `inventory_movements`; package items may reference `inventory_item_id` so the `create-package` edge function records the link for later stock reconciliation
- `ReceiverService` / `StaffService` use direct Supabase queries against `receiver_profiles`+`receiver_contacts` and `staff_profiles` respectively
- `SettingsService` persists preferences to `localStorage` only — no Supabase calls
- `ThemeService` toggles dark mode and persists the choice (no Supabase)
- `OnboardingTourService` drives `OnboardingTourComponent` via a `TOUR_REGISTRY` keyed by `TourId` (`'dashboard' | 'orders'`); steps target CSS selectors and auto-skip if missing
- Lock-status checks call Supabase RPC functions: `is_pod_locked`, `get_pod_lock_status`

### API Pattern (PackageService example)
```typescript
// Edge function calls use callEdgeFunction with typed responses
const response = await this.callEdgeFunction<CreatePackageApiResponse>(
  EDGE_FUNCTIONS.CREATE_PACKAGE,
  accessToken,
  request
);
// Use type guards: isCreatePackageSuccess(response), isApiError(response)
```

## Styling

- **Tailwind CSS 3** with `darkMode: 'class'`
- Custom `xs: 475px` breakpoint
- Global styles in `src/styles.css` (imports Tailwind + flatpickr)
- `node_modules/leaflet/dist/leaflet.css` is included via `angular.json` styles array (not `styles.css`)
- Component styles: use `.css` file per component (not inline)
- Dark mode: `ThemeService` adds/removes `dark` class on `<html>`

## Component Conventions

**File naming**: `component-name.ts`, `component-name.html`, `component-name.css` (no `.component` suffix)

**Shared components** location: `src/app/shared/components/` with barrel exports:
- `modals/index.ts` – Modal components (create-package, package-details-panel, add/edit-user, add-customer, docs, etc.)
- `sidebar/index.ts`, `header/index.ts` – Layout parts
- `layout/` – `LayoutComponent`: main shell wrapping sidebar + header + router outlet
- `toast/` – `ToastService` (`providedIn: 'root'`) for imperative notifications; use `toastService.success()`, `.error()`, `.warning()`, `.info()`
- `map/` – `DriverMapComponent`: Leaflet-based interactive driver location map
- `global-search/` – `GlobalSearchComponent` controlled by `GlobalSearchService` (open/close overlay)
- `qr-code/` – `QrCodeComponent` wrapping `angularx-qrcode`
- `onboarding-tour/` – `OnboardingTourComponent` rendered globally; driven by `OnboardingTourService` step registry
- `confirm-dialog/` – imperative confirmation dialog; pair with `ToastService` for feedback
- `signature-pad/` – canvas-based signature capture (used in POD flow)
- Form input primitives (`text-input/`, `textarea/`, `select/`, `checkbox/` + `checkbox-group/`, `radio/` + `radio-group/`, `toggle-switch/`, `search-input/`, `tooltip-input/`, `button/`) – prefer these over raw HTML inputs for consistent styling and a11y
- `banner/`, `notification/`, `user-card/`, `transaction/`, `nav-item/`, `navbar/` – presentational building blocks
- `shared/alert.types.ts` – shared `AlertSeverity` / `AlertVariant` types used by toast, banner, notification

**Directives**: `shared/directives/outside-click.directive.ts` – emits when a click occurs outside the host element.

**Form patterns**: Typed reactive forms with `FormBuilder.nonNullable.group()`:
```typescript
readonly form = this.fb.nonNullable.group({
  receiverEmail: ['', [Validators.required, Validators.pattern(EMAIL_PATTERN)]],
});
```

## Key Dependencies

| Package | Purpose |
|---------|---------|
| `leaflet` + `@types/leaflet` | Interactive driver map in `DriverMapComponent` |
| `angularx-qrcode` | QR code label generation |
| `chart.js` | Dashboard analytics charts (bar, doughnut, line) |
| `flatpickr` | Date-picker in order filters |
| `html2pdf.js` | POD PDF generation (lazy-imported in `core/utils/pod-pdf.utils.ts`) |
| `@ng-icons/core` + `@ng-icons/tabler-icons` | Icon system |

## Commands

```bash
npm start              # Dev server at localhost:4200 (runs version:generate first)
npm run build          # Production build to dist/cloudflare (runs version:generate first)
npm run watch          # Build in watch mode (development)
npm test               # Unit tests via `ng test` (Angular `@angular/build:unit-test` → Vitest)
npm run storybook      # Component docs at localhost:6006
npm run build-storybook  # Static Storybook build
npm run version:generate # Regenerates `src/environments/version.ts` from git/package.json
```

## Testing

- **Vitest** for unit tests (not Karma/Jasmine)
- Test files: `*.spec.ts` alongside components
- Storybook stories: `src/stories/*.stories.ts`

## Icons

Uses `@ng-icons/tabler-icons`. Import and use in component:
```typescript
import { NgIconComponent, provideIcons } from '@ng-icons/core';
import { tablerIconName } from '@ng-icons/tabler-icons';
```

## Important Files

| File | Purpose |
|------|---------|
| `src/app/core/index.ts` | Barrel exports for core module |
| `src/app/core/models/package.models.ts` | Package types, status constants, type guards, `EDGE_FUNCTIONS` map |
| `src/app/core/models/inventory.models.ts` | `InventoryItem`, `InventoryMovement`, DTOs, `InventoryStats` |
| `src/app/core/models/receiver-profile.model.ts` + `receiver-contact.model.ts` | Receiver profile & contact types |
| `src/app/core/models/delivery-location.models.ts` | `DeliveryLocation`, create/update DTOs |
| `src/app/core/models/driver.models.ts` | `DriverProfile`, `DriverLocation`, `DriverMapMarker`, `DriverStatus` |
| `src/app/core/models/staff-profile.model.ts` | `StaffProfile`, `CreateStaffProfileDto` |
| `src/app/core/services/package.service.ts` | Package CRUD via Edge Functions + direct reads |
| `src/app/core/services/inventory.service.ts` | Inventory CRUD + computed `stats` signal |
| `src/app/core/services/receiver.service.ts` | Receiver profile/contact management |
| `src/app/core/services/staff.service.ts` | Staff profile management |
| `src/app/core/services/theme.service.ts` | Dark-mode toggle, persists to localStorage |
| `src/app/core/services/onboarding-tour.service.ts` | Tour state machine + `TOUR_REGISTRY` |
| `src/app/core/services/delivery-location.service.ts` | Delivery location CRUD via direct Supabase |
| `src/app/core/services/driver.service.ts` | Driver management + `mapMarkers` computed signal |
| `src/app/core/services/settings.service.ts` | App preferences persisted to localStorage |
| `src/app/core/utils/pod-pdf.utils.ts` | POD PDF rendering (lazy-loads `html2pdf.js`) |
| `src/app/core/utils/template-render.utils.ts` | Email template variable interpolation |
| `src/app/core/utils/form-validation.utils.ts` | Shared regex/validators (e.g. `EMAIL_PATTERN`) |
| `src/app/shared/services/supabase.service.ts` | Supabase client wrapper |
| `src/app/shared/services/global-search.service.ts` | Controls global search overlay open/close |
| `src/app/shared/components/modals/index.ts` | Modal component exports |
| `src/app/shared/components/toast/toast.service.ts` | Imperative toast notifications |
| `src/app/shared/components/map/driver-map.component.ts` | Leaflet driver map (runs outside NgZone) |
| `src/app/features/dashboard/services/dashboard.service.ts` | Dashboard stats aggregation (feature-local) |
| `src/app/features/inventory/` | Inventory feature (`inventory.ts` list + `recent-movements/`) |
| `scripts/generate-version.mjs` | Pre-build hook that writes `src/environments/version.ts` |
| `supabase/functions/` | Source for deployed edge functions (`create-package`, `update-package`; `driver-pickup` & `receive-at-collection` are deployed but not vendored here) |
| `tailwind.config.js` | Tailwind with safelisted grid classes |

