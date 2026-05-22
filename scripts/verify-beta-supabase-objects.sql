select
  expected.object_name,
  case when actual.object_name is null then 'missing' else 'present' end as status
from (
  values
    ('public.households'),
    ('public.profiles'),
    ('public.children'),
    ('public.chores'),
    ('public.chore_completions'),
    ('public.children.age'),
    ('public.children.gender'),
    ('public.children.child_access_token'),
    ('public.bootstrap_child_device'),
    ('public.sync_child_device_state'),
    ('chores_household_client_id_idx'),
    ('chore_completions_household_client_id_idx'),
    ('children_child_access_token_idx')
) as expected(object_name)
left join (
  select 'public.' || table_name as object_name
  from information_schema.tables
  where table_schema = 'public'
  union all
  select 'public.' || table_name || '.' || column_name as object_name
  from information_schema.columns
  where table_schema = 'public'
  union all
  select 'public.' || routine_name as object_name
  from information_schema.routines
  where specific_schema = 'public'
  union all
  select indexname as object_name
  from pg_indexes
  where schemaname = 'public'
) actual on actual.object_name = expected.object_name
order by expected.object_name;
