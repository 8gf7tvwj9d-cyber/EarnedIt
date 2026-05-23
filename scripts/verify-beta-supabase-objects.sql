with expected(object_name, object_type) as (
  values
    ('public.households', 'table'),
    ('public.profiles', 'table'),
    ('public.children', 'table'),
    ('public.chores', 'table'),
    ('public.chore_completions', 'table'),
    ('public.children.age', 'column'),
    ('public.children.gender', 'column'),
    ('public.children.child_access_token', 'column'),
    ('public.bootstrap_child_device', 'function'),
    ('public.sync_child_device_state', 'function'),
    ('chores_household_client_id_idx', 'index'),
    ('chore_completions_household_client_id_idx', 'index'),
    ('children_child_access_token_idx', 'index'),
    ('households same household access', 'policy'),
    ('households owner insert', 'policy'),
    ('profiles same household access', 'policy'),
    ('profiles owner insert', 'policy'),
    ('children same household access', 'policy'),
    ('chores same household access', 'policy'),
    ('chore completions same household access', 'policy'),
    ('chore photos same household access', 'policy'),
    ('payments same household access', 'policy'),
    ('payouts same household access', 'policy'),
    ('chore adjustments same household access', 'policy')
),
actual(object_name, object_type) as (
  select 'public.' || table_name, 'table'
  from information_schema.tables
  where table_schema = 'public'
  union all
  select 'public.' || table_name || '.' || column_name, 'column'
  from information_schema.columns
  where table_schema = 'public'
  union all
  select 'public.' || routine_name, 'function'
  from information_schema.routines
  where specific_schema = 'public'
  union all
  select indexname, 'index'
  from pg_indexes
  where schemaname = 'public'
  union all
  select policyname, 'policy'
  from pg_policies
  where schemaname = 'public'
)
select
  expected.object_type,
  expected.object_name,
  case when actual.object_name is null then 'missing' else 'present' end as status
from expected
left join actual
  on actual.object_name = expected.object_name
 and actual.object_type = expected.object_type
order by expected.object_type, expected.object_name;

select
  'chores_status_check_allows_expired' as object_name,
  case
    when exists (
      select 1
      from pg_constraint
      where conrelid = 'public.chores'::regclass
        and conname = 'chores_status_check'
        and pg_get_constraintdef(oid) like '%expired%'
    )
    then 'present'
    else 'missing'
  end as status;
