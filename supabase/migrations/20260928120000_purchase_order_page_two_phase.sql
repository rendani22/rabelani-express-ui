-- Fix the statement timeout (SQLSTATE 57014) on the Global PO page.
--
-- WHAT WAS WRONG
-- `purchase_order_page` selected from `purchase_order_index`, a view that
-- derived EVERY purchase order before the LIMIT was applied. Nothing in that
-- view can be pushed past its aggregates, so asking for 25 rows cost:
--   * one `to_jsonb(package)` + a correlated `package_items` aggregate for
--     every package in the database carrying a po_number (the `pkg_json` CTE),
--   * a `jsonb_agg` of those whole-row payloads per PO,
--   * the receiver-email -> receiver_profiles company join over all of them,
--   * per-(po, inventory item) quantity aggregation over all package_items,
--   * then a sort of the entire set.
-- `purchase_order_stats` scanned the same view twice. Both grew with the
-- package table and eventually blew the 8s statement timeout.
--
-- THE FIX — two phases, nothing heavy before the LIMIT
--   1. `purchase_order_key_index`: one row per PO carrying ONLY what filtering
--      and ordering need (norm, source block, created_at, status counts,
--      derived status). No jsonb, no items, no inventory, no company join.
--      `purchase_order_page` filters and paginates over this, so phase 1 does
--      no per-package work beyond a grouped scan of po-carrying packages.
--   2. `purchase_order_rows(p_po_ids, p_norms)`: the old view's full payload
--      logic, with the page's own PO ids and po numbers pushed down into the
--      base scans. It therefore runs for 25 POs, not all of them.
--
-- Output is byte-identical to the previous RPC: same keys, same ordering
-- (source block first — see the ordering note in
-- 20260717230000_purchase_order_pagination.sql — then newest first, then norm),
-- same derived status, completion and order breakdown. Only the cost changed.
--
-- The company and search filters stay in phase 1 as EXISTS probes rather than
-- precomputed arrays, so an unfiltered page load pays nothing for them. The
-- indexes below are what make those probes, and the norm pushdown, index
-- lookups instead of scans.
--
-- RLS: the new view is `security_invoker = true` and both functions are
-- SECURITY INVOKER (the default), exactly as before. A plain view would run as
-- its owner and hand every PO to any authenticated caller, drivers and
-- customers included. Do not change either.
--
-- Status is compared as text throughout: the public.package_status enum has no
-- 'delivered' value but the client's terminal/POD sets name it, so casting to
-- text keeps this a faithful port instead of an invalid-enum-input error.

-- ============================================================================
-- Indexes — make the canonical po number and the email -> company hop lookups
-- ============================================================================

-- `upper(btrim(po_number))` is the canonical join key everywhere here (package
-- po_numbers are hand-typed and vary in case and padding). Plain
-- idx_packages_po_number is on the raw column and cannot serve it.
create index if not exists idx_packages_po_number_norm
  on public.packages (upper(btrim(po_number)))
  where po_number is not null and deleted_at is null;

create index if not exists idx_purchase_orders_po_number_norm
  on public.purchase_orders (upper(btrim(po_number)));

-- Company membership for a package is resolved by normalized email, which had
-- no index — the company filter would scan receiver_profiles per candidate PO.
create index if not exists idx_receiver_profiles_email_norm
  on public.receiver_profiles (lower(btrim(email)));

-- ============================================================================
-- purchase_order_key_index — phase 1: one cheap row per PO
-- ============================================================================

create or replace view public.purchase_order_key_index
  with (security_invoker = true)
