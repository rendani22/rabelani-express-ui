-- Audit log of package status changes.
-- Each row captures a single status transition for a package, who changed
-- it, when, and an optional note.
create table if not exists public.package_status_history (
  id uuid primary key default gen_random_uuid(),
  package_id uuid not null references public.packages(id) on delete cascade,
  status text not null,
  changed_by uuid references auth.users(id) on delete set null,
  changed_at timestamptz not null default now(),
  note text
);

create index if not exists package_status_history_package_id_idx
  on public.package_status_history (package_id);

create index if not exists package_status_history_changed_at_idx
  on public.package_status_history (changed_at);

-- Trigger: record an entry whenever a package's status changes (or on insert).
create or replace function public.record_package_status_change()
returns trigger
language plpgsql
security definer
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.package_status_history (package_id, status, changed_by)
    values (new.id, new.status, auth.uid());
    return new;
  end if;

  if tg_op = 'UPDATE' and new.status is distinct from old.status then
    insert into public.package_status_history (package_id, status, changed_by)
    values (new.id, new.status, auth.uid());
  end if;

  return new;
end;
$$;

drop trigger if exists trg_package_status_history on public.packages;
create trigger trg_package_status_history
  after insert or update of status on public.packages
  for each row execute function public.record_package_status_change();

-- Backfill: seed an initial entry for every existing package that has no
-- history yet, using its current status and created_at.
insert into public.package_status_history (package_id, status, changed_by, changed_at)
select p.id, p.status, p.created_by, p.created_at
from public.packages p
where not exists (
  select 1 from public.package_status_history h where h.package_id = p.id
);

-- RLS: authenticated users can read history; only the trigger (security
-- definer) writes, so no insert/update/delete policies are exposed.
alter table public.package_status_history enable row level security;

drop policy if exists "package_status_history_select" on public.package_status_history;
create policy "package_status_history_select"
  on public.package_status_history for select
  to authenticated
  using (true);

