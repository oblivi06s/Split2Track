-- =====================================================================
-- Split2Track database setup for Supabase
--
-- How to use: Supabase dashboard -> SQL Editor -> New query ->
-- paste this whole file -> Run. It is safe to run again later.
-- =====================================================================

-- ---------- Tables ----------

-- A person: you, a friend with an account, or a friend without one yet.
create table if not exists public.people (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (char_length(name) between 1 and 80),
  user_id     uuid unique references auth.users (id) on delete set null, -- linked account (null = not joined yet)
  owner_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at  timestamptz not null default now()
);

create table if not exists public.groups (
  id           uuid primary key default gen_random_uuid(),
  name         text not null check (char_length(name) between 1 and 80),
  emoji        text not null default '✈️' check (char_length(emoji) <= 16),
  invite_code  text not null unique default substr(md5(gen_random_uuid()::text), 1, 12),
  owner_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at   timestamptz not null default now()
);

create table if not exists public.group_members (
  group_id   uuid not null references public.groups (id) on delete cascade,
  person_id  uuid not null references public.people (id) on delete cascade,
  primary key (group_id, person_id)
);

create table if not exists public.expenses (
  id            uuid primary key default gen_random_uuid(),
  group_id      uuid references public.groups (id) on delete cascade, -- null = between friends, no group
  title         text not null check (char_length(title) between 1 and 120),
  amount_cents  bigint not null check (amount_cents > 0),
  category_id   text not null default 'other' check (char_length(category_id) <= 40),
  split_method  text not null default 'equal' check (split_method in ('equal', 'exact', 'percent')),
  date          date not null default current_date,
  note          text not null default '' check (char_length(note) <= 500),
  payer_id      uuid not null references public.people (id),
  shares        jsonb not null default '{}'::jsonb check (jsonb_typeof(shares) = 'object'),
  owner_id      uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create table if not exists public.settlements (
  id            uuid primary key default gen_random_uuid(),
  group_id      uuid references public.groups (id) on delete cascade,
  from_id       uuid not null references public.people (id),
  to_id         uuid not null references public.people (id),
  amount_cents  bigint not null check (amount_cents > 0),
  date          date not null default current_date,
  note          text not null default '' check (char_length(note) <= 300),
  owner_id      uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at    timestamptz not null default now(),
  check (from_id <> to_id)
);

create index if not exists group_members_person_idx on public.group_members (person_id);
create index if not exists expenses_group_idx on public.expenses (group_id);
create index if not exists expenses_payer_idx on public.expenses (payer_id);
create index if not exists expenses_shares_idx on public.expenses using gin (shares);
create index if not exists settlements_group_idx on public.settlements (group_id);
create index if not exists people_owner_idx on public.people (owner_id);

-- ---------- Helper functions (used by the security rules) ----------
-- "security definer" lets these look up memberships without the rules
-- calling themselves in a loop.

create or replace function public.my_person_id()
returns uuid language sql stable security definer set search_path = public as $$
  select id from people where user_id = auth.uid()
$$;

create or replace function public.my_group_ids()
returns setof uuid language sql stable security definer set search_path = public as $$
  select id from groups where owner_id = auth.uid()
  union
  select gm.group_id
  from group_members gm
  join people p on p.id = gm.person_id
  where p.user_id = auth.uid()
$$;

create or replace function public.is_group_member(gid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select gid in (select public.my_group_ids())
$$;

create or replace function public.can_see_person(pid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
           select 1 from people p
           where p.id = pid and (p.owner_id = auth.uid() or p.user_id = auth.uid()))
      or exists (
           select 1 from group_members gm
           where gm.person_id = pid and gm.group_id in (select public.my_group_ids()))
$$;

-- ---------- Data rules (triggers) ----------

-- People: you can't link someone else's account, unlink someone, or change the owner.
create or replace function public.guard_people()
returns trigger language plpgsql set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    if new.user_id is not null and new.user_id is distinct from auth.uid() then
      raise exception 'You can only link your own account';
    end if;
  elsif tg_op = 'UPDATE' then
    new.owner_id := old.owner_id;
    if new.user_id is distinct from old.user_id
       and (old.user_id is not null or new.user_id is distinct from auth.uid()) then
      raise exception 'You can only link your own account';
    end if;
  end if;
  return new;
end $$;

drop trigger if exists guard_people on public.people;
create trigger guard_people before insert or update on public.people
  for each row execute function public.guard_people();

-- Expenses: shares must add up to the total. Keep owner fixed. Track edits.
create or replace function public.guard_expenses()
returns trigger language plpgsql set search_path = public as $$
declare
  total bigint;
begin
  select coalesce(sum(value::bigint), 0) into total from jsonb_each_text(new.shares);
  if total <> new.amount_cents then
    raise exception 'Shares (%) must add up to the total (%)', total, new.amount_cents;
  end if;
  if tg_op = 'UPDATE' then
    new.owner_id := old.owner_id;
    new.created_at := old.created_at;
  end if;
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists guard_expenses on public.expenses;
create trigger guard_expenses before insert or update on public.expenses
  for each row execute function public.guard_expenses();

create or replace function public.guard_owner()
returns trigger language plpgsql set search_path = public as $$
begin
  new.owner_id := old.owner_id;
  return new;
end $$;

drop trigger if exists guard_owner on public.groups;
create trigger guard_owner before update on public.groups
  for each row execute function public.guard_owner();

drop trigger if exists guard_owner on public.settlements;
create trigger guard_owner before update on public.settlements
  for each row execute function public.guard_owner();

-- ---------- Row Level Security: who can see and change what ----------
-- Note: the app saves with "upsert" (insert or update). Postgres also checks
-- the SELECT rule on the new row, so SELECT rules must accept your own new
-- rows by looking at the row's own columns (owner_id, user_id).

alter table public.people        enable row level security;
alter table public.groups        enable row level security;
alter table public.group_members enable row level security;
alter table public.expenses      enable row level security;
alter table public.settlements   enable row level security;

-- People
drop policy if exists people_select on public.people;
create policy people_select on public.people for select to authenticated
  using (owner_id = auth.uid() or user_id = auth.uid() or public.can_see_person(id));

drop policy if exists people_insert on public.people;
create policy people_insert on public.people for insert to authenticated
  with check (owner_id = auth.uid());

drop policy if exists people_update on public.people;
create policy people_update on public.people for update to authenticated
  using (owner_id = auth.uid() or user_id = auth.uid());

drop policy if exists people_delete on public.people;
create policy people_delete on public.people for delete to authenticated
  using (owner_id = auth.uid() and user_id is distinct from auth.uid());

-- Groups (members can see and rename; only the creator can delete)
drop policy if exists groups_select on public.groups;
create policy groups_select on public.groups for select to authenticated
  using (owner_id = auth.uid() or public.is_group_member(id));

drop policy if exists groups_insert on public.groups;
create policy groups_insert on public.groups for insert to authenticated
  with check (owner_id = auth.uid());

drop policy if exists groups_update on public.groups;
create policy groups_update on public.groups for update to authenticated
  using (public.is_group_member(id));

drop policy if exists groups_delete on public.groups;
create policy groups_delete on public.groups for delete to authenticated
  using (owner_id = auth.uid());

-- Group members
drop policy if exists members_select on public.group_members;
create policy members_select on public.group_members for select to authenticated
  using (public.is_group_member(group_id));

drop policy if exists members_insert on public.group_members;
create policy members_insert on public.group_members for insert to authenticated
  with check (public.is_group_member(group_id) and public.can_see_person(person_id));

drop policy if exists members_delete on public.group_members;
create policy members_delete on public.group_members for delete to authenticated
  using (public.is_group_member(group_id));

-- Expenses: group members see group expenses. Non-group expenses are seen
-- by whoever added them and the people in them.
drop policy if exists expenses_select on public.expenses;
create policy expenses_select on public.expenses for select to authenticated
  using (
    (group_id is not null and public.is_group_member(group_id))
    or owner_id = auth.uid()
    or (group_id is null and (payer_id = public.my_person_id() or shares ? public.my_person_id()::text))
  );

drop policy if exists expenses_insert on public.expenses;
create policy expenses_insert on public.expenses for insert to authenticated
  with check (owner_id = auth.uid() and (group_id is null or public.is_group_member(group_id)));

drop policy if exists expenses_update on public.expenses;
create policy expenses_update on public.expenses for update to authenticated
  using (
    (group_id is not null and public.is_group_member(group_id))
    or owner_id = auth.uid()
    or (group_id is null and (payer_id = public.my_person_id() or shares ? public.my_person_id()::text))
  )
  with check (group_id is null or public.is_group_member(group_id));

drop policy if exists expenses_delete on public.expenses;
create policy expenses_delete on public.expenses for delete to authenticated
  using (
    (group_id is not null and public.is_group_member(group_id))
    or owner_id = auth.uid()
    or (group_id is null and (payer_id = public.my_person_id() or shares ? public.my_person_id()::text))
  );

-- Settlements (payments)
drop policy if exists settlements_select on public.settlements;
create policy settlements_select on public.settlements for select to authenticated
  using (
    (group_id is not null and public.is_group_member(group_id))
    or owner_id = auth.uid()
    or (group_id is null and public.my_person_id() in (from_id, to_id))
  );

drop policy if exists settlements_insert on public.settlements;
create policy settlements_insert on public.settlements for insert to authenticated
  with check (owner_id = auth.uid() and (group_id is null or public.is_group_member(group_id)));

drop policy if exists settlements_update on public.settlements;
create policy settlements_update on public.settlements for update to authenticated
  using (
    (group_id is not null and public.is_group_member(group_id))
    or owner_id = auth.uid()
    or (group_id is null and public.my_person_id() in (from_id, to_id))
  )
  with check (group_id is null or public.is_group_member(group_id));

drop policy if exists settlements_delete on public.settlements;
create policy settlements_delete on public.settlements for delete to authenticated
  using (
    (group_id is not null and public.is_group_member(group_id))
    or owner_id = auth.uid()
    or (group_id is null and public.my_person_id() in (from_id, to_id))
  );

-- ---------- Invite links ----------

-- Shows a group's name and members before you join (needs the invite code).
create or replace function public.group_invite_preview(code text)
returns json language sql stable security definer set search_path = public as $$
  select json_build_object(
    'id', g.id,
    'name', g.name,
    'emoji', g.emoji,
    'already_member', public.is_group_member(g.id),
    'members', coalesce((
      select json_agg(json_build_object('id', p.id, 'name', p.name, 'claimed', p.user_id is not null) order by p.name)
      from group_members gm join people p on p.id = gm.person_id
      where gm.group_id = g.id), '[]'::json))
  from groups g
  where g.invite_code = code and auth.uid() is not null
$$;

-- Replaces one person with another everywhere (used when a friend claims
-- the placeholder someone made for them). Not callable from the app directly.
create or replace function public.merge_person(old_id uuid, new_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  update expenses set payer_id = new_id where payer_id = old_id;
  update expenses
     set shares = (shares - old_id::text)
                  || jsonb_build_object(new_id::text,
                       coalesce((shares ->> new_id::text)::bigint, 0) + (shares ->> old_id::text)::bigint)
   where shares ? old_id::text;
  delete from settlements
   where (from_id = old_id and to_id = new_id) or (from_id = new_id and to_id = old_id);
  update settlements set from_id = new_id where from_id = old_id;
  update settlements set to_id = new_id where to_id = old_id;
  insert into group_members (group_id, person_id)
    select group_id, new_id from group_members where person_id = old_id
    on conflict do nothing;
  delete from people where id = old_id;
end $$;

-- Join a group with its invite code. Optionally say "I am this person"
-- to take over the placeholder the group made for you.
create or replace function public.join_group(code text, claim_person_id uuid default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  g_id uuid;
  me uuid := public.my_person_id();
begin
  if auth.uid() is null then
    raise exception 'Sign in first';
  end if;
  if me is null then
    raise exception 'Create your profile first';
  end if;
  select id into g_id from groups where invite_code = code;
  if g_id is null then
    raise exception 'This invite link is not valid';
  end if;

  if claim_person_id is not null and claim_person_id <> me then
    if not exists (
      select 1 from group_members gm join people p on p.id = gm.person_id
      where gm.group_id = g_id and p.id = claim_person_id and p.user_id is null
    ) then
      raise exception 'That person can''t be claimed';
    end if;
    perform public.merge_person(claim_person_id, me);
  end if;

  insert into group_members (group_id, person_id) values (g_id, me) on conflict do nothing;
  return g_id;
end $$;

-- ---------- Permissions ----------

revoke all on public.people, public.groups, public.group_members, public.expenses, public.settlements from anon;
grant select, insert, update, delete
  on public.people, public.groups, public.group_members, public.expenses, public.settlements
  to authenticated;

revoke all on function public.merge_person(uuid, uuid) from public, anon, authenticated;
revoke all on function public.join_group(text, uuid) from public, anon;
revoke all on function public.group_invite_preview(text) from public, anon;
grant execute on function public.join_group(text, uuid) to authenticated;
grant execute on function public.group_invite_preview(text) to authenticated;

-- ---------- Live updates (Realtime) ----------

do $$
declare
  t text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach t in array array['people', 'groups', 'group_members', 'expenses', 'settlements'] loop
      if not exists (
        select 1 from pg_publication_tables
        where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
      ) then
        execute format('alter publication supabase_realtime add table public.%I', t);
      end if;
    end loop;
  end if;
end $$;
