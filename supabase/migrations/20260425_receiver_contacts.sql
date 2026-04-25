-- Alternative contact people for receiver profiles.
-- Each receiver can have multiple alternative contacts (name + phone).
create table if not exists public.receiver_contacts (
  id uuid primary key default gen_random_uuid(),
  receiver_id uuid not null references public.receiver_profiles(id) on delete cascade,
  name text not null,
  phone text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists receiver_contacts_receiver_id_idx
  on public.receiver_contacts (receiver_id);

-- Keep updated_at fresh on update.
create or replace function public.set_receiver_contacts_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_receiver_contacts_updated_at on public.receiver_contacts;
create trigger trg_receiver_contacts_updated_at
  before update on public.receiver_contacts
  for each row execute function public.set_receiver_contacts_updated_at();

-- RLS: allow authenticated users to manage contacts (mirrors receiver_profiles policy).
alter table public.receiver_contacts enable row level security;

drop policy if exists "receiver_contacts_select" on public.receiver_contacts;
create policy "receiver_contacts_select"
  on public.receiver_contacts for select
  to authenticated
  using (true);

drop policy if exists "receiver_contacts_insert" on public.receiver_contacts;
create policy "receiver_contacts_insert"
  on public.receiver_contacts for insert
  to authenticated
  with check (true);

drop policy if exists "receiver_contacts_update" on public.receiver_contacts;
create policy "receiver_contacts_update"
  on public.receiver_contacts for update
  to authenticated
  using (true)
  with check (true);

drop policy if exists "receiver_contacts_delete" on public.receiver_contacts;
create policy "receiver_contacts_delete"
  on public.receiver_contacts for delete
  to authenticated
  using (true);

