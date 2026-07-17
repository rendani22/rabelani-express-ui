-- Server-side pagination for the customer portal's package list.
--
-- The portal used to fetch every row of customer_packages and do search,
-- status filtering, counting and PO grouping in the browser. That does not
-- scale for a Buyer with many assigned End users, so all four move here.
--
-- The unit of pagination is the PO GROUP, not the package. Paginating by
-- package would let one PO's packages straddle a page boundary and render as
-- two separate PO cards, so the grouping is done first and LIMIT/OFFSET is
-- applied to the grouped result. Groups are ordered by their most recent
-- package, which is what the client's groupByPo() did.
--
-- Both functions read customer_packages and are SECURITY INVOKER (the default).
-- That is deliberate: the view is security_invoker = false, so it runs as its
-- owner and scopes itself by auth.uid(). Reading it from an invoker function
-- keeps that scoping intact and adds no new way to reach another customer's
-- rows. Do not make these SECURITY DEFINER.

-- Escape a user-supplied search term for use as an ILIKE pattern. The portal's
-- search is a plain substring match, so `%` and `_` typed by the customer must
-- match literally rather than act as wildcards.
create or replace function public.escape_like(p_term text)
  returns text
  language sql
  immutable
  set search_path = public
as $$
  select replace(replace(replace(btrim(p_term), '\', '\\'), '%', '\%'), '_', '\_')
$$;

comment on function public.escape_like(text) is
  'Escape backslash/percent/underscore so a search term is matched literally by ILIKE.';

-- One page of PO groups for the signed-in customer.
--   p_query  : substring match on po_number; null/blank means no search
--   p_status : exact status match; null means every status
create or replace function public.customer_package_groups(
  p_limit  integer default 10,
  p_offset integer default 0,
  p_query  text default null,
  p_status public.package_status default null
)
  returns table (key text, po text, packages jsonb)
  language sql
  stable
  set search_path = public
as $$
  with scoped as (
    select cp.*
    from public.customer_packages cp
    where (
        p_query is null
        or btrim(p_query) = ''
        or cp.po_number ilike '%' || public.escape_like(p_query) || '%'
      )
      and (p_status is null or cp.status = p_status)
  ),
  keyed as (
    -- Packages with a PO share a group; those without stand alone, keyed by id.
    select
      case
        when nullif(btrim(coalesce(s.po_number, '')), '') is not null
          then 'po:' || btrim(s.po_number)
        else s.id::text
      end as key,
      nullif(btrim(coalesce(s.po_number, '')), '') as po,
      s.*
    from scoped s
  )
  select
    k.key,
    k.po,
    jsonb_agg(
      jsonb_build_object(
        'id',                   k.id,
        'po_number',            k.po_number,
        'status',               k.status,
        'customer_notes',       k.customer_notes,
        'created_at',           k.created_at,
        'updated_at',           k.updated_at,
        'reschedule_requested', k.reschedule_requested,
        'is_receiver',          k.is_receiver,
        'receiver_name',        k.receiver_name,
        'items',                k.items
      )
      order by k.created_at desc
    ) as packages
  from keyed k
  group by k.key, k.po
  order by max(k.created_at) desc, k.key
  limit greatest(p_limit, 0)
  offset greatest(p_offset, 0)
$$;

comment on function public.customer_package_groups(integer, integer, text, public.package_status) is
  'One page of the signed-in customer''s PO groups, newest group first. Paginates by group so a PO never splits across pages.';

-- Package counts per status for the signed-in customer, within the current
-- search scope. Deliberately NOT filtered by status: these feed the filter
-- chips, which must keep showing the size of every other status.
create or replace function public.customer_package_status_counts(
  p_query text default null
)
  returns table (status public.package_status, count bigint)
  language sql
  stable
  set search_path = public
as $$
  select cp.status, count(*)
  from public.customer_packages cp
  where (
      p_query is null
      or btrim(p_query) = ''
      or cp.po_number ilike '%' || public.escape_like(p_query) || '%'
    )
  group by cp.status
$$;

comment on function public.customer_package_status_counts(text) is
  'Package counts per status for the signed-in customer, within the search scope. Feeds the portal filter chips.';

revoke all on function public.escape_like(text) from anon;
revoke all on function public.customer_package_groups(integer, integer, text, public.package_status) from anon;
revoke all on function public.customer_package_status_counts(text) from anon;

grant execute on function public.escape_like(text) to authenticated;
grant execute on function public.customer_package_groups(integer, integer, text, public.package_status) to authenticated;
grant execute on function public.customer_package_status_counts(text) to authenticated;
