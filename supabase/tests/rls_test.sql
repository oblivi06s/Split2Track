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

-- ===== The app saves with upsert (insert ... on conflict do update) =====
set role authenticated;
select set_config('request.jwt.claim.sub', :'eve', false);
insert into people (id, name, created_at, user_id) values ('a0000000-0000-0000-0000-0000000000e1', 'Upsert Eve', now(), :'eve')
  on conflict (id) do update set name = excluded.name, created_at = excluded.created_at, user_id = excluded.user_id;
insert into people (id, name, created_at) values ('a0000000-0000-0000-0000-0000000000e2', 'Upsert Friend', now())
  on conflict (id) do update set name = excluded.name;
insert into groups (id, name, emoji, created_at) values ('b0000000-0000-0000-0000-0000000000e1', 'Upsert Group', '✈️', now())
  on conflict (id) do update set name = excluded.name;
insert into group_members values ('b0000000-0000-0000-0000-0000000000e1', 'a0000000-0000-0000-0000-0000000000e1'),
  ('b0000000-0000-0000-0000-0000000000e1', 'a0000000-0000-0000-0000-0000000000e2') on conflict do nothing;
insert into expenses (id, group_id, title, amount_cents, payer_id, shares, created_at)
  values ('c0000000-0000-0000-0000-0000000000e1', 'b0000000-0000-0000-0000-0000000000e1', 'Upsert expense', 200,
          'a0000000-0000-0000-0000-0000000000e1', '{"a0000000-0000-0000-0000-0000000000e1":100,"a0000000-0000-0000-0000-0000000000e2":100}', now())
  on conflict (id) do update set title = excluded.title;
insert into settlements (id, group_id, from_id, to_id, amount_cents, created_at)
  values ('d0000000-0000-0000-0000-0000000000e1', 'b0000000-0000-0000-0000-0000000000e1', 'a0000000-0000-0000-0000-0000000000e2', 'a0000000-0000-0000-0000-0000000000e1', 50, now())
  on conflict (id) do update set amount_cents = excluded.amount_cents;
-- Second upsert of the same rows = an update
insert into people (id, name, created_at, user_id) values ('a0000000-0000-0000-0000-0000000000e1', 'Eve Renamed', now(), :'eve')
  on conflict (id) do update set name = excluded.name;
select pg_temp.expect((select name from people where id = 'a0000000-0000-0000-0000-0000000000e1') = 'Eve Renamed', 'app-style upserts work for every table');
-- Clean up so the rest of the test starts fresh
delete from groups where id = 'b0000000-0000-0000-0000-0000000000e1';
delete from people where id = 'a0000000-0000-0000-0000-0000000000e2';
reset role;
delete from people where id = 'a0000000-0000-0000-0000-0000000000e1';

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

-- ===== Email invites =====
reset role;
insert into auth.users values
  ('44444444-4444-4444-4444-444444444444', 'Ben@Example.com', now()),       -- confirmed, no profile yet
  ('55555555-5555-5555-5555-555555555555', 'cara@example.com', null),       -- email NOT confirmed
  ('66666666-6666-6666-6666-666666666666', 'dan@example.com', now());       -- confirmed, has a profile
set role authenticated;

select set_config('request.jwt.claim.sub', '66666666-6666-6666-6666-666666666666', false);
insert into people (id, name, user_id) values ('a0000000-0000-0000-0000-0000000000d1', 'Dan', '66666666-6666-6666-6666-666666666666');

select set_config('request.jwt.claim.sub', :'john', false);
insert into people (id, name, email) values
  ('a0000000-0000-0000-0000-0000000000b1', 'Benjie', '  BEN@example.COM '),
  ('a0000000-0000-0000-0000-0000000000c1', 'Cara', 'cara@example.com'),
  ('a0000000-0000-0000-0000-0000000000d2', 'Dan placeholder', 'dan@example.com')
  on conflict (id) do update set name = excluded.name, email = excluded.email;
select pg_temp.expect((select email from people where id = 'a0000000-0000-0000-0000-0000000000b1') = 'ben@example.com', 'emails are stored lowercase');
select pg_temp.expect(pg_temp.rejected($$insert into people (name, email) values ('Bad', 'not-an-email')$$), 'invalid emails are rejected');
insert into groups (id, name, invite_code) values ('b0000000-0000-0000-0000-000000000002', 'Beach', 'testinvite02');
insert into group_members values
  ('b0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-00000000000a'),
  ('b0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-0000000000b1'),
  ('b0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-0000000000c1'),
  ('b0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-0000000000d2');
insert into expenses (group_id, title, amount_cents, payer_id, shares) values
  ('b0000000-0000-0000-0000-000000000002', 'Boat', 900, 'a0000000-0000-0000-0000-00000000000a',
   '{"a0000000-0000-0000-0000-00000000000a":300,"a0000000-0000-0000-0000-0000000000b1":300,"a0000000-0000-0000-0000-0000000000d2":300}');

