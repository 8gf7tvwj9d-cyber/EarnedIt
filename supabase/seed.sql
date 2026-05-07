insert into public.users (id, name, username, email, role)
values
  ('11111111-1111-1111-1111-111111111111', 'Morgan', 'morgan-parent', 'parent@example.com', 'parent'),
  ('22222222-2222-2222-2222-222222222222', 'Avery', 'avery-child', 'child@example.com', 'child')
on conflict (id) do nothing;

insert into public.child_profiles (id, parent_id, user_id, name)
values
  ('33333333-3333-3333-3333-333333333333', '11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222', 'Avery')
on conflict (id) do nothing;

insert into public.chores (
  id,
  parent_id,
  child_id,
  title,
  description,
  amount_cents,
  due_date,
  recurring,
  status
)
values
  ('44444444-4444-4444-4444-444444444441', '11111111-1111-1111-1111-111111111111', '33333333-3333-3333-3333-333333333333', 'Feed the dog', 'Fill the bowl and check the water before school.', 300, current_date + interval '1 day', true, 'available'),
  ('44444444-4444-4444-4444-444444444442', '11111111-1111-1111-1111-111111111111', '33333333-3333-3333-3333-333333333333', 'Help unload groceries', 'Carry pantry items inside and place them on the counter.', 400, null, false, 'approved')
on conflict (id) do nothing;

insert into public.payouts (
  id,
  parent_id,
  child_id,
  amount_cents,
  paid_method,
  notes
)
values
  ('55555555-5555-5555-5555-555555555555', '11111111-1111-1111-1111-111111111111', '33333333-3333-3333-3333-333333333333', 350, 'Manual Apple Cash', 'Paid after dinner.')
on conflict (id) do nothing;
