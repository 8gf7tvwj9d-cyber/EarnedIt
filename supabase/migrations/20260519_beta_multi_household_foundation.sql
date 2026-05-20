-- Beta-only foundation migration.
-- Keep risky auth and multi-household work on beta-multi-user, not home-stable.
--
-- Dependency order:
-- 1. Extensions
-- 2. Independent functions
-- 3. Table shells without cross-table foreign keys
-- 4. Column normalization for fresh, partial beta, and legacy MVP installs
-- 5. Foreign keys after every referenced table exists
-- 6. Indexes
-- 7. Triggers
-- 8. RLS
-- 9. Policies
-- 10. Dependent functions used by policies

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

create table if not exists public.household_app_state (
  household_id text primary key,
  app_data jsonb not null,
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.households (
  id uuid primary key default gen_random_uuid()
);

create table if not exists public.profiles (
  id uuid primary key default gen_random_uuid()
);

create table if not exists public.children (
  id uuid primary key default gen_random_uuid()
);

create table if not exists public.chores (
  id uuid primary key default gen_random_uuid()
);

create table if not exists public.chore_completions (
  id uuid primary key default gen_random_uuid()
);

create table if not exists public.chore_photos (
  id uuid primary key default gen_random_uuid()
);

create table if not exists public.payments (
  id uuid primary key default gen_random_uuid()
);

create table if not exists public.payouts (
  id uuid primary key default gen_random_uuid()
);

create table if not exists public.chore_adjustments (
  id uuid primary key default gen_random_uuid()
);

alter table public.households
  add column if not exists name text not null default 'My Household',
  add column if not exists created_at timestamptz not null default timezone('utc', now()),
  add column if not exists updated_at timestamptz not null default timezone('utc', now());

alter table public.profiles
  add column if not exists household_id uuid,
  add column if not exists user_id uuid,
  add column if not exists email text,
  add column if not exists display_name text not null default 'Parent',
  add column if not exists role text not null default 'parent',
  add column if not exists household_role text not null default 'parent',
  add column if not exists created_at timestamptz not null default timezone('utc', now()),
  add column if not exists updated_at timestamptz not null default timezone('utc', now());

alter table public.children
  add column if not exists household_id uuid,
  add column if not exists profile_id uuid,
  add column if not exists parent_profile_id uuid,
  add column if not exists display_name text not null default 'Child',
  add column if not exists created_at timestamptz not null default timezone('utc', now()),
  add column if not exists updated_at timestamptz not null default timezone('utc', now());

alter table public.chores
  add column if not exists household_id uuid,
  add column if not exists parent_id uuid,
  add column if not exists parent_profile_id uuid,
  add column if not exists child_id uuid,
  add column if not exists client_id text,
  add column if not exists title text not null default 'Untitled chore',
  add column if not exists description text not null default '',
  add column if not exists amount_cents integer not null default 0,
  add column if not exists start_date date,
  add column if not exists due_date date,
  add column if not exists recurring boolean not null default false,
  add column if not exists repeat_days jsonb not null default '[]'::jsonb,
  add column if not exists repeat_pattern text not null default 'weekly',
  add column if not exists repeat_days_week_a jsonb not null default '[]'::jsonb,
  add column if not exists repeat_days_week_b jsonb not null default '[]'::jsonb,
  add column if not exists chore_kind text not null default 'one_time',
  add column if not exists reset_frequency text not null default 'daily',
  add column if not exists max_completions_per_reset integer not null default 1,
  add column if not exists manual_availability boolean not null default false,
  add column if not exists total_required_completions integer,
  add column if not exists payout_rule text not null default 'all_or_nothing',
  add column if not exists miss_behavior text not null default 'fail_period',
  add column if not exists only_when_child_present boolean not null default false,
  add column if not exists rrc_schedule jsonb,
  add column if not exists is_template boolean not null default false,
  add column if not exists template_chore_id uuid,
  add column if not exists instance_period_key text,
  add column if not exists status text not null default 'available',
  add column if not exists rejection_note text,
  add column if not exists photo_url text,
  add column if not exists submitted_at timestamptz,
  add column if not exists approved_at timestamptz,
  add column if not exists paid_at timestamptz,
  add column if not exists created_at timestamptz not null default timezone('utc', now()),
  add column if not exists updated_at timestamptz not null default timezone('utc', now());

update public.chores
set client_id = coalesce(client_id, id::text)
where client_id is null;

alter table public.chore_completions
  add column if not exists household_id uuid,
  add column if not exists chore_id uuid,
  add column if not exists child_id uuid,
  add column if not exists parent_profile_id uuid,
  add column if not exists client_id text,
  add column if not exists completion_date date not null default current_date,
  add column if not exists status text not null default 'submitted',
  add column if not exists submitted_at timestamptz,
  add column if not exists approved_at timestamptz,
  add column if not exists rejected_at timestamptz,
  add column if not exists rejection_note text,
  add column if not exists created_at timestamptz not null default timezone('utc', now()),
  add column if not exists updated_at timestamptz not null default timezone('utc', now());

update public.chore_completions
set client_id = coalesce(client_id, id::text)
where client_id is null;

alter table public.chore_photos
  add column if not exists household_id uuid,
  add column if not exists completion_id uuid,
  add column if not exists storage_path text,
  add column if not exists photo_url text,
  add column if not exists photo_label text,
  add column if not exists uploaded_at timestamptz not null default timezone('utc', now()),
  add column if not exists created_at timestamptz not null default timezone('utc', now()),
  add column if not exists updated_at timestamptz not null default timezone('utc', now());

alter table public.payments
  add column if not exists household_id uuid,
  add column if not exists parent_id uuid,
  add column if not exists child_id uuid,
  add column if not exists parent_profile_id uuid,
  add column if not exists amount_cents integer not null default 0,
  add column if not exists paid_method text not null default 'Manual Apple Cash',
  add column if not exists notes text,
  add column if not exists paid_at timestamptz not null default timezone('utc', now()),
  add column if not exists created_at timestamptz not null default timezone('utc', now()),
  add column if not exists updated_at timestamptz not null default timezone('utc', now());

alter table public.payouts
  add column if not exists household_id uuid,
  add column if not exists parent_id uuid,
  add column if not exists child_id uuid,
  add column if not exists parent_profile_id uuid,
  add column if not exists amount_cents integer not null default 0,
  add column if not exists paid_method text not null default 'Manual Apple Cash',
  add column if not exists notes text,
  add column if not exists paid_at timestamptz not null default timezone('utc', now()),
  add column if not exists created_at timestamptz not null default timezone('utc', now()),
  add column if not exists updated_at timestamptz not null default timezone('utc', now());

alter table public.chore_adjustments
  add column if not exists household_id uuid,
  add column if not exists chore_id uuid,
  add column if not exists completion_id uuid,
  add column if not exists parent_profile_id uuid,
  add column if not exists adjustment_type text not null default 'manual_status_change',
  add column if not exists missed_date date,
  add column if not exists note text,
  add column if not exists created_at timestamptz not null default timezone('utc', now()),
  add column if not exists updated_at timestamptz not null default timezone('utc', now());

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'profiles_role_check' and conrelid = 'public.profiles'::regclass) then
    alter table public.profiles
      add constraint profiles_role_check check (role in ('parent', 'child')) not valid;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'profiles_household_role_check' and conrelid = 'public.profiles'::regclass) then
    alter table public.profiles
      add constraint profiles_household_role_check check (household_role in ('owner', 'parent', 'caregiver', 'viewer')) not valid;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'chores_amount_cents_check' and conrelid = 'public.chores'::regclass) then
    alter table public.chores
      add constraint chores_amount_cents_check check (amount_cents >= 0) not valid;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'chores_status_check' and conrelid = 'public.chores'::regclass) then
    alter table public.chores
      add constraint chores_status_check check (status in ('available', 'submitted', 'approved', 'rejected', 'paid')) not valid;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'chore_completions_status_check' and conrelid = 'public.chore_completions'::regclass) then
    alter table public.chore_completions
      add constraint chore_completions_status_check check (status in ('submitted', 'approved', 'rejected', 'excused', 'completed_late', 'streak_protected')) not valid;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'chore_photos_photo_label_check' and conrelid = 'public.chore_photos'::regclass) then
    alter table public.chore_photos
      add constraint chore_photos_photo_label_check check (photo_label in ('Before', 'After', 'Extra')) not valid;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'payments_amount_cents_check' and conrelid = 'public.payments'::regclass) then
    alter table public.payments
      add constraint payments_amount_cents_check check (amount_cents >= 0) not valid;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'payouts_amount_cents_check' and conrelid = 'public.payouts'::regclass) then
    alter table public.payouts
      add constraint payouts_amount_cents_check check (amount_cents >= 0) not valid;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'chore_adjustments_adjustment_type_check' and conrelid = 'public.chore_adjustments'::regclass) then
    alter table public.chore_adjustments
      add constraint chore_adjustments_adjustment_type_check check (adjustment_type in ('excused', 'completed_late', 'streak_protected', 'manual_status_change')) not valid;
  end if;
