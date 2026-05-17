create table if not exists public.household_app_state (
  household_id text primary key,
  app_data jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.household_app_state enable row level security;

drop policy if exists "anon household read/write family" on public.household_app_state;
drop policy if exists "public household read/write family" on public.household_app_state;

create policy "public household read/write family"
on public.household_app_state
for all
to public
using (household_id = 'family-household-1')
with check (household_id = 'family-household-1');
