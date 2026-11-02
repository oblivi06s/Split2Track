-- Security tests for schema.sql. Run with:
--   psql -v ON_ERROR_STOP=1 -f supabase/tests/supabase_stub.sql -f supabase/schema.sql -f supabase/tests/rls_test.sql
-- Each check raises an error if it fails.

\set john '11111111-1111-1111-1111-111111111111'
\set ana  '22222222-2222-2222-2222-222222222222'
\set eve  '33333333-3333-3333-3333-333333333333'

insert into auth.users values (:'john'), (:'ana'), (:'eve') on conflict do nothing;

create or replace function pg_temp.expect(ok boolean, label text) returns void language plpgsql as $$
begin
  if not coalesce(ok, false) then raise exception 'FAILED: %', label; end if;
  raise notice 'ok - %', label;
end $$;

-- Runs SQL as the current user and returns true if it was rejected.
create or replace function pg_temp.rejected(stmt text) returns boolean language plpgsql as $$
begin
  execute stmt;
  return false;
exception when others then
  return true;
end $$;

-- ===== John sets up =====
set role authenticated;
select set_config('request.jwt.claim.sub', :'john', false);

insert into people (id, name, user_id) values ('a0000000-0000-0000-0000-00000000000a', 'John', :'john');
insert into people (id, name) values ('a0000000-0000-0000-0000-00000000000b', 'Ana (placeholder)');
insert into people (id, name) values ('a0000000-0000-0000-0000-00000000000c', 'Ben');
insert into groups (id, name, emoji, invite_code) values ('b0000000-0000-0000-0000-000000000001', 'Baguio Trip', '🏔️', 'testinvite01');
insert into group_members values
  ('b0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-00000000000a'),
  ('b0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-00000000000b'),
  ('b0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-00000000000c');
insert into expenses (id, group_id, title, amount_cents, payer_id, shares) values
  ('c0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', 'Hotel', 900,
   'a0000000-0000-0000-0000-00000000000a',
   '{"a0000000-0000-0000-0000-00000000000a":300,"a0000000-0000-0000-0000-00000000000b":300,"a0000000-0000-0000-0000-00000000000c":300}');
-- Non-group expense between John and Ben only.
insert into expenses (id, title, amount_cents, payer_id, shares) values
  ('c0000000-0000-0000-0000-000000000002', 'Movie', 400, 'a0000000-0000-0000-0000-00000000000a',
   '{"a0000000-0000-0000-0000-00000000000a":200,"a0000000-0000-0000-0000-00000000000c":200}');
-- Ana's placeholder paid John back a bit.
insert into settlements (group_id, from_id, to_id, amount_cents) values
  ('b0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-00000000000b', 'a0000000-0000-0000-0000-00000000000a', 100);

select pg_temp.expect((select count(*) from expenses) = 2, 'John sees his 2 expenses');
select pg_temp.expect(pg_temp.rejected($$insert into expenses (title, amount_cents, payer_id, shares)
  values ('Bad', 1000, 'a0000000-0000-0000-0000-00000000000a', '{"a0000000-0000-0000-0000-00000000000a":900}')$$),
  'shares that do not add up are rejected');
select pg_temp.expect(pg_temp.rejected($$insert into people (name, user_id) values ('Fake', '33333333-3333-3333-3333-333333333333')$$),
  'cannot link someone else''s account on insert');
select pg_temp.expect(pg_temp.rejected($$update people set user_id = '22222222-2222-2222-2222-222222222222' where id = 'a0000000-0000-0000-0000-00000000000b'$$),
  'cannot link someone else''s account on update');

-- ===== Eve (stranger) sees nothing =====
select set_config('request.jwt.claim.sub', :'eve', false);
insert into people (id, name, user_id) values ('a0000000-0000-0000-0000-0000000000ee', 'Eve', :'eve');
select pg_temp.expect((select count(*) from groups) = 0, 'stranger sees no groups');
select pg_temp.expect((select count(*) from expenses) = 0, 'stranger sees no expenses');
select pg_temp.expect((select count(*) from settlements) = 0, 'stranger sees no payments');
select pg_temp.expect((select count(*) from people) = 1, 'stranger sees only herself');
select pg_temp.expect((select count(*) from group_members) = 0, 'stranger sees no memberships');
update expenses set title = 'hacked' where id = 'c0000000-0000-0000-0000-000000000001';
delete from expenses;
select pg_temp.expect(pg_temp.rejected($$insert into group_members values ('b0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-0000000000ee')$$),
  'stranger cannot add herself to a group');