end;
$$;

do $$
begin
  alter table public.profiles drop constraint if exists profiles_user_id_fkey;
  alter table public.profiles drop constraint if exists profiles_household_id_fkey;
  alter table public.children drop constraint if exists children_household_id_fkey;
  alter table public.children drop constraint if exists children_profile_id_fkey;
  alter table public.children drop constraint if exists children_parent_profile_id_fkey;
  alter table public.chores drop constraint if exists chores_household_id_fkey;
  alter table public.chores drop constraint if exists chores_parent_id_fkey;
  alter table public.chores drop constraint if exists chores_parent_profile_id_fkey;
  alter table public.chores drop constraint if exists chores_child_id_fkey;
  alter table public.chore_completions drop constraint if exists chore_completions_household_id_fkey;
  alter table public.chore_completions drop constraint if exists chore_completions_chore_id_fkey;
  alter table public.chore_completions drop constraint if exists chore_completions_child_id_fkey;
  alter table public.chore_completions drop constraint if exists chore_completions_parent_profile_id_fkey;
  alter table public.chore_photos drop constraint if exists chore_photos_household_id_fkey;
  alter table public.chore_photos drop constraint if exists chore_photos_completion_id_fkey;
  alter table public.payments drop constraint if exists payments_household_id_fkey;
  alter table public.payments drop constraint if exists payments_parent_id_fkey;
  alter table public.payments drop constraint if exists payments_child_id_fkey;
  alter table public.payments drop constraint if exists payments_parent_profile_id_fkey;
  alter table public.payouts drop constraint if exists payouts_household_id_fkey;
  alter table public.payouts drop constraint if exists payouts_parent_id_fkey;
  alter table public.payouts drop constraint if exists payouts_child_id_fkey;
  alter table public.payouts drop constraint if exists payouts_parent_profile_id_fkey;
  alter table public.chore_adjustments drop constraint if exists chore_adjustments_household_id_fkey;
  alter table public.chore_adjustments drop constraint if exists chore_adjustments_chore_id_fkey;
  alter table public.chore_adjustments drop constraint if exists chore_adjustments_completion_id_fkey;
  alter table public.chore_adjustments drop constraint if exists chore_adjustments_parent_profile_id_fkey;
