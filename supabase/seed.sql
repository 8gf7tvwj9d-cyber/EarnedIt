insert into public.users (id, name, username, email, role)
values
  ('11111111-1111-1111-1111-111111111111', 'Parent', 'parent', 'parent@example.com', 'parent'),
  ('22222222-2222-2222-2222-222222222222', 'Child', 'child', 'child@example.com', 'child')
on conflict (id) do nothing;

insert into public.child_profiles (id, parent_id, user_id, name)
values
  ('33333333-3333-3333-3333-333333333333', '11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222', 'Child')
on conflict (id) do nothing;
