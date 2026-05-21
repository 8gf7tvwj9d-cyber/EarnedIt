-- Beta-only child profile details for setup/account flows.

alter table public.children
  add column if not exists age integer,
  add column if not exists gender text;