end;
$$;

alter table public.profiles
  add constraint profiles_household_id_fkey foreign key (household_id) references public.households(id) on delete cascade not valid,
  add constraint profiles_user_id_fkey foreign key (user_id) references auth.users(id) on delete cascade not valid;

alter table public.children
  add constraint children_household_id_fkey foreign key (household_id) references public.households(id) on delete cascade not valid,
  add constraint children_profile_id_fkey foreign key (profile_id) references public.profiles(id) on delete set null not valid,
  add constraint children_parent_profile_id_fkey foreign key (parent_profile_id) references public.profiles(id) on delete set null not valid;

alter table public.chores
  add constraint chores_household_id_fkey foreign key (household_id) references public.households(id) on delete cascade not valid,
  add constraint chores_parent_id_fkey foreign key (parent_id) references auth.users(id) on delete cascade not valid,
  add constraint chores_parent_profile_id_fkey foreign key (parent_profile_id) references public.profiles(id) on delete set null not valid,
  add constraint chores_child_id_fkey foreign key (child_id) references public.children(id) on delete cascade not valid;

alter table public.chore_completions
  add constraint chore_completions_household_id_fkey foreign key (household_id) references public.households(id) on delete cascade not valid,
  add constraint chore_completions_chore_id_fkey foreign key (chore_id) references public.chores(id) on delete cascade not valid,
  add constraint chore_completions_child_id_fkey foreign key (child_id) references public.children(id) on delete cascade not valid,
  add constraint chore_completions_parent_profile_id_fkey foreign key (parent_profile_id) references public.profiles(id) on delete set null not valid;