as
with pkg_agg as (
  -- Status counts per canonical po number. Blank-after-trim is skipped, which
  -- is what the client's `if (!poNumber) continue` did.
  select
    upper(btrim(p.po_number))                        as norm,
    count(*)                                         as package_count,
    min(p.created_at)                                as first_created_at,
    count(*) filter (
      where p.status::text in ('delivered', 'collected', 'returned')
    )                                                as terminal_count,
    count(*) filter (
      where p.status::text in ('pending', 'notified', 'in_transit', 'ready_for_collection')
    )                                                as active_count,
    count(*) filter (where p.status::text = 'draft') as draft_count
  from public.packages p
  where p.po_number is not null
    and btrim(p.po_number) <> ''
    and p.deleted_at is null
  group by upper(btrim(p.po_number))
),
first_class as (
  select
    0                                 as source_rank,
    'purchase_order'::text            as source,
    po.id                             as purchase_order_id,
    upper(btrim(po.po_number))        as norm,
    po.po_number                      as po_number,
    po.receiver_id                    as receiver_id,
    po.created_at                     as created_at,
    coalesce(a.package_count, 0)      as package_count,
    coalesce(a.terminal_count, 0)     as terminal_count,
    coalesce(a.active_count, 0)       as active_count,
    coalesce(a.draft_count, 0)        as draft_count
  from public.purchase_orders po
  left join pkg_agg a on a.norm = upper(btrim(po.po_number))
),
order_sourced as (
  -- po numbers that exist only on packages, with no purchase_orders row.
  select
    1                                 as source_rank,
    'order'::text                     as source,
    null::uuid                        as purchase_order_id,
    a.norm                            as norm,
    a.norm                            as po_number,
    null::uuid                        as receiver_id,
    a.first_created_at                as created_at,
    a.package_count                   as package_count,
    a.terminal_count                  as terminal_count,
    a.active_count                    as active_count,
    a.draft_count                     as draft_count
  from pkg_agg a
  where not exists (
    select 1 from public.purchase_orders po
    where upper(btrim(po.po_number)) = a.norm
  )
),
unioned as (
  select * from first_class
  union all
  select * from order_sourced
)
select
  u.*,
  -- derivedStatus: no packages -> draft; all terminal -> completed; all draft
  -- -> draft; any active -> in_progress; otherwise mixed.
  case
    when u.package_count = 0                then 'draft'
    when u.terminal_count = u.package_count then 'completed'
    when u.draft_count = u.package_count    then 'draft'
    when u.active_count > 0                 then 'in_progress'
    else 'mixed'
  end as derived_status
from unioned u;

comment on view public.purchase_order_key_index is
  'One lightweight row per purchase order — first-class rows unioned with po_numbers found only on packages — carrying just the keys, counts and derived status that filtering, ordering and the header tiles need. No payload: purchase_order_rows builds that for one page at a time.';

-- ============================================================================
-- purchase_order_rows — phase 2: the full payload, for named POs only
-- ============================================================================

-- Same derivations the old purchase_order_index did, with p_po_ids / p_norms
-- pushed into the base scans. p_norms must contain the norms of BOTH sources on
-- the page (first-class POs read their linked packages through it too).
create or replace function public.purchase_order_rows(
  p_po_ids uuid[],
  p_norms  text[]
)
  returns table (purchase_order_id uuid, norm text, payload jsonb)
  language sql
  stable
  set search_path = public
