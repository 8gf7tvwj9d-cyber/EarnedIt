# EarnedIt

EarnedIt is a mobile-first MVP web app for tracking parent-approved chores and manual payouts.

It does not move real money. Parents pay outside the app with something like Apple Cash, then log that payout inside EarnedIt.

## What this MVP includes

- Parent dashboard to create, edit, delete, approve, reject, and pay chores
- Child dashboard to view chores, upload optional photo proof, and submit work
- Status-driven ledger with `available`, `submitted`, `approved`, `rejected`, and `paid`
- Pending approval, approved unpaid, and paid-history summaries
- Local starter mode so the app runs immediately without backend setup
- Supabase-ready schema, seed data, and environment variable template

## Tech

- Next.js App Router
- React
- TypeScript
- Tailwind CSS
- Supabase client package for future auth, database, and storage wiring

## Local setup

1. Install dependencies:

```bash
npm install
```

2. Start the development server:

```bash
npm run dev
```

3. Open [http://localhost:3000](http://localhost:3000)

`npm run dev` binds Next to `127.0.0.1` for normal local browser testing. Do not pass `--host`; this Next version uses `--hostname`.

## Local-only beta testing

For quick local-only testing, `.env.local` can use:

```env
NEXT_PUBLIC_EARNEDIT_AUTH_TEST_MODE=true
NEXT_PUBLIC_EARNEDIT_CHILD_LINK_BASE_URL=
```

In local beta auth mode, parent signup creates a browser-local beta account and stores household/profile/chore data in `localStorage`. This is useful when Supabase email confirmation or rate limits block quick iteration. It is not suitable for phone QR testing because another device cannot read this browser's local storage.

## LAN testing from a phone or tablet

Use the LAN dev script when another device needs to open the app from your computer:

```bash
npm run dev:lan
```

This binds Next to `0.0.0.0`. Then open the app from your phone/tablet using your computer's LAN IP, for example:

```text
http://192.168.1.25:3000
```

Windows may ask for firewall permission the first time. Allow access on your private network.

For child QR links on a phone/tablet, set the public child link base URL to the same reachable LAN URL:

```env
NEXT_PUBLIC_EARNEDIT_CHILD_LINK_BASE_URL=http://192.168.1.25:3000
```

Restart the dev server after changing `.env.local`.

## Child QR testing

Cross-device child QR linking requires Supabase mode because the child device has to load the household and child profile from shared backend data.

Use this shape for LAN QR testing:

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
NEXT_PUBLIC_EARNEDIT_AUTH_TEST_MODE=false
NEXT_PUBLIC_EARNEDIT_APP_BASE_URL=http://192.168.1.25:3000
NEXT_PUBLIC_EARNEDIT_CHILD_LINK_BASE_URL=http://192.168.1.25:3000
```

Use this shape for deployed QR testing:

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
NEXT_PUBLIC_EARNEDIT_AUTH_TEST_MODE=false
NEXT_PUBLIC_EARNEDIT_APP_BASE_URL=https://your-deployed-earnedit-url
NEXT_PUBLIC_EARNEDIT_CHILD_LINK_BASE_URL=https://your-deployed-earnedit-url
```

The app intentionally does not generate phone-facing QR links to `localhost` or `127.0.0.1`. QR links are generated as:

```text
{NEXT_PUBLIC_EARNEDIT_CHILD_LINK_BASE_URL}/child-link?token=...
```

The token grants child-only access for one child profile. Regenerating the QR from the parent Account screen revokes the previous token.

## Environment variables

Copy `.env.example` to `.env.local` when you are ready to connect Supabase:

```bash
cp .env.example .env.local
```

Set:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` for server-only admin tasks such as beta household provisioning or back-office repair scripts
- `NEXT_PUBLIC_EARNEDIT_AUTH_TEST_MODE=false` by default. This is an emergency local fallback only. Set to `true` only in a non-production build when Supabase email confirmation or rate limits block parent signup while you are debugging. In that mode the parent signup flow creates a local test household and skips Supabase signup; production builds ignore the bypass.
- `NEXT_PUBLIC_EARNEDIT_APP_BASE_URL` for Supabase email confirmation redirects. Use the reachable app URL, such as `http://192.168.1.25:3000` during LAN testing or the deployed app URL in hosted testing.
- `NEXT_PUBLIC_EARNEDIT_CHILD_LINK_BASE_URL` for child QR links. Use a LAN URL such as `http://192.168.1.25:3000` for phone testing against `npm run dev:lan`, or use a deployed app URL for hosted testing.

When Supabase env vars are present, beta uses real Supabase Auth and database sync. If Supabase is configured but migrations, RLS, or auth settings are broken, the app should show the Supabase error instead of silently falling back to local data.

For Supabase email confirmation, also add the same app base URL to the Supabase Auth redirect URL allow-list. During LAN testing, that means adding a URL like `http://192.168.1.25:3000` in the Supabase dashboard so confirmation links can return to the dev server.

## Beta Supabase setup checklist

Use this for `beta-multi-user` in-house testing:

1. Create or open the beta Supabase project.
2. Add `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` to `.env.local`.
3. In Supabase SQL Editor, run the beta migrations in this order:
   - `supabase/migrations/20260519_beta_multi_household_foundation.sql`
   - `supabase/migrations/20260520_beta_chore_sync_bridge.sql`
   - `supabase/migrations/20260520_beta_child_login_code.sql`
   - `supabase/migrations/20260520_beta_child_profile_details.sql`
4. Run the verification queries below.
5. Check Supabase Table Editor for `households`, `profiles`, `children`, `chores`, `chore_completions`, `chore_photos`, `payments`, `payouts`, `chore_adjustments`, and `household_app_state`.
6. Start the app with `npm run dev` and create a parent account.

Do not run the old single-household schema on a fresh beta project unless you are explicitly testing the legacy upgrade path.

Supabase Auth settings:

- Email confirmation ON: signup can create the auth user but return no active session. The app will show `Account created. Please confirm your email, then log in.`
- Email confirmation OFF: signup should return an active session and continue into household bootstrap immediately. This is usually smoother for internal same-day device testing.
- Email rate limit exceeded: the app does not retry signup automatically. Wait for the email window to reset, turn confirmation off for internal testing, or manually confirm the user in Supabase Auth.
- Manual confirmation: Supabase Dashboard -> Authentication -> Users -> open the user -> confirm email.
- Redirect URLs: add the local app URL such as `http://localhost:3000` and any beta preview URL to Supabase Auth URL configuration before testing email links.

## Database files

- Migration: [supabase/migrations/20260506_create_earnedit_schema.sql](supabase/migrations/20260506_create_earnedit_schema.sql)
- Beta foundation migration: [supabase/migrations/20260519_beta_multi_household_foundation.sql](supabase/migrations/20260519_beta_multi_household_foundation.sql)
- Beta chore sync bridge: [supabase/migrations/20260520_beta_chore_sync_bridge.sql](supabase/migrations/20260520_beta_chore_sync_bridge.sql)
- Beta child QR/device link support: [supabase/migrations/20260520_beta_child_login_code.sql](supabase/migrations/20260520_beta_child_login_code.sql)
- Beta child profile details: [supabase/migrations/20260520_beta_child_profile_details.sql](supabase/migrations/20260520_beta_child_profile_details.sql)
- Seed data: [supabase/seed.sql](supabase/seed.sql)

Core tables:

- `users`
- `child_profiles`
- `chores`
- `payouts`

## Beta migration verification

For a clean beta Supabase project, apply migrations in filename order. The beta table order is:

1. `20260519_beta_multi_household_foundation.sql`
2. `20260520_beta_chore_sync_bridge.sql`
3. `20260520_beta_child_login_code.sql`
4. `20260520_beta_child_profile_details.sql`

Foundation dependency graph:

- Extensions: `pgcrypto`
- Independent functions: `public.set_updated_at()`
- Table shells: `household_app_state`, `households`, `profiles`, `children`, `chores`, `chore_completions`, `chore_photos`, `payments`, `payouts`, `chore_adjustments`
- Upgrade logic: guarded column normalization for fresh, partial beta, and legacy MVP installs
- Foreign keys: added after every referenced table exists, using `not valid` so legacy rows do not block setup
- Indexes: household lookup indexes plus `profiles_user_id_idx`
- Triggers: `*_set_updated_at`
- RLS: enabled after all tables exist
- Policy helper: `public.current_user_household_ids()`
- Policies: household-scoped access policies plus legacy `household_app_state` local policy

Expected Supabase tables after foundation:

- `household_app_state`
- `households`
- `profiles`
- `children`
- `chores`
- `chore_completions`
- `chore_photos`
- `payments`
- `payouts`
- `chore_adjustments`

Validation query:

```sql
select table_name
from information_schema.tables
where table_schema = 'public'
and table_name in (
  'households',
  'profiles',
  'children',
  'chores',
  'chore_completions',
  'chore_photos',
  'payments',
  'payouts',
  'chore_adjustments',
  'household_app_state'
)
order by table_name;
```

Status query:

```sql
select
  expected.table_name,
  case when actual.table_name is null then 'missing' else 'present' end as status
from (
  values
    ('households'),
    ('profiles'),
    ('children'),
    ('chores'),
    ('chore_completions'),
    ('chore_photos'),
    ('payments'),
    ('payouts'),
    ('chore_adjustments'),
    ('household_app_state')
) as expected(table_name)
left join information_schema.tables actual
  on actual.table_schema = 'public'
 and actual.table_name = expected.table_name
order by expected.table_name;
```

Critical sync columns:

```sql
select
  table_name,
  column_name,
  data_type,
  is_nullable
from information_schema.columns
where table_schema = 'public'
and table_name in (
  'households',
  'profiles',
  'children',
  'chores',
  'chore_completions',
  'chore_photos',
  'payments',
  'payouts',
  'chore_adjustments',
  'household_app_state'
)
and column_name in (
  'household_id',
  'child_id',
  'client_id',
  'created_at',
  'updated_at'
)
order by table_name, column_name;
```

If any row returns `missing`, stop and fix the foundation migration before testing parent signup.

## Current MVP behavior

- Parent controls all money amounts
- Child can submit chores and optional proof photos
- Child cannot approve chores or edit payouts
- Payouts create history and change approved chores to paid
- Demo photo uploads are stored as local data URLs in the browser

## Branch and deployment workflow

Use separate branches so the working household app stays protected while larger beta work happens elsewhere.

- `home-stable`: safe home-use version for the current household app. Keep this branch deployable and use it for small fixes that should go live at home.
- `beta-multi-user`: experimental beta branch for Supabase Auth, database persistence, multi-household support, and other larger changes. Do not point the live household app at this branch.
- `main`: integration branch for proven merged changes only.
- Risk note: risky multi-household or auth/database work belongs on `beta-multi-user`, not `home-stable`.

Recommended flow:

1. Use `home-stable` for household fixes that need to stay reliable.
2. Use `beta-multi-user` for risky or larger multi-user development.
3. Merge beta work back only after it has been tested and is ready for normal use.

Recommended Vercel setup:

- Point the live home app's production deployment at `home-stable`.
- Deploy `beta-multi-user` as a separate preview deployment or as a separate Vercel project/domain.
- Keep beta environment variables separate from home-stable values, especially any future Supabase project URLs, anon keys, storage buckets, and household IDs.
## Suggested next steps

1. Replace demo sign-in with Supabase Auth for parent and child accounts
2. Persist chores and payouts to Supabase instead of `localStorage`
3. Upload proof photos to a Supabase Storage bucket
4. Add row-level security policies per parent and child
5. Add support for multiple children under one parent account



