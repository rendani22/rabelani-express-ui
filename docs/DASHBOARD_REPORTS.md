# Dashboard Reports — Roadmap & Rationale

This document captures the analytics surface implemented on the dashboard
plus follow-up ideas that the schema can already support.

## Data sources we now leverage

| Schema element | Used by |
|----------------|---------|
| `packages.status`, `created_at` | Status distribution, weekly/monthly trends, recent activity |
| `packages.picked_up_by/at`, `received_at`, `collected_at` | **Cycle-time KPIs**, **Driver performance**, **SLA alerts** |
| `packages.delivery_location_id` | Location distribution |
| `packages.status` = `returned` | **Return rate** in timeline summary |
| `package_items` + `inventory_item_id` | **Top items shipped** |
| `inventory_items.quantity / low_stock_threshold / unit_price / is_active` | **Inventory health** |
| `pods.completed_at / pdf_url / is_locked` | POD stats |
| `staff_profiles` (role = driver) | Driver overview, **driver performance leaderboard** |

## Reports currently rendered

1. **Package Stats Overview** — totals, today/week, drivers, PODs.
2. **Status Distribution** doughnut.
3. **Packages This Week** + **30-Day Volume** trend charts.
4. **Recent Packages** activity list.
5. **Driver Overview** (existing).
6. **Packages by Delivery Location** distribution.
7. **Proof of Delivery** stats (today / this week / locked / with PDF).
8. **Delivery Performance** (completed vs in-progress vs pending).
9. ✨ **Cycle-Time Insights** — avg create→pickup, pickup→receive, receive→collect, end-to-end. Identifies operational bottlenecks.
10. ✨ **SLA Alerts** — packages stuck past per-status thresholds (pending/notified/in-transit > 24h, ready_for_collection > 72h), color-coded by severity.
11. ✨ **Driver Performance Leaderboard** — pickups, deliveries, avg pickup→delivery hours per driver. Rewards top performers, surfaces slow ones.
12. ✨ **Top Items Shipped** — most-shipped items aggregated from `package_items`. Drives stock-planning.
13. ✨ **Inventory Health** — total/active SKUs, out-of-stock, low-stock, total stock value, top items needing restock.
14. ✨ **Activity Heatmap (Day × Hour)** — busiest creation windows, supports shift/staffing planning.
15. **Top Receivers** + **Package Timeline Summary** with new **Return Rate** metric.

✨ = added in this iteration.

## SLA thresholds (configurable)

Defined inline in `DashboardService.loadLifecycleAndStuck`:

```ts
{
  pending: 24h,
  notified: 24h,
  in_transit: 24h,
  ready_for_collection: 72h,
}
```

Thresholds should eventually move into `SettingsService` so admins can tune
without a redeploy.

## Follow-up ideas (not yet built)

These all map cleanly to existing schema columns:

### Operational

- **Collection-Point Throughput & Dwell Time** — per delivery location:
  packages received vs collected, average dwell time at the collection
  point. Needs `delivery_location_id` + `received_at` + `collected_at`.
  Identifies overloaded sites and slow pickups.
- **Returned Packages Quality Report** — return rate per delivery
  location and per driver; shows where quality issues concentrate.
- **POD Compliance Card** — % of `collected` packages with a locked POD
  and a generated PDF. Flags missing/legal-risk records. Queries
  `pods.is_locked`, `pods.pdf_url`.

### Inventory

- **Stock Movement Trend (30 days)** — line chart of net delta from
  `inventory_movements` grouped by source (`restock`, `package_deduct`,
  `manual_edit`). Surfaces inventory burn rate.
- **Stale Stock** — items with `quantity > 0` whose latest
  `inventory_movements` row is > 60 days old. Already exposed by
  `InventoryStats.staleStockCount`; surface it on the dashboard.
- **Inventory Reconciliation Gaps** — package items with no
  `inventory_item_id`. Data-quality KPI for warehouse hygiene.

### Customer / receiver

- **Repeat-Receiver Ratio** — % of packages going to receivers with > 1
  package in the period. Joins `packages.receiver_email` to
  `receiver_profiles.email`.
- **Top Receivers (by volume in period)** — already shown; could be
  augmented with average cycle-time per receiver to flag VIPs with poor
  experience.

### Live / map

- **Live Driver Map** — embed the existing `DriverMapComponent` in the
  dashboard so admins immediately see where active drivers are
  (`driver_locations` real-time table). Already supported by RLS.

### Compliance / audit

- **Audit Activity Feed** — last N rows from `audit_logs` filtered to
  `POD_LOCKED`, `POD_PDF_GENERATED`, `PACKAGE_DELETE_DENIED`, etc. Useful
  for an admin compliance pane.

### Data quality

- **Missing PO Numbers** — count and rate of packages without `po_number`.
  Useful where PO is required for billing/accounting reconciliation.
- **Unassigned Delivery Locations** — already shown in
  location-distribution as "No Location"; surface the rate as a KPI.

## Implementation notes

- **All aggregations are computed client-side** because Supabase REST
  does not support GROUP BY or SQL expressions in `select()`. For very
  large datasets (>10k packages in a window) we should add
  `database/views` or RPC functions to push the work to Postgres.
- The dashboard service intentionally keeps **per-feature loaders
  parallel** in `loadDashboardData`, so each new card only adds latency
  equal to its own slowest query.
- Heat-map dynamic Tailwind classes are kept as **string literals** so
  Tailwind's content scanner picks them up; do not interpolate class
  fragments.

