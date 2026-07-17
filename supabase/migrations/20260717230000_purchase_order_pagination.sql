-- Server-side pagination for the Global PO page.
--
-- The page used to call loadPurchaseOrders(), which pulled every purchase_orders
-- row, every allocation, EVERY package carrying a po_number, and every inventory
-- item they referenced — then derived status, completion, order breakdown and
-- company membership in the browser. Unbounded on all four counts.
--
-- Everything that function did now lives here, in purchase_order_index: one row
-- per PO with its derived fields precomputed. The page function filters and
-- paginates over that view; the stats function aggregates over it unfiltered.
--
-- WHAT A "PO" IS HERE — two sources, unioned:
--   'purchase_order' : a row in purchase_orders (raised from the PO UI)
--   'order'          : a po_number that exists ONLY on packages, no PO row
-- Both are matched on the CANONICAL po number (upper(btrim(...)) — the SQL twin
-- of normalizePoNumber), because package po_numbers are hand-typed and vary in
-- case and padding while purchase_orders.po_number is normalized on write.
--
-- ORDERING IS NOT A MERGED SORT. The client returned [...firstClass, ...synthetic],
-- each block newest-first, so a synthetic PO always sorted after every first-class
-- one regardless of date. Pagination must reproduce that exactly or rows would
-- shift between pages, so the order key leads with the source block.
--
-- RLS: the view is security_invoker = true and the functions are SECURITY
-- INVOKER (the default). Both matter, and the view's setting is not the default
-- — a plain view runs as its OWNER, which would read packages and
-- purchase_orders with RLS bypassed and hand every PO to any authenticated
-- caller, drivers and customers included. Do not drop that setting, and do not
-- make these SECURITY DEFINER.
--
-- Status is compared as text throughout. The public.package_status enum has no
-- 'delivered' value, but the client's terminal/POD sets name it, so casting to
-- text keeps this a faithful port instead of an invalid-enum-input error.

-- ============================================================================
-- purchase_order_index — one row per PO, derived fields precomputed
-- ============================================================================

create or replace view public.purchase_order_index
  with (security_invoker = true)
