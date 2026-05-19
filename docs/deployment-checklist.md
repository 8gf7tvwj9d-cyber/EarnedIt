# EarnedIt Deployment Checklist (Vercel)

## Local Pre-Deploy Commands

Run from `C:\Users\blief\Desktop\EarnedIt`:

```bash
npm install
npm run lint
npm run build
```

Expected current status:

- `npm install`: up to date
- `npm run lint`: passes with 1 warning (unused eslint-disable in `src/components/parent/parent-dashboard.tsx`)
- `npm run build`: passes

## Vercel Setup Steps

1. Push the latest branch to GitHub.
2. In Vercel, click **Add New... -> Project** and import the GitHub repo.
3. Leave **Root Directory** blank when deploying this repo directly.
4. Framework preset should auto-detect as **Next.js**.
5. Build command: `npm run build`.
6. Install command: `npm install`.
7. Output directory: leave default (no custom output directory needed for this app).
8. Deploy.

## Environment Variable Status

Current active app path can run without custom environment variables (local fallback), but shared cross-device testing requires Supabase env vars.

Notes:

- Shared sync env vars:
  - `NEXT_PUBLIC_SUPABASE_URL`
  - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- Optional shared household override:
  - `NEXT_PUBLIC_DEMO_HOUSEHOLD_ID` (defaults to `family-household-1`)

## Storage Limitation (Current)

Current persistence mode:

- With Supabase env vars configured: shared household state via Supabase.
- Without Supabase env vars: browser-side local storage fallback.

## Post-Deploy Test Checklist

1. Open production URL and confirm the home page loads without runtime errors.
2. Verify static assets load:
   - `/static/manifest.json`
   - `/static/icons/apple-touch-icon.png`
   - `/static/icons/icon-192.png`
   - `/static/icons/icon-512.png`
   - `/static/icons/favicon.ico`
3. Run a child flow:
   - add/check-in chore evidence
   - submit chore
   - confirm status transitions render correctly
4. Run a parent flow:
   - review submission
   - approve/reject
   - mark payout paid
5. Refresh browser and confirm local state is preserved on the same device/profile.
6. Check Vercel function/runtime logs for unexpected errors after first use.

