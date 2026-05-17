# Earned

Earned is a mobile-first MVP web app for tracking parent-approved chores and manual payouts.

It does not move real money. Parents pay outside the app with something like Apple Cash, then log that payout inside Earned.

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

The app starts with neutral parent and child roles stored in `localStorage`.

## Starter roles

- Parent: `Parent`
- Child: `Child`

Use the role buttons on the home screen or in the header to switch views.

## Environment variables

Copy `.env.example` to `.env.local` when you are ready to connect Supabase:

```bash
cp .env.example .env.local
```

Set:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`

Right now the UI detects those variables and marks the project as Supabase-connected while still supporting local-only use without external services.

## Database files

- Migration: [supabase/migrations/20260506_create_chorepay_schema.sql](/C:/Users/blief/Desktop/chore%20app/chorepay/supabase/migrations/20260506_create_chorepay_schema.sql)
- Seed data: [supabase/seed.sql](/C:/Users/blief/Desktop/chore%20app/chorepay/supabase/seed.sql)

Core tables:

- `users`
- `child_profiles`
- `chores`
- `payouts`

## Current MVP behavior

- Parent controls all money amounts
- Child can submit chores and optional proof photos
- Child cannot approve chores or edit payouts
- Payouts create history and change approved chores to paid
- Demo photo uploads are stored as local data URLs in the browser

## Suggested next steps

1. Replace demo sign-in with Supabase Auth for parent and child accounts
2. Persist chores and payouts to Supabase instead of `localStorage`
3. Upload proof photos to a Supabase Storage bucket
4. Add row-level security policies per parent and child
5. Add support for multiple children under one parent account