as
with pkg as (
  -- Every package that carries a po number. Blank-after-trim is skipped, which
  -- is what the client's `if (!poNumber) continue` did.
  select
    p.*,
    upper(btrim(p.po_number)) as norm
  from public.packages p
  where p.po_number is not null
    and btrim(p.po_number) <> ''
    and p.deleted_at is null
),
pkg_json as (
  -- The card renders whole Package objects (and hands them to the POD export),
  -- so ship the full row plus its items rather than a hand-picked subset.
  select
    pkg.norm,
    pkg.id,
    pkg.status,
    pkg.created_at,
    pkg.updated_at,
    pkg.reference,
    pkg.receiver_email,
    (to_jsonb(pkg) - 'norm'::text) || jsonb_build_object(
      'items',
      coalesce(
        (
          select jsonb_agg(
            jsonb_build_object(
              'id',                pi.id,
              'quantity',          pi.quantity,
              'description',       pi.description,
              'inventory_item_id', pi.inventory_item_id
            )
            order by pi.id
          )
          from public.package_items pi
          where pi.package_id = pkg.id
        ),
        '[]'::jsonb
      )
    ) as payload
  from pkg
),
pkg_company as (
  -- Packages expose receiver_email, not receiver_id, so company membership is
  -- resolved by email — the client keyed the same map the same way.
  select
    pkg.norm,
    rp.company_id
  from pkg
  join public.receiver_profiles rp
    on lower(btrim(rp.email)) = lower(btrim(pkg.receiver_email))
  where rp.company_id is not null
),
pkg_company_agg as (
  select norm, array_agg(distinct company_id) as company_ids
  from pkg_company
  group by norm
),
pkg_agg as (
  select
    j.norm,
    jsonb_agg(j.payload order by j.created_at desc) as packages,
    count(*)                                        as package_count,
    min(j.created_at)                               as first_created_at,
    max(coalesce(j.updated_at, j.created_at))       as last_updated_at,
    count(*) filter (
      where j.status::text in ('delivered', 'collected', 'returned')
    ) as terminal_count,
    count(*) filter (
      where j.status::text in ('pending', 'notified', 'in_transit', 'ready_for_collection')
    ) as active_count,
    count(*) filter (where j.status::text = 'draft') as draft_count,
    array_agg(distinct j.reference)                 as package_refs,
    array_agg(distinct j.receiver_email)            as package_emails
  from pkg_json j
  group by j.norm
),
-- Quantity per (po, inventory item) sitting on packages, split by whether the
-- package has completed. The completed slice drives first-class completion;
-- the full slice is the order-sourced PO's inventory ref.
pkg_item_qty as (
  select
    pkg.norm,
    pi.inventory_item_id,
    sum(coalesce(pi.quantity, 0))                                  as qty,
    count(distinct pkg.id)                                         as package_count,
    sum(coalesce(pi.quantity, 0)) filter (
      where pkg.status::text in ('delivered', 'collected')
    )                                                              as completed_qty
  from pkg
  join public.package_items pi on pi.package_id = pkg.id
  where pi.inventory_item_id is not null
  group by pkg.norm, pi.inventory_item_id
),
-- ── First-class POs ────────────────────────────────────────────────────────
po_item as (
  -- One row per (PO, inventory item): PO lines summed, allocations folded in.
  -- The client aggregated by inventory_item_id, so two lines naming the same
  -- item collapse into one ref — keep that.
  select
    po.id                                as purchase_order_id,
    upper(btrim(po.po_number))           as norm,
    poi.inventory_item_id,
    sum(coalesce(poi.ordered_quantity, 0))                     as ordered_qty,
    sum(coalesce(alloc.allocated_qty, 0))                      as allocated_qty,
    sum(greatest(
      0,
      coalesce(poi.ordered_quantity, 0) - coalesce(alloc.allocated_qty, 0)
    ))                                                          as remaining_qty
  from public.purchase_orders po
  join public.purchase_order_items poi on poi.purchase_order_id = po.id
  left join lateral (
    select sum(coalesce(a.allocated_quantity, 0)) as allocated_qty
    from public.purchase_order_item_allocations a
    where a.purchase_order_item_id = poi.id
  ) alloc on true
  where poi.inventory_item_id is not null
  group by po.id, upper(btrim(po.po_number)), poi.inventory_item_id
),
po_refs as (
  select
    pi.purchase_order_id,
    pi.norm,
    jsonb_agg(
      jsonb_build_object(
        'inventoryItemId',    pi.inventory_item_id,
        'item',               to_jsonb(inv),
        -- totalQuantity mirrors orderedQuantity for first-class POs.
        'totalQuantity',      pi.ordered_qty,
        'orderedQuantity',    pi.ordered_qty,
        'allocatedQuantity',  pi.allocated_qty,
        'remainingQuantity',  pi.remaining_qty,
        -- Packages of this PO that actually carry the item, not every package.
        'packageCount',       coalesce(q.package_count, 0)
      )
      order by pi.inventory_item_id
    )                                              as inventory_refs,
    array_agg(pi.inventory_item_id)                as inventory_item_ids,
    array_agg(inv.name) filter (where inv.name is not null)   as inv_names,
    array_agg(inv.sku)  filter (where inv.sku  is not null)   as inv_skus,
    sum(pi.ordered_qty)                            as ordered_total,
    -- Only quantity on items this PO actually tracks counts as completed.
    sum(coalesce(q.completed_qty, 0))              as completed_total
  from po_item pi
  left join public.inventory_items inv on inv.id = pi.inventory_item_id
  left join pkg_item_qty q on q.norm = pi.norm and q.inventory_item_id = pi.inventory_item_id
  group by pi.purchase_order_id, pi.norm
),
first_class as (
  select
    upper(btrim(po.po_number))                as norm,
    po.po_number                              as po_number,
    'purchase_order'::text                    as source,
    po.id                                     as purchase_order_id,
    po.created_at                             as created_at,
    po.updated_at                             as updated_at,
    po.document_url                           as document_url,
    po.receiver_id                            as receiver_id,
    case
      when rp.id is null then null
      else btrim(coalesce(rp.name, '') || ' ' || coalesce(rp.surname, ''))
    end                                       as receiver_name,
    rp.email                                  as receiver_email,
    po.po_value                               as po_value,
    po.po_date                                as po_date,
    po.details                                as details,
    coalesce(a.packages, '[]'::jsonb)         as packages,
    coalesce(r.inventory_refs, '[]'::jsonb)   as inventory_refs,
    coalesce(r.inventory_item_ids, '{}')      as inventory_item_ids,
    coalesce(a.package_count, 0)              as package_count,
    coalesce(a.terminal_count, 0)             as terminal_count,
    coalesce(a.active_count, 0)               as active_count,
    coalesce(a.draft_count, 0)                as draft_count,
    -- totalItems is the sum of ORDERED quantity across PO lines. Summed from
    -- the raw lines, not po_refs, so lines without an inventory item still count.
    coalesce((
      select sum(coalesce(poi.ordered_quantity, 0))
      from public.purchase_order_items poi
      where poi.purchase_order_id = po.id
    ), 0)                                     as total_items,
    -- Completion = delivered/collected quantity vs ordered quantity, clamped.
    case
      when coalesce(r.ordered_total, 0) <= 0 then 0
      else round(
        least(greatest(coalesce(r.completed_total, 0), 0), r.ordered_total)
        / r.ordered_total * 100
      )::int
    end                                       as completion_percentage,
    coalesce(r.inv_names, '{}')               as inv_names,
    coalesce(r.inv_skus, '{}')                as inv_skus,
    coalesce(a.package_refs, '{}')            as package_refs,
    coalesce(a.package_emails, '{}')          as package_emails,
    -- The PO's own customer's company counts even with no packages yet, so it
    -- is unioned onto the companies its linked packages' receivers belong to.
    (
      select coalesce(array_agg(distinct x), '{}')
      from unnest(
        coalesce(pca.company_ids, '{}'::uuid[])
        || case
             when rp.company_id is not null then array[rp.company_id]::uuid[]
             else '{}'::uuid[]
           end
      ) t(x)
    )                                         as company_ids
  from public.purchase_orders po
  left join public.receiver_profiles rp on rp.id = po.receiver_id
  left join pkg_agg a on a.norm = upper(btrim(po.po_number))
  left join po_refs r on r.purchase_order_id = po.id
  left join pkg_company_agg pca on pca.norm = upper(btrim(po.po_number))
),
-- ── Order-sourced POs — po numbers with no purchase_orders row ─────────────
order_refs as (
  select
    q.norm,
    jsonb_agg(
      jsonb_build_object(
        'inventoryItemId',   q.inventory_item_id,
        'item',              to_jsonb(inv),
        'totalQuantity',     q.qty,
        -- No ordered/allocated metadata exists for these, so the client treated
        -- what shipped as both ordered and allocated, leaving nothing remaining.
        'orderedQuantity',   q.qty,
        'allocatedQuantity', q.qty,
        'remainingQuantity', 0,
        'packageCount',      q.package_count
      )
      order by q.inventory_item_id
    )                                            as inventory_refs,
    array_agg(q.inventory_item_id)               as inventory_item_ids,
    array_agg(inv.name) filter (where inv.name is not null) as inv_names,
    array_agg(inv.sku)  filter (where inv.sku  is not null) as inv_skus
  from pkg_item_qty q
  left join public.inventory_items inv on inv.id = q.inventory_item_id
  group by q.norm
),
order_sourced as (
  select
    a.norm                                    as norm,
    a.norm                                    as po_number,
    'order'::text                             as source,
    null::uuid                                as purchase_order_id,
    a.first_created_at                        as created_at,
    a.last_updated_at                         as updated_at,
    null::text                                as document_url,
    null::uuid                                as receiver_id,
    null::text                                as receiver_name,
    null::text                                as receiver_email,
    null::numeric                             as po_value,
    null::date                                as po_date,
    null::text                                as details,
    a.packages                                as packages,
    coalesce(r.inventory_refs, '[]'::jsonb)   as inventory_refs,
    coalesce(r.inventory_item_ids, '{}')      as inventory_item_ids,
    a.package_count                           as package_count,
    a.terminal_count                          as terminal_count,
    a.active_count                            as active_count,
    a.draft_count                             as draft_count,
    -- totalItems here is the quantity actually on the packages.
    coalesce((
      select sum(coalesce(q.qty, 0)) from pkg_item_qty q where q.norm = a.norm
    ), 0)                                     as total_items,
    -- Completion is package-status based: terminal share of linked orders.
    case
      when a.package_count = 0 then 0
      else round(a.terminal_count::numeric / a.package_count * 100)::int
    end                                       as completion_percentage,
    coalesce(r.inv_names, '{}')               as inv_names,
    coalesce(r.inv_skus, '{}')                as inv_skus,
    a.package_refs                            as package_refs,
    a.package_emails                          as package_emails,
    (
      select coalesce(array_agg(distinct pc.company_id), '{}')
      from pkg_company pc where pc.norm = a.norm
    )                                         as company_ids
  from pkg_agg a
  left join order_refs r on r.norm = a.norm
  where not exists (
    select 1 from public.purchase_orders po
    where upper(btrim(po.po_number)) = a.norm
  )
),
unioned as (
  select 0 as source_rank, * from first_class
  union all
  select 1 as source_rank, * from order_sourced
)
select
  u.*,
  -- derivedStatus: no packages → draft; all terminal → completed; all draft →
  -- draft; any active → in_progress; otherwise mixed.
  case
    when u.package_count = 0                       then 'draft'
    when u.terminal_count = u.package_count        then 'completed'
    when u.draft_count = u.package_count           then 'draft'
    when u.active_count > 0                        then 'in_progress'
    else 'mixed'
  end as derived_status
