# AGENTS.md - AI Coding Agent Guidelines

## Project Overview

**Rabelani Express UI** – Angular 21+ delivery/package management dashboard with Supabase backend. Features package tracking, driver management, user authentication, and QR code label printing.

## Architecture

### Directory Structure
```
src/app/
├── core/           # Shared models, services, guards, utils (barrel exported via index.ts)
├── features/       # Feature modules: dashboard, orders, drivers, login, user-management,
│                   #   customer-management, delivery-locations, email-templates, settings
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
- `SettingsService` persists preferences to `localStorage` only — no Supabase calls
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
| `@ng-icons/core` + `@ng-icons/tabler-icons` | Icon system |

## Commands

```bash
npm start              # Dev server at localhost:4200
npm run build          # Production build to dist/cloudflare
npm run watch          # Build in watch mode (development)
npm test               # Vitest unit tests
npm run storybook      # Component docs at localhost:6006
npm run build-storybook  # Static Storybook build
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
| `src/app/core/models/package.models.ts` | Package types, status constants, type guards |
| `src/app/core/models/delivery-location.models.ts` | `DeliveryLocation`, create/update DTOs |
| `src/app/core/models/driver.models.ts` | `DriverProfile`, `DriverLocation`, `DriverMapMarker`, `DriverStatus` |
| `src/app/core/models/staff-profile.model.ts` | `StaffProfile`, `CreateStaffProfileDto` |
| `src/app/core/services/package.service.ts` | Package CRUD via Edge Functions + direct reads |
| `src/app/core/services/delivery-location.service.ts` | Delivery location CRUD via direct Supabase |
| `src/app/core/services/driver.service.ts` | Driver management + `mapMarkers` computed signal |
| `src/app/core/services/settings.service.ts` | App preferences persisted to localStorage |
| `src/app/shared/services/supabase.service.ts` | Supabase client wrapper |
| `src/app/shared/services/global-search.service.ts` | Controls global search overlay open/close |
| `src/app/shared/components/modals/index.ts` | Modal component exports |
| `src/app/shared/components/toast/toast.service.ts` | Imperative toast notifications |
| `src/app/shared/components/map/driver-map.component.ts` | Leaflet driver map (runs outside NgZone) |
| `src/app/features/dashboard/services/dashboard.service.ts` | Dashboard stats aggregation (feature-local) |
| `tailwind.config.js` | Tailwind with safelisted grid classes |

