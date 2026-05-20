-- Phase 3 beta bridge for chore sync only.
-- Keep this work on beta-multi-user. Payouts, photos, and streak overrides remain local for now.

alter table public.chores
  add column if not exists client_id text,
  add column if not exists parent_profile_id uuid references public.profiles(id) on delete set null;

update public.chores
set client_id = coalesce(client_id, id::text)
where client_id is null;

alter table public.chores
  alter column client_id set not null;

create unique index if not exists chores_household_client_id_idx
on public.chores(household_id, client_id);

alter table public.chore_completions
  add column if not exists client_id text;

update public.chore_completions
set client_id = coalesce(client_id, id::text)
where client_id is null;

alter table public.chore_completions
  alter column client_id set not null;

create unique index if not exists chore_completions_household_client_id_idx
on public.chore_completions(household_id, client_id);