select pg_temp.expect(pg_temp.rejected($$insert into expenses (group_id, title, amount_cents, payer_id, shares)
  values ('b0000000-0000-0000-0000-000000000001', 'Sneaky', 100, 'a0000000-0000-0000-0000-0000000000ee', '{"a0000000-0000-0000-0000-0000000000ee":100}')$$),
  'stranger cannot add expenses to a group');
select pg_temp.expect(pg_temp.rejected($$select public.merge_person('a0000000-0000-0000-0000-00000000000b', 'a0000000-0000-0000-0000-0000000000ee')$$),
  'merge_person cannot be called directly');
select pg_temp.expect(pg_temp.rejected($$select public.join_group('wrongcode')$$), 'bad invite code is rejected');
select pg_temp.expect((select public.group_invite_preview('wrongcode')) is null, 'bad invite code shows no preview');

-- ===== Ana signs up and joins with the invite, claiming her placeholder =====
select set_config('request.jwt.claim.sub', :'ana', false);
insert into people (id, name, user_id) values ('a0000000-0000-0000-0000-0000000000aa', 'Ana', :'ana');
select pg_temp.expect((select (public.group_invite_preview('testinvite01') ->> 'name')) = 'Baguio Trip', 'invite preview shows group name');
select pg_temp.expect((select json_array_length(public.group_invite_preview('testinvite01') -> 'members')) = 3, 'invite preview lists members');
select public.join_group('testinvite01', 'a0000000-0000-0000-0000-00000000000b');

select pg_temp.expect((select count(*) from groups) = 1, 'Ana now sees the group');
select pg_temp.expect((select shares ->> 'a0000000-0000-0000-0000-0000000000aa' from expenses where id = 'c0000000-0000-0000-0000-000000000001') = '300',
  'placeholder share moved to Ana''s real account');
select pg_temp.expect((select from_id from settlements limit 1) = 'a0000000-0000-0000-0000-0000000000aa', 'placeholder payment moved to Ana');
select pg_temp.expect((select count(*) from expenses) = 1, 'Ana sees the group expense but not John and Ben''s movie');
select pg_temp.expect((select count(*) from people where id = 'a0000000-0000-0000-0000-00000000000b') = 0, 'placeholder is gone');
select pg_temp.expect((select count(*) from people) = 3, 'Ana sees the 3 group members');
-- Ana can add an expense to the group
insert into expenses (group_id, title, amount_cents, payer_id, shares) values
  ('b0000000-0000-0000-0000-000000000001', 'Lunch', 600, 'a0000000-0000-0000-0000-0000000000aa',
   '{"a0000000-0000-0000-0000-0000000000aa":300,"a0000000-0000-0000-0000-00000000000a":300}');
-- Ana cannot delete John's group, and cannot rename John
delete from groups where id = 'b0000000-0000-0000-0000-000000000001';
update people set name = 'Johnny' where id = 'a0000000-0000-0000-0000-00000000000a';
-- Joining twice is harmless
select public.join_group('testinvite01');

-- ===== Back to John =====
select set_config('request.jwt.claim.sub', :'john', false);
select pg_temp.expect((select count(*) from groups) = 1, 'member cannot delete someone else''s group');
select pg_temp.expect((select name from people where id = 'a0000000-0000-0000-0000-00000000000a') = 'John', 'member cannot rename other people');
select pg_temp.expect((select count(*) from expenses) = 3, 'John sees Ana''s new expense');
select pg_temp.expect((select title from expenses where id = 'c0000000-0000-0000-0000-000000000001') = 'Hotel', 'stranger could not edit');
select pg_temp.expect(pg_temp.rejected($$update expenses set owner_id = '33333333-3333-3333-3333-333333333333'$$) or
  (select count(*) from expenses where owner_id = '33333333-3333-3333-3333-333333333333') = 0, 'owner cannot be changed');
select pg_temp.expect((select count(*) from people where user_id is not null) = 2, 'John sees John and Ana as joined');
delete from groups where id = 'b0000000-0000-0000-0000-000000000001';
select pg_temp.expect((select count(*) from expenses) = 1, 'owner deleting group removes its expenses');

reset role;
select 'ALL RLS TESTS PASSED' as result;