as $$
with pkg as (
  select
    p.*,
    upper(btrim(p.po_number)) as norm
  from public.packages p
  where p.po_number is not null
    and btrim(p.po_number) <> ''
    and p.deleted_at is null
    and upper(btrim(p.po_number)) = any(p_norms)
),
pkg_json as (
  -- The card renders whole Package objects (and hands them to the POD export),
  -- so ship the full row plus its items rather than a hand-picked subset.
  select
    pkg.norm,
    pkg.status,
    pkg.created_at,
    pkg.updated_at,
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
    count(*) filter (where j.status::text = 'draft') as draft_count
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
  where po.id = any(p_po_ids)
    and poi.inventory_item_id is not null
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
    0                                         as source_rank,
    upper(btrim(po.po_number))                as norm,
    po.id                                     as purchase_order_id,
    po.po_number                              as po_number,
    'purchase_order'::text                    as source,
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
  where po.id = any(p_po_ids)
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
    sum(coalesce(q.qty, 0))                      as total_items
  from pkg_item_qty q
  left join public.inventory_items inv on inv.id = q.inventory_item_id
  group by q.norm
),
order_sourced as (
  select
    1                                         as source_rank,
    a.norm                                    as norm,
    null::uuid                                as purchase_order_id,
    a.norm                                    as po_number,
    'order'::text                             as source,
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
    a.package_count                           as package_count,
    a.terminal_count                          as terminal_count,
    a.active_count                            as active_count,
    a.draft_count                             as draft_count,
    -- totalItems here is the quantity actually on the packages.
    coalesce(r.total_items, 0)                as total_items,
    -- Completion is package-status based: terminal share of linked orders.
    case
      when a.package_count = 0 then 0
      else round(a.terminal_count::numeric / a.package_count * 100)::int
    end                                       as completion_percentage,
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
  select * from first_class
  union all
  select * from order_sourced
)
select
  u.purchase_order_id,
  u.norm,
  jsonb_build_object(
    'poNumber',             u.po_number,
    'packages',             u.packages,
    'inventoryRefs',        u.inventory_refs,
    'createdAt',            u.created_at,
    'updatedAt',            u.updated_at,
    'derivedStatus',        case
                              when u.package_count = 0                then 'draft'
                              when u.terminal_count = u.package_count then 'completed'
                              when u.draft_count = u.package_count    then 'draft'
                              when u.active_count > 0                 then 'in_progress'
                              else 'mixed'
                            end,
    'totalItems',           u.total_items,
    'completionPercentage', u.completion_percentage,
    'orderBreakdown',       jsonb_build_object(
      'total',    u.package_count,
      'terminal', u.terminal_count,
      'active',   u.active_count,
      'draft',    u.draft_count
    ),
    'source',               u.source,
    'documentUrl',          u.document_url,
    'receiverId',           u.receiver_id,
    'receiverName',         u.receiver_name,
    'receiverEmail',        u.receiver_email,
    'companyIds',           to_jsonb(u.company_ids),
    'poValue',              u.po_value,
    'poDate',               u.po_date,
    'details',              u.details
  ) as payload
from unioned u
$$;

comment on function public.purchase_order_rows(uuid[], text[]) is
  'Ready-to-render PurchaseOrder JSON for the named first-class PO ids and po numbers. The page function picks a page from purchase_order_key_index first, so this derivation only ever runs for that page.';

-- ============================================================================
-- purchase_order_page — phase 1 picks the page, phase 2 fills it in
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
  with keys as (
    select
      k.purchase_order_id,
      k.norm,
      k.source_rank,
      k.created_at
    from public.purchase_order_key_index k
    where (p_status is null or p_status = 'all' or k.derived_status = p_status)
      -- Company membership: the PO's own customer, or any linked package's
      -- receiver, resolved by normalized email as the client did.
      and (
        p_company is null
        or exists (
          select 1 from public.receiver_profiles rp
          where rp.id = k.receiver_id and rp.company_id = p_company
        )
        or exists (
          select 1
          from public.packages p
          join public.receiver_profiles rp
            on lower(btrim(rp.email)) = lower(btrim(p.receiver_email))
          where upper(btrim(p.po_number)) = k.norm
            and p.po_number is not null
            and btrim(p.po_number) <> ''
            and p.deleted_at is null
            and rp.company_id = p_company
        )
      )
      and (
        p_query is null
        or btrim(p_query) = ''
        or k.po_number ilike '%' || public.escape_like(p_query) || '%'
        -- Linked orders: reference or receiver email.
        or exists (
          select 1
          from public.packages p
          where upper(btrim(p.po_number)) = k.norm
            and p.po_number is not null
            and btrim(p.po_number) <> ''
            and p.deleted_at is null
            and (
              p.reference ilike '%' || public.escape_like(p_query) || '%'
              or p.receiver_email ilike '%' || public.escape_like(p_query) || '%'
            )
        )
        -- Inventory name/sku. A first-class PO is searched over the items its
        -- own lines name; an order-sourced one over the items on its packages,
        -- which is the set each one shows as inventoryRefs.
        or (
          k.purchase_order_id is not null
          and exists (
            select 1
            from public.purchase_order_items poi
            join public.inventory_items inv on inv.id = poi.inventory_item_id
            where poi.purchase_order_id = k.purchase_order_id
              and (
                inv.name ilike '%' || public.escape_like(p_query) || '%'
                or inv.sku ilike '%' || public.escape_like(p_query) || '%'
              )
          )
        )
        or (
          k.purchase_order_id is null
          and exists (
            select 1
            from public.packages p
            join public.package_items pi on pi.package_id = p.id
            join public.inventory_items inv on inv.id = pi.inventory_item_id
            where upper(btrim(p.po_number)) = k.norm
              and p.po_number is not null
              and btrim(p.po_number) <> ''
              and p.deleted_at is null
              and (
                inv.name ilike '%' || public.escape_like(p_query) || '%'
                or inv.sku ilike '%' || public.escape_like(p_query) || '%'
              )
          )
        )
      )
    -- source_rank first: see the ordering note in
    -- 20260717230000_purchase_order_pagination.sql.
    order by k.source_rank, k.created_at desc, k.norm
    limit greatest(p_limit, 0)
    offset greatest(p_offset, 0)
  )
  select r.payload
  from keys k
  join public.purchase_order_rows(
    array(select x.purchase_order_id from keys x where x.purchase_order_id is not null),
    array(select x.norm from keys x)
  ) r
    -- First-class rows are identified by PO id, order-sourced ones by norm, so
    -- two purchase_orders rows sharing a canonical number stay two rows.
    on (k.purchase_order_id is not null and r.purchase_order_id = k.purchase_order_id)
    or (k.purchase_order_id is null and r.purchase_order_id is null and r.norm = k.norm)
  order by k.source_rank, k.created_at desc, k.norm