alter table public.chore_photos
  add constraint chore_photos_household_id_fkey foreign key (household_id) references public.households(id) on delete cascade not valid,
  add constraint chore_photos_completion_id_fkey foreign key (completion_id) references public.chore_completions(id) on delete cascade not valid;

alter table public.payments
  add constraint payments_household_id_fkey foreign key (household_id) references public.households(id) on delete cascade not valid,
  add constraint payments_parent_id_fkey foreign key (parent_id) references auth.users(id) on delete cascade not valid,
  add constraint payments_child_id_fkey foreign key (child_id) references public.children(id) on delete cascade not valid,
  add constraint payments_parent_profile_id_fkey foreign key (parent_profile_id) references public.profiles(id) on delete set null not valid;

alter table public.payouts
  add constraint payouts_household_id_fkey foreign key (household_id) references public.households(id) on delete cascade not valid,
  add constraint payouts_parent_id_fkey foreign key (parent_id) references auth.users(id) on delete cascade not valid,
  add constraint payouts_child_id_fkey foreign key (child_id) references public.children(id) on delete cascade not valid,
  add constraint payouts_parent_profile_id_fkey foreign key (parent_profile_id) references public.profiles(id) on delete set null not valid;

alter table public.chore_adjustments
  add constraint chore_adjustments_household_id_fkey foreign key (household_id) references public.households(id) on delete cascade not valid,
  add constraint chore_adjustments_chore_id_fkey foreign key (chore_id) references public.chores(id) on delete cascade not valid,
  add constraint chore_adjustments_completion_id_fkey foreign key (completion_id) references public.chore_completions(id) on delete set null not valid,
  add constraint chore_adjustments_parent_profile_id_fkey foreign key (parent_profile_id) references public.profiles(id) on delete set null not valid;

create unique index if not exists profiles_user_id_idx on public.profiles(user_id);
create index if not exists profiles_household_id_idx on public.profiles(household_id);
create index if not exists children_household_id_idx on public.children(household_id);
create index if not exists chores_household_id_idx on public.chores(household_id);
create index if not exists chore_completions_household_id_idx on public.chore_completions(household_id);
create index if not exists chore_photos_household_id_idx on public.chore_photos(household_id);
create index if not exists payments_household_id_idx on public.payments(household_id);
create index if not exists payouts_household_id_idx on public.payouts(household_id);
create index if not exists chore_adjustments_household_id_idx on public.chore_adjustments(household_id);

drop trigger if exists household_app_state_set_updated_at on public.household_app_state;
create trigger household_app_state_set_updated_at
before update on public.household_app_state
for each row
execute function public.set_updated_at();

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

drop trigger if exists payouts_set_updated_at on public.payouts;
create trigger payouts_set_updated_at
before update on public.payouts
for each row
execute function public.set_updated_at();

drop trigger if exists chore_adjustments_set_updated_at on public.chore_adjustments;
create trigger chore_adjustments_set_updated_at
before update on public.chore_adjustments
for each row
execute function public.set_updated_at();

alter table public.household_app_state enable row level security;
alter table public.households enable row level security;
alter table public.profiles enable row level security;
alter table public.children enable row level security;
alter table public.chores enable row level security;
alter table public.chore_completions enable row level security;
alter table public.chore_photos enable row level security;
alter table public.payments enable row level security;
alter table public.payouts enable row level security;
alter table public.chore_adjustments enable row level security;

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

drop policy if exists "anon household read/write family" on public.household_app_state;
drop policy if exists "public household read/write family" on public.household_app_state;
create policy "public household read/write family"
on public.household_app_state
for all
to public
using (household_id = 'family-household-1')
with check (household_id = 'family-household-1');

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

drop policy if exists "payouts same household access" on public.payouts;
create policy "payouts same household access"
on public.payouts
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
