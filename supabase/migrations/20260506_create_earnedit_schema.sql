create extension if not exists "pgcrypto";

create table if not exists public.users (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  username text not null unique,
  email text unique,
  role text not null check (role in ('parent', 'child')),
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.child_profiles (
  id uuid primary key default gen_random_uuid(),
  parent_id uuid not null references public.users(id) on delete cascade,
  user_id uuid unique references public.users(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.chores (
  id uuid primary key default gen_random_uuid(),
  parent_id uuid not null references public.users(id) on delete cascade,
  child_id uuid not null references public.child_profiles(id) on delete cascade,
  title text not null,
  description text not null default '',
  amount_cents integer not null check (amount_cents >= 0),
  due_date date,
  recurring boolean not null default false,
  status text not null default 'available' check (status in ('available', 'submitted', 'approved', 'rejected', 'paid')),
  rejection_note text,
  photo_url text,
  submitted_at timestamptz,
  approved_at timestamptz,
  paid_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.payouts (
  id uuid primary key default gen_random_uuid(),
  parent_id uuid not null references public.users(id) on delete cascade,
  child_id uuid not null references public.child_profiles(id) on delete cascade,
  amount_cents integer not null check (amount_cents >= 0),
  paid_method text not null default 'Manual Apple Cash',
  paid_at timestamptz not null default timezone('utc', now()),
  notes text
);

create index if not exists chores_parent_id_idx on public.chores(parent_id);
create index if not exists chores_child_id_idx on public.chores(child_id);
create index if not exists chores_status_idx on public.chores(status);
create index if not exists payouts_child_id_idx on public.payouts(child_id);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

drop trigger if exists chores_set_updated_at on public.chores;
create trigger chores_set_updated_at
before update on public.chores
for each row
execute function public.set_updated_at();
