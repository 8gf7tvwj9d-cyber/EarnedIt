# Supabase Shared Testing Setup

This app now supports shared parent/child testing through Supabase with local fallback.

## Required Environment Variables

Set these in `.env.local` for local dev and in Vercel Project Settings for deployment:

```bash
NEXT_PUBLIC_SUPABASE_URL=your_supabase_project_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
```

Optional:

```bash
NEXT_PUBLIC_DEMO_HOUSEHOLD_ID=family-household-1
```

If `NEXT_PUBLIC_DEMO_HOUSEHOLD_ID` is omitted, the app uses `family-household-1`.

## Required Supabase Schema

Run this in Supabase SQL Editor:

```sql
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
```

Notes:

- This policy is intentionally minimal for shared family testing.
- For production, replace with real auth + per-family access controls.

## Runtime Behavior

- When Supabase env vars are present and table access works, app state is shared through `household_app_state`.
- Session/role selection (`parent` vs `child`) stays local per device so one device does not force the other device's role.
- If Supabase is unavailable or env vars are missing, app falls back to localStorage only.

## Shared Testing Flow (Two Devices)

1. Open app on Device A and Device B using the same deployed URL.
2. On Device A, choose **Parent view** and create/update chores.
3. On Device B, choose **Child view** and verify chores appear.
4. On Device B, submit check-ins/proof and submit chores.
5. On Device A, wait up to ~5 seconds or refresh, then approve/reject.
6. Confirm state changes propagate both ways (chores, check-ins, payouts, tree/progress).

## Troubleshooting

- If you see local-only behavior:
  - verify env vars are set correctly
  - verify table/policy SQL was run
  - check browser console for Supabase errors
- If no shared row exists yet:
  - first successful app load seeds `household_app_state` for the configured household id.
