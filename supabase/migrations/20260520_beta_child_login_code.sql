-- Beta-only child device-link support. Keep this on beta-multi-user.

alter table public.children
  add column if not exists child_access_token text;

create unique index if not exists children_child_access_token_idx
on public.children(child_access_token)
where child_access_token is not null;

create or replace function public.bootstrap_child_device(access_token text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  child_record public.children%rowtype;
  household_record jsonb;
  parent_profile_record jsonb;
begin
  if access_token is null or length(trim(access_token)) < 24 then
    return null;
  end if;

  select *
  into child_record
  from public.children
  where child_access_token = access_token
  limit 1;

  if child_record.id is null then
    return null;
  end if;

  select to_jsonb(h.*)
  into household_record
  from public.households h
  where h.id = child_record.household_id;

  select to_jsonb(p.*)
  into parent_profile_record
  from public.profiles p
  where p.id = child_record.parent_profile_id
  limit 1;

  return jsonb_build_object(
    'household', household_record,
    'parentProfile', parent_profile_record,
    'child', to_jsonb(child_record),
    'chores', coalesce((
      select jsonb_agg(to_jsonb(c.*) order by c.created_at desc)
      from public.chores c
      where c.household_id = child_record.household_id
        and c.child_id = child_record.id
    ), '[]'::jsonb),
    'completions', coalesce((
      select jsonb_agg(to_jsonb(cc.*) order by cc.created_at desc)
      from public.chore_completions cc
      where cc.household_id = child_record.household_id
        and cc.child_id = child_record.id
    ), '[]'::jsonb)
  );
end;
$$;

grant execute on function public.bootstrap_child_device(text) to anon, authenticated;

create or replace function public.sync_child_device_state(
  access_token text,
  chore_rows jsonb default '[]'::jsonb,
  completion_rows jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  child_record public.children%rowtype;
  chore_entry jsonb;
  completion_entry jsonb;
  remote_chore_id uuid;
begin
  if access_token is null or length(trim(access_token)) < 24 then
    return null;
  end if;

  select *
  into child_record
  from public.children
  where child_access_token = access_token
  limit 1;

  if child_record.id is null then
    return null;
  end if;

  for chore_entry in select * from jsonb_array_elements(coalesce(chore_rows, '[]'::jsonb))
  loop
    update public.chores
    set
      status = coalesce(chore_entry->>'status', status),
      rejection_note = nullif(chore_entry->>'rejection_note', ''),
      submitted_at = nullif(chore_entry->>'submitted_at', '')::timestamptz,
      updated_at = timezone('utc', now())
    where household_id = child_record.household_id
      and child_id = child_record.id
      and client_id = chore_entry->>'client_id'
      and coalesce(chore_entry->>'status', status) in ('available', 'submitted', 'rejected', 'expired');
  end loop;

  for completion_entry in select * from jsonb_array_elements(coalesce(completion_rows, '[]'::jsonb))
  loop
    select id
    into remote_chore_id
    from public.chores
    where household_id = child_record.household_id
      and child_id = child_record.id
      and client_id = completion_entry->>'chore_client_id'
    limit 1;

    if remote_chore_id is not null then
      insert into public.chore_completions (
        household_id,
        client_id,
        chore_id,
        child_id,
        parent_profile_id,
        completion_date,
        status,
        submitted_at,
        created_at,
        updated_at
      )
      values (
        child_record.household_id,
        completion_entry->>'client_id',
        remote_chore_id,
        child_record.id,
        child_record.parent_profile_id,
        nullif(completion_entry->>'completion_date', '')::date,
        coalesce(completion_entry->>'status', 'submitted'),
        nullif(completion_entry->>'submitted_at', '')::timestamptz,
        timezone('utc', now()),
        timezone('utc', now())
      )
      on conflict (household_id, client_id)
      do update set
        status = excluded.status,
        submitted_at = excluded.submitted_at,
        updated_at = timezone('utc', now());
    end if;
  end loop;

  return public.bootstrap_child_device(access_token);
end;
$$;

grant execute on function public.sync_child_device_state(text, jsonb, jsonb) to anon, authenticated;