$$;

comment on function public.purchase_order_page(integer, integer, text, text, uuid) is
  'One page of purchase orders as ready-to-render JSON, first-class POs before order-sourced ones, newest first within each block. Paginates over purchase_order_key_index and only then derives the payload, so cost tracks the page size rather than the table.';

-- ============================================================================
-- purchase_order_stats — the six header tiles, off the light view
-- ============================================================================

-- Still deliberately unfiltered: the tiles are labelled "All time" and the
-- client computed them from the full set, not the filtered one.
create or replace function public.purchase_order_stats()
  returns jsonb
  language sql
  stable
  set search_path = public
as $$
  select jsonb_build_object(
    'totalPOs',      count(*),
    'activePOs',     count(*) filter (where i.derived_status = 'in_progress'),
    'completedPOs',  count(*) filter (where i.derived_status = 'completed'),
    'draftPOs',      count(*) filter (where i.derived_status = 'draft'),
    'totalPackages', coalesce(sum(i.package_count), 0),
    -- Distinct across every PO, matching the client's Set of inventory ids:
    -- a first-class PO contributes the items its lines name, an order-sourced
    -- one the items on its packages. Same set the old view's
    -- inventory_item_ids arrays held, without building the arrays.
    'totalInventoryItems', (
      select count(*) from (
        select distinct poi.inventory_item_id as id
        from public.purchase_order_items poi
        where poi.inventory_item_id is not null
        union
        select distinct pi.inventory_item_id as id
        from public.packages p
        join public.package_items pi on pi.package_id = p.id
        where p.po_number is not null
          and btrim(p.po_number) <> ''
          and p.deleted_at is null
          and pi.inventory_item_id is not null
          and not exists (
            select 1 from public.purchase_orders po
            where upper(btrim(po.po_number)) = upper(btrim(p.po_number))
          )
      ) t
    )
  )
  from public.purchase_order_key_index i
$$;

comment on function public.purchase_order_stats() is
  'Aggregate purchase order stats across every PO, unfiltered. Feeds the Global PO header tiles.';

-- The heavy view both functions used to read is now unreferenced, and leaving
-- it granted would leave a PostgREST endpoint that times out the same way.
drop view if exists public.purchase_order_index;

revoke all on function public.purchase_order_rows(uuid[], text[]) from anon;
revoke all on function public.purchase_order_page(integer, integer, text, text, uuid) from anon;
revoke all on function public.purchase_order_stats() from anon;

grant select on public.purchase_order_key_index to authenticated;
grant execute on function public.purchase_order_rows(uuid[], text[]) to authenticated;
grant execute on function public.purchase_order_page(integer, integer, text, text, uuid) to authenticated;
grant execute on function public.purchase_order_stats() to authenticated;