-- Ben signs up (no profile yet): the placeholder becomes his profile.
select set_config('request.jwt.claim.sub', '44444444-4444-4444-4444-444444444444', false);
select pg_temp.expect((select count(*) from groups) = 0, 'before claiming, Ben sees no groups');
select pg_temp.expect((select public.claim_email_invites()) = 1, 'Ben claims 1 email invite');
select pg_temp.expect((select public.my_person_id()) = 'a0000000-0000-0000-0000-0000000000b1', 'placeholder became Ben''s profile');
select pg_temp.expect((select count(*) from groups where name = 'Beach') = 1, 'Ben now sees the Beach group');
select pg_temp.expect((select count(*) from expenses) = 1, 'Ben sees the group expense');
select pg_temp.expect((select public.claim_email_invites()) = 0, 'claiming again does nothing');
update people set name = 'Ben' where id = 'a0000000-0000-0000-0000-0000000000b1';

-- Cara never confirmed her email: she can't claim.
select set_config('request.jwt.claim.sub', '55555555-5555-5555-5555-555555555555', false);
select pg_temp.expect((select public.claim_email_invites()) = 0, 'unconfirmed email cannot claim invites');
select pg_temp.expect((select count(*) from groups) = 0, 'unconfirmed user sees no groups');

-- Dan already has a profile: the placeholder is merged into it.
select set_config('request.jwt.claim.sub', '66666666-6666-6666-6666-666666666666', false);
select pg_temp.expect((select public.claim_email_invites()) = 1, 'Dan claims his invite');
select pg_temp.expect((select shares ->> 'a0000000-0000-0000-0000-0000000000d1' from expenses) = '300', 'Dan''s share moved to his existing profile');
select pg_temp.expect((select count(*) from people where id = 'a0000000-0000-0000-0000-0000000000d2') = 0, 'Dan''s placeholder is gone');

-- John's phone still has Dan's old placeholder and sends changes with it.
select set_config('request.jwt.claim.sub', :'john', false);
insert into expenses (id, group_id, title, amount_cents, payer_id, shares) values
  ('c0000000-0000-0000-0000-0000000000f1', 'b0000000-0000-0000-0000-000000000002', 'Late expense', 600,
   'a0000000-0000-0000-0000-0000000000d2',
   '{"a0000000-0000-0000-0000-00000000000a":300,"a0000000-0000-0000-0000-0000000000d2":300}')
  on conflict (id) do update set title = excluded.title;
select pg_temp.expect((select payer_id from expenses where id = 'c0000000-0000-0000-0000-0000000000f1') = 'a0000000-0000-0000-0000-0000000000d1',
  'late expense: old placeholder payer points to Dan');
select pg_temp.expect((select shares ? 'a0000000-0000-0000-0000-0000000000d1' and not shares ? 'a0000000-0000-0000-0000-0000000000d2'
  from expenses where id = 'c0000000-0000-0000-0000-0000000000f1'), 'late expense: old placeholder share points to Dan');
insert into settlements (group_id, from_id, to_id, amount_cents) values
  ('b0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-0000000000d2', 'a0000000-0000-0000-0000-00000000000a', 100);
select pg_temp.expect((select count(*) from settlements where from_id = 'a0000000-0000-0000-0000-0000000000d1') = 1, 'late payment points to Dan');
insert into groups (id, name) values ('b0000000-0000-0000-0000-000000000003', 'Second group');
insert into group_members values ('b0000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-00000000000a'),
  ('b0000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-0000000000d2') on conflict do nothing;
select pg_temp.expect((select count(*) from group_members where group_id = 'b0000000-0000-0000-0000-000000000003' and person_id = 'a0000000-0000-0000-0000-0000000000d1') = 1,
  'adding the old placeholder to a group adds Dan');
insert into people (id, name, email) values ('a0000000-0000-0000-0000-0000000000d2', 'Dan placeholder', 'dan@example.com')
  on conflict (id) do update set name = excluded.name;
select pg_temp.expect((select count(*) from people where id = 'a0000000-0000-0000-0000-0000000000d2') = 0, 'merged placeholder does not come back');
select pg_temp.expect(pg_temp.rejected($$select * from person_aliases$$), 'merge history is not readable from the app');

-- John added Ben, but can no longer rename or delete him now that Ben joined.
select set_config('request.jwt.claim.sub', :'john', false);
select pg_temp.expect((select name from people where id = 'a0000000-0000-0000-0000-0000000000b1') = 'Ben', 'John sees Ben''s own name');
select pg_temp.expect(pg_temp.rejected($$update people set name = 'Benjamin' where id = 'a0000000-0000-0000-0000-0000000000b1'$$), 'adder cannot rename a joined friend');
delete from people where id = 'a0000000-0000-0000-0000-0000000000b1';
select pg_temp.expect((select count(*) from people where id = 'a0000000-0000-0000-0000-0000000000b1') = 1, 'adder cannot delete a joined friend');
update people set email = 'cara2@example.com' where id = 'a0000000-0000-0000-0000-0000000000c1';
select pg_temp.expect((select email from people where id = 'a0000000-0000-0000-0000-0000000000c1') = 'cara2@example.com', 'adder can fix a pending friend''s email');

reset role;
select 'ALL RLS TESTS PASSED' as result;
