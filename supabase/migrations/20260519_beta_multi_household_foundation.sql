-- Beta-only foundation migration.
-- Keep risky auth and multi-household work on beta-multi-user, not home-stable.

create extension if not exists "pgcrypto";

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

create table if not exists public.households (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.profiles (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  user_id uuid unique references auth.users(id) on delete cascade,
  email text,
  display_name text not null,
  role text not null check (role in ('parent', 'child')),
  household_role text not null default 'parent' check (household_role in ('owner', 'parent', 'caregiver', 'viewer')),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.children (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  profile_id uuid references public.profiles(id) on delete set null,
  parent_profile_id uuid references public.profiles(id) on delete set null,
  display_name text not null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.chores (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  parent_id uuid not null references auth.users(id) on delete cascade,
  parent_profile_id uuid references public.profiles(id) on delete set null,
  child_id uuid not null references public.children(id) on delete cascade,
  client_id text,
  title text not null,
  description text not null default '',
  amount_cents integer not null check (amount_cents >= 0),
  start_date date,
  due_date date,
  recurring boolean not null default false,
  repeat_days jsonb not null default '[]'::jsonb,
  repeat_pattern text not null default 'weekly',
  repeat_days_week_a jsonb not null default '[]'::jsonb,
  repeat_days_week_b jsonb not null default '[]'::jsonb,
  chore_kind text not null default 'one_time',
  reset_frequency text not null default 'daily',
  max_completions_per_reset integer not null default 1,
  manual_availability boolean not null default false,
  total_required_completions integer,
  payout_rule text not null default 'all_or_nothing',
  miss_behavior text not null default 'fail_period',
  only_when_child_present boolean not null default false,
  rrc_schedule jsonb,
  is_template boolean not null default false,
  template_chore_id uuid,
  instance_period_key text,
  status text not null default 'available' check (status in ('available', 'submitted', 'approved', 'rejected', 'paid')),
  rejection_note text,
  submitted_at timestamptz,
  approved_at timestamptz,
  paid_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.chore_completions (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  chore_id uuid not null references public.chores(id) on delete cascade,
  child_id uuid not null references public.children(id) on delete cascade,
  parent_profile_id uuid references public.profiles(id) on delete set null,
  client_id text,
  completion_date date not null,
  status text not null default 'submitted' check (status in ('submitted', 'approved', 'rejected', 'excused', 'completed_late', 'streak_protected')),
  submitted_at timestamptz,
  approved_at timestamptz,
  rejected_at timestamptz,
  rejection_note text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.chore_photos (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  completion_id uuid not null references public.chore_completions(id) on delete cascade,
  storage_path text,
  photo_url text,
  photo_label text check (photo_label in ('Before', 'After', 'Extra')),
  uploaded_at timestamptz not null default timezone('utc', now()),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  child_id uuid not null references public.children(id) on delete cascade,
  parent_profile_id uuid references public.profiles(id) on delete set null,
  amount_cents integer not null check (amount_cents >= 0),
  paid_method text not null default 'Manual Apple Cash',
  notes text,
  paid_at timestamptz not null default timezone('utc', now()),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.chore_adjustments (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  chore_id uuid not null references public.chores(id) on delete cascade,
  completion_id uuid references public.chore_completions(id) on delete set null,
  parent_profile_id uuid references public.profiles(id) on delete set null,
  adjustment_type text not null check (adjustment_type in ('excused', 'completed_late', 'streak_protected', 'manual_status_change')),
  missed_date date,
  note text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

alter table public.chores
  add column if not exists household_id uuid references public.households(id) on delete cascade,
  add column if not exists parent_id uuid references auth.users(id) on delete cascade,
  add column if not exists parent_profile_id uuid references public.profiles(id) on delete set null,
  add column if not exists child_id uuid references public.children(id) on delete cascade,
  add column if not exists client_id text,
  add column if not exists start_date date,
  add column if not exists chore_kind text,
  add column if not exists reset_frequency text,
  add column if not exists max_completions_per_reset integer,
  add column if not exists manual_availability boolean,
  add column if not exists total_required_completions integer,
  add column if not exists payout_rule text,
  add column if not exists miss_behavior text,
  add column if not exists only_when_child_present boolean,
  add column if not exists rrc_schedule jsonb,
  add column if not exists repeat_days jsonb,
  add column if not exists repeat_pattern text,
  add column if not exists repeat_days_week_a jsonb,
  add column if not exists repeat_days_week_b jsonb,
  add column if not exists is_template boolean,
  add column if not exists template_chore_id uuid,
  add column if not exists instance_period_key text;

alter table public.chore_completions
  add column if not exists client_id text;

create or replace function public.current_user_household_ids()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select household_id
  from public.profiles
  where user_id = auth.uid()
$$;

create index if not exists profiles_household_id_idx on public.profiles(household_id);
create index if not exists children_household_id_idx on public.children(household_id);
create index if not exists chores_household_id_idx on public.chores(household_id);
create index if not exists chore_completions_household_id_idx on public.chore_completions(household_id);
create index if not exists chore_photos_household_id_idx on public.chore_photos(household_id);
create index if not exists payments_household_id_idx on public.payments(household_id);
create index if not exists chore_adjustments_household_id_idx on public.chore_adjustments(household_id);

drop trigger if exists households_set_updated_at on public.households;
create trigger households_set_updated_at
before update on public.households
for each row
execute function public.set_updated_at();

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
before update on public.profiles
for each row
execute function public.set_updated_at();

drop trigger if exists children_set_updated_at on public.children;
create trigger children_set_updated_at
before update on public.children
for each row
execute function public.set_updated_at();

drop trigger if exists chores_set_updated_at on public.chores;
create trigger chores_set_updated_at
before update on public.chores
for each row
execute function public.set_updated_at();

drop trigger if exists chore_completions_set_updated_at on public.chore_completions;
create trigger chore_completions_set_updated_at
before update on public.chore_completions
for each row
execute function public.set_updated_at();

drop trigger if exists chore_photos_set_updated_at on public.chore_photos;
create trigger chore_photos_set_updated_at
before update on public.chore_photos
for each row
execute function public.set_updated_at();

drop trigger if exists payments_set_updated_at on public.payments;
create trigger payments_set_updated_at
before update on public.payments
for each row
execute function public.set_updated_at();

drop trigger if exists chore_adjustments_set_updated_at on public.chore_adjustments;
create trigger chore_adjustments_set_updated_at
before update on public.chore_adjustments
for each row
execute function public.set_updated_at();

alter table public.households enable row level security;
alter table public.profiles enable row level security;
alter table public.children enable row level security;
alter table public.chores enable row level security;
alter table public.chore_completions enable row level security;
alter table public.chore_photos enable row level security;
alter table public.payments enable row level security;
alter table public.chore_adjustments enable row level security;

drop policy if exists "households same household access" on public.households;
create policy "households same household access"
on public.households
for select
to authenticated
using (id in (select public.current_user_household_ids()));

drop policy if exists "households owner insert" on public.households;
create policy "households owner insert"
on public.households
for insert
to authenticated
with check (true);

drop policy if exists "households same household update" on public.households;
create policy "households same household update"
on public.households
for update
to authenticated
using (id in (select public.current_user_household_ids()))
with check (id in (select public.current_user_household_ids()));

drop policy if exists "profiles same household access" on public.profiles;
create policy "profiles same household access"
on public.profiles
for select
to authenticated
using (household_id in (select public.current_user_household_ids()));

drop policy if exists "profiles owner insert" on public.profiles;
create policy "profiles owner insert"
on public.profiles
for insert
to authenticated
with check (user_id = auth.uid());

drop policy if exists "profiles same household update" on public.profiles;
create policy "profiles same household update"
on public.profiles
for update
to authenticated
using (household_id in (select public.current_user_household_ids()))
with check (household_id in (select public.current_user_household_ids()));

drop policy if exists "children same household access" on public.children;
create policy "children same household access"
on public.children
for all
to authenticated
using (household_id in (select public.current_user_household_ids()))
with check (household_id in (select public.current_user_household_ids()));

drop policy if exists "chores same household access" on public.chores;
create policy "chores same household access"
on public.chores
for all
to authenticated
using (household_id in (select public.current_user_household_ids()))
with check (household_id in (select public.current_user_household_ids()));

drop policy if exists "chore completions same household access" on public.chore_completions;
create policy "chore completions same household access"
on public.chore_completions
for all
to authenticated
using (household_id in (select public.current_user_household_ids()))
with check (household_id in (select public.current_user_household_ids()));

drop policy if exists "chore photos same household access" on public.chore_photos;
create policy "chore photos same household access"
on public.chore_photos
for all
to authenticated
using (household_id in (select public.current_user_household_ids()))
with check (household_id in (select public.current_user_household_ids()));

drop policy if exists "payments same household access" on public.payments;
create policy "payments same household access"
on public.payments
for all
to authenticated
using (household_id in (select public.current_user_household_ids()))
with check (household_id in (select public.current_user_household_ids()));

drop policy if exists "chore adjustments same household access" on public.chore_adjustments;
create policy "chore adjustments same household access"
on public.chore_adjustments
for all
to authenticated
using (household_id in (select public.current_user_household_ids()))
with check (household_id in (select public.current_user_household_ids()));