from unioned u;

comment on view public.purchase_order_index is
  'One row per purchase order — first-class rows unioned with po_numbers found only on packages — with derived status, completion, order breakdown and company membership precomputed. Backs purchase_order_page and purchase_order_stats.';

-- ============================================================================
-- purchase_order_page — one page of POs as ready-to-render JSON
-- ============================================================================

create or replace function public.purchase_order_page(
  p_limit   integer default 25,
  p_offset  integer default 0,
  p_query   text default null,
  p_status  text default null,
  p_company uuid default null
)
  returns setof jsonb
  language sql
  stable
  set search_path = public
as $$
  select jsonb_build_object(
    'poNumber',             i.po_number,
    'packages',             i.packages,
    'inventoryRefs',        i.inventory_refs,
    'createdAt',            i.created_at,
    'updatedAt',            i.updated_at,
    'derivedStatus',        i.derived_status,
    'totalItems',           i.total_items,
    'completionPercentage', i.completion_percentage,
    'orderBreakdown',       jsonb_build_object(
      'total',    i.package_count,
      'terminal', i.terminal_count,
      'active',   i.active_count,
      'draft',    i.draft_count
    ),
    'source',               i.source,
    'documentUrl',          i.document_url,
    'receiverId',           i.receiver_id,
    'receiverName',         i.receiver_name,
    'receiverEmail',        i.receiver_email,
    'companyIds',           to_jsonb(i.company_ids),
    'poValue',              i.po_value,
    'poDate',               i.po_date,
    'details',              i.details
  )
  from public.purchase_order_index i
  where (p_company is null or p_company = any(i.company_ids))
    and (p_status is null or p_status = 'all' or i.derived_status = p_status)
    and (
      p_query is null
      or btrim(p_query) = ''
      or i.po_number ilike '%' || public.escape_like(p_query) || '%'
      or exists (
        select 1 from unnest(i.package_refs) t(v)
        where v ilike '%' || public.escape_like(p_query) || '%'
      )
      or exists (
        select 1 from unnest(i.package_emails) t(v)
        where v ilike '%' || public.escape_like(p_query) || '%'
      )
      or exists (
        select 1 from unnest(i.inv_names) t(v)
        where v ilike '%' || public.escape_like(p_query) || '%'
      )
      or exists (
        select 1 from unnest(i.inv_skus) t(v)
        where v ilike '%' || public.escape_like(p_query) || '%'
      )
    )
  -- source_rank first: see the ordering note at the top of this file.
  order by i.source_rank, i.created_at desc, i.norm
  limit greatest(p_limit, 0)
  offset greatest(p_offset, 0)
$$;

comment on function public.purchase_order_page(integer, integer, text, text, uuid) is
  'One page of purchase orders as ready-to-render JSON, first-class POs before order-sourced ones, newest first within each block.';

-- ============================================================================
-- purchase_order_stats — the six header tiles
-- ============================================================================

-- Deliberately unfiltered: the tiles are labelled "All time" and the client
-- computed them from the full set, not the filtered one. Keep them that way.
create or replace function public.purchase_order_stats()
  returns jsonb
  language sql
  stable
  set search_path = public
as $$
  select jsonb_build_object(
    'totalPOs',     count(*),
    'activePOs',    count(*) filter (where i.derived_status = 'in_progress'),
    'completedPOs', count(*) filter (where i.derived_status = 'completed'),
    'draftPOs',     count(*) filter (where i.derived_status = 'draft'),
    'totalPackages', coalesce(sum(i.package_count), 0),
    -- Distinct across every PO, matching the client's Set of inventory ids.
    'totalInventoryItems', (
      select count(distinct id)
      from public.purchase_order_index x, unnest(x.inventory_item_ids) t(id)
    )
  )
  from public.purchase_order_index i
$$;

comment on function public.purchase_order_stats() is
  'Aggregate purchase order stats across every PO, unfiltered. Feeds the Global PO header tiles.';

revoke all on function public.purchase_order_page(integer, integer, text, text, uuid) from anon;
revoke all on function public.purchase_order_stats() from anon;

grant select on public.purchase_order_index to authenticated;
grant execute on function public.purchase_order_page(integer, integer, text, text, uuid) to authenticated;
grant execute on function public.purchase_order_stats() to authenticated;
