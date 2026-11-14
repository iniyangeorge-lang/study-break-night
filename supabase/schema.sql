-- =====================================================================
-- Study Break Night: database schema
--
-- Run this whole file in the Supabase SQL editor.
-- Safe to re-run: tables are only created if missing, functions and
-- policies are replaced. (To wipe everything and start over, run
-- supabase/reset.sql first.)
--
-- Design:
--   * ALL event rules live in the SQL functions below. The frontend
--     only calls them through supabase.rpc().
--   * RLS is on for every table and anon has NO table access. Anonymous
--     visitors can only execute the granted functions.
--   * Every mutating function starts by locking the single settings row
--     (SELECT ... FOR UPDATE). Concurrent calls therefore run one at a
--     time, so caps and cup numbers can never be exceeded or duplicated.
-- =====================================================================


-- ---------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------

-- One row only (id = 1). Organisers edit it from /admin.
create table if not exists public.settings (
  id              int primary key default 1 check (id = 1),
  rsvp_cap        int not null default 150 check (rsvp_cap >= 0),  -- max RSVPs
  cap             int not null default 150 check (cap >= 0),       -- max cups handed out in total
  rsvp_open       boolean not null default true,                   -- manual on/off switch for sign-ups
  release_at      timestamptz,   -- after this, walk-ins may check in (null = not released)
  checkin_opens   timestamptz,   -- check-in window start (null = not open)
  checkin_closes  timestamptz,   -- check-in window end   (null = no end)
  updated_at      timestamptz not null default now()
);

insert into public.settings (id) values (1) on conflict (id) do nothing;

-- Everyone who RSVPed or walked in. Keep personal data minimal.
-- Delete after the event with:  truncate public.attendees restart identity;
create table if not exists public.attendees (
  id             bigint generated always as identity primary key,
  name           text not null,
  identifier     text not null unique,   -- normalised NUS email address
  type           text not null check (type in ('rsvp', 'walkin')),
  created_at     timestamptz not null default now(),
  checked_in_at  timestamptz,
  cup_number     int unique,             -- 1..cap, assigned at check-in
  checked_in_by  text check (checked_in_by in ('self', 'admin'))
);

-- Organisers. Each row links to a Supabase Auth user.
create table if not exists public.admins (
  user_id     uuid primary key references auth.users (id) on delete cascade,
  created_at  timestamptz not null default now()
);


-- ---------------------------------------------------------------------
-- Upgrades from earlier versions of this file (no-ops on a fresh DB).
-- Telegram handles and cancel codes were removed; the old function
-- signatures must be dropped, or they'd linger as extra overloads.
-- ---------------------------------------------------------------------
alter table public.attendees drop column if exists telegram;
alter table public.attendees drop column if exists cancel_code;
drop function if exists public.rsvp(text, text, text);
drop function if exists public.cancel_rsvp(text, text);
drop function if exists public._new_cancel_code();


-- ---------------------------------------------------------------------
-- Internal helpers (NOT callable by visitors; see grants at the bottom)
-- ---------------------------------------------------------------------

-- Lower-case and strip spaces, then accept only an NUS email address:
--   anything@u.nus.edu, @nus.edu.sg, @comp.nus.edu.sg, ...
-- Returns NULL otherwise. Email only (no matric numbers), so one person
-- can't sign up twice under two different identifiers. Loosen this one
-- function if the organisers decide sign-up is not NUS-only.
create or replace function public._normalize_identifier(p text)
returns text
language sql
immutable
as $$
  select case
           when v ~ '^[a-z0-9._%+-]+@([a-z0-9-]+\.)*nus\.edu(\.sg)?$' then v
           else null
         end
  from (select lower(regexp_replace(coalesce(p, ''), '\s', '', 'g')) as v) s
$$;

-- Collapse runs of whitespace and trim.
create or replace function public._clean_name(p text)
returns text
language sql
immutable
as $$
  select btrim(regexp_replace(coalesce(p, ''), '\s+', ' ', 'g'))
$$;

-- The data shown on the check-in confirmation screen.
create or replace function public._checkin_payload(p_status text, a public.attendees)
returns jsonb
language sql
immutable
as $$
  select jsonb_build_object(
    'status',        p_status,
    'name',          a.name,
    'cup_number',    a.cup_number,
    'checked_in_at', a.checked_in_at,
    'type',          a.type
  )
$$;

-- Is the current logged-in user an organiser?
-- SECURITY DEFINER so it can read the admins table regardless of RLS.
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.admins where user_id = auth.uid())
$$;


-- ---------------------------------------------------------------------
-- rsvp(name, identifier)
--   -> ok (+name) | already_registered | full | closed
--      | invalid_name | invalid_identifier
-- ---------------------------------------------------------------------
create or replace function public.rsvp(
  p_name       text,
  p_identifier text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  s        public.settings%rowtype;
  v_name   text := public._clean_name(p_name);
  v_id     text := public._normalize_identifier(p_identifier);
  v_count  int;
begin
  -- Serialise all mutating calls on the settings row.
  select * into s from public.settings where id = 1 for update;

  if not s.rsvp_open then
    return jsonb_build_object('status', 'closed');
  end if;

  if length(v_name) = 0 or length(v_name) > 80 then
    return jsonb_build_object('status', 'invalid_name');
  end if;

  if v_id is null then
    return jsonb_build_object('status', 'invalid_identifier');
  end if;

  if exists (select 1 from public.attendees where identifier = v_id) then
    return jsonb_build_object('status', 'already_registered');
  end if;

  select count(*) into v_count from public.attendees where type = 'rsvp';
  if v_count >= s.rsvp_cap then
    return jsonb_build_object('status', 'full');
  end if;

  insert into public.attendees (name, identifier, type)
  values (v_name, v_id, 'rsvp');

  return jsonb_build_object('status', 'ok', 'name', v_name);
end
$$;


-- ---------------------------------------------------------------------
-- cancel_rsvp(identifier)
--   -> ok | not_found | already_checked_in | invalid_identifier
-- Only the email is needed (organisers chose simplicity over a
-- cancel code). Anyone who knows it can cancel that booking.
-- ---------------------------------------------------------------------
create or replace function public.cancel_rsvp(
  p_identifier text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id     text := public._normalize_identifier(p_identifier);
  a        public.attendees%rowtype;
  v_found  boolean;
begin
  perform 1 from public.settings where id = 1 for update;

  if v_id is null then
    return jsonb_build_object('status', 'invalid_identifier');
  end if;

  select * into a
  from public.attendees
  where identifier = v_id and type = 'rsvp';
  v_found := found;   -- save FOUND immediately; later statements overwrite it

  if not v_found then
    return jsonb_build_object('status', 'not_found');
  end if;

  if a.checked_in_at is not null then
    return jsonb_build_object('status', 'already_checked_in');
  end if;

  delete from public.attendees where id = a.id;
  return jsonb_build_object('status', 'ok');
end
$$;


-- ---------------------------------------------------------------------
-- Shared check-in logic. p_admin = true skips the time window and the
-- walk-in release time, but still respects the total cup cap.
-- Not granted to anyone; called by check_in() and admin_check_in().
-- ---------------------------------------------------------------------
create or replace function public._check_in(
  p_identifier text,
  p_name       text,
  p_admin      boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  s        public.settings%rowtype;
  v_id     text := public._normalize_identifier(p_identifier);
  v_name   text := public._clean_name(p_name);
  a        public.attendees%rowtype;
  v_found  boolean;
  v_given  int;
  v_max    int;
begin
  select * into s from public.settings where id = 1 for update;

  -- 1. Time window (stops people checking in from home with a photo of the QR).
  if not p_admin and (
       s.checkin_opens is null
       or now() < s.checkin_opens
       or (s.checkin_closes is not null and now() > s.checkin_closes)
     ) then
    return jsonb_build_object('status', 'not_open',
                              'opens_at', s.checkin_opens,
                              'closes_at', s.checkin_closes);
  end if;

  -- 2. Valid NUS email?
  if v_id is null then
    return jsonb_build_object('status', 'invalid_identifier');
  end if;

  -- 3. Look the person up.
  select * into a from public.attendees where identifier = v_id;
  v_found := found;   -- save FOUND immediately; the count below overwrites it

  -- 4. Already has a cup: show the same confirmation again.
  if v_found and a.checked_in_at is not null then
    return public._checkin_payload('already', a);
  end if;

  -- 5. Walk-ins wait until RSVP cups are released.
  if not v_found and not p_admin and (s.release_at is null or now() < s.release_at) then
    return jsonb_build_object('status', 'walkins_not_yet', 'release_at', s.release_at);
  end if;

  -- 6. Any cups left? (RSVP and walk-in check-ins share the one cap.)
  select count(*), coalesce(max(cup_number), 0)
    into v_given, v_max
  from public.attendees
  where checked_in_at is not null;

  if v_given >= s.cap then
    return jsonb_build_object('status', 'no_cups');
  end if;

  -- 7. Hand out the next cup number.
  if v_found then
    update public.attendees
       set checked_in_at = clock_timestamp(),
           cup_number    = v_max + 1,
           checked_in_by = case when p_admin then 'admin' else 'self' end
     where id = a.id
    returning * into a;
  else
    -- Walk-ins must give a name.
    if length(v_name) = 0 or length(v_name) > 80 then
      return jsonb_build_object('status', 'need_name');
    end if;

    insert into public.attendees (name, identifier, type, checked_in_at, cup_number, checked_in_by)
    values (v_name, v_id, 'walkin', clock_timestamp(), v_max + 1,
            case when p_admin then 'admin' else 'self' end)
    returning * into a;
  end if;

  return public._checkin_payload('ok', a);
end
$$;


-- ---------------------------------------------------------------------
-- check_in(identifier, name?)  (public, used by the /checkin page)
--   -> ok / already (+name, cup_number, checked_in_at, type)
--      | need_name | walkins_not_yet (+release_at) | no_cups
--      | not_open (+opens_at, closes_at) | invalid_identifier
-- ---------------------------------------------------------------------
create or replace function public.check_in(
  p_identifier text,
  p_name       text default null
)
returns jsonb
language sql
security definer
set search_path = public
as $$
  select public._check_in(p_identifier, p_name, false)
$$;


-- ---------------------------------------------------------------------
-- admin_check_in(identifier, name?)  (organisers only)
--   -> same as check_in, plus forbidden
-- ---------------------------------------------------------------------
create or replace function public.admin_check_in(
  p_identifier text,
  p_name       text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    return jsonb_build_object('status', 'forbidden');
  end if;
  return public._check_in(p_identifier, p_name, true);
end
$$;


-- ---------------------------------------------------------------------
-- admin_remove_attendee(id)  (organisers only)
--   -> ok (+name) | not_found | checked_in | forbidden
-- Refuses once someone has checked in: their spot has been used, and
-- deleting them would let one extra person past the cap.
-- ---------------------------------------------------------------------
create or replace function public.admin_remove_attendee(
  p_id bigint
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  a        public.attendees%rowtype;
  v_found  boolean;
begin
  if not public.is_admin() then
    return jsonb_build_object('status', 'forbidden');
  end if;

  perform 1 from public.settings where id = 1 for update;

  select * into a from public.attendees where id = p_id;
  v_found := found;   -- save FOUND immediately

  if not v_found then
    return jsonb_build_object('status', 'not_found');
  end if;

  if a.checked_in_at is not null then
    return jsonb_build_object('status', 'checked_in');
  end if;

  delete from public.attendees where id = a.id;
  return jsonb_build_object('status', 'ok', 'name', a.name);
end
$$;


-- ---------------------------------------------------------------------
-- admin_set_spots(n)  (organisers only)
--   -> ok (+spots) | invalid | too_low (+minimum) | forbidden
-- One number for both limits: max sign-ups (rsvp_cap) and max check-ins
-- (cap). Can't go below the people already signed up / checked in.
-- ---------------------------------------------------------------------
create or replace function public.admin_set_spots(
  p_spots int
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_min int;
begin
  if not public.is_admin() then
    return jsonb_build_object('status', 'forbidden');
  end if;

  perform 1 from public.settings where id = 1 for update;

  if p_spots is null or p_spots < 0 or p_spots > 10000 then
    return jsonb_build_object('status', 'invalid');
  end if;

  select greatest(
           count(*) filter (where type = 'rsvp'),
           count(*) filter (where checked_in_at is not null)
         )
    into v_min
  from public.attendees;

  if p_spots < v_min then
    return jsonb_build_object('status', 'too_low', 'minimum', v_min);
  end if;

  update public.settings
     set rsvp_cap = p_spots, cap = p_spots, updated_at = now()
   where id = 1;

  return jsonb_build_object('status', 'ok', 'spots', p_spots);
end
$$;


-- ---------------------------------------------------------------------
-- admin_set_checkin(open)  (organisers only)
--   -> ok (+opens_at, closes_at) | forbidden
-- open = true:  check-in opens now, with no end time.
-- open = false: check-in closes now.
-- ---------------------------------------------------------------------
create or replace function public.admin_set_checkin(
  p_open boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  s public.settings%rowtype;
begin
  if not public.is_admin() then
    return jsonb_build_object('status', 'forbidden');
  end if;

  perform 1 from public.settings where id = 1 for update;

  if p_open then
    update public.settings
       set checkin_opens = now(), checkin_closes = null, updated_at = now()
     where id = 1
    returning * into s;
  else
    update public.settings
       set checkin_closes = now(), updated_at = now()
     where id = 1
    returning * into s;
  end if;

  return jsonb_build_object('status', 'ok', 'opens_at', s.checkin_opens, 'closes_at', s.checkin_closes);
end
$$;


-- ---------------------------------------------------------------------
-- admin_set_walkins(allow)  (organisers only)
--   -> ok (+release_at) | forbidden
-- allow = true:  people without a booking can check in from now on.
-- allow = false: back to booked people only (walk-ins already checked
--                in keep their spot).
-- ---------------------------------------------------------------------
create or replace function public.admin_set_walkins(
  p_allow boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_release timestamptz;
begin
  if not public.is_admin() then
    return jsonb_build_object('status', 'forbidden');
  end if;

  perform 1 from public.settings where id = 1 for update;

  update public.settings
     set release_at = case when p_allow then now() else null end,
         updated_at = now()
   where id = 1
  returning release_at into v_release;

  return jsonb_build_object('status', 'ok', 'release_at', v_release);
end
$$;


-- ---------------------------------------------------------------------
-- public_stats()  (counts only, no personal data)
-- ---------------------------------------------------------------------
create or replace function public.public_stats()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'rsvp_count',     c.rsvp_count,
    'rsvp_cap',       s.rsvp_cap,
    'cap',            s.cap,
    'checked_in',     c.checked_in,
    'cups_left',      greatest(s.cap - c.checked_in, 0),
    'rsvp_open',      s.rsvp_open,
    'release_at',     s.release_at,
    'checkin_opens',  s.checkin_opens,
    'checkin_closes', s.checkin_closes
  )
  from public.settings s,
       lateral (
         select count(*) filter (where type = 'rsvp')               as rsvp_count,
                count(*) filter (where checked_in_at is not null)   as checked_in
         from public.attendees
       ) c
  where s.id = 1
$$;


-- ---------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------
alter table public.settings  enable row level security;
alter table public.attendees enable row level security;
alter table public.admins    enable row level security;

-- Anonymous visitors get no direct table access at all.
revoke all on public.settings, public.attendees, public.admins from anon;

drop policy if exists "admins read attendees"   on public.attendees;
drop policy if exists "admins delete attendees" on public.attendees;
drop policy if exists "admins read settings"    on public.settings;
drop policy if exists "admins update settings"  on public.settings;
drop policy if exists "read own admin row"      on public.admins;

create policy "admins read attendees" on public.attendees
  for select to authenticated using (public.is_admin());

-- (No delete policy: organisers remove people through admin_remove_attendee(),
--  which refuses once someone has checked in.)

create policy "admins read settings" on public.settings
  for select to authenticated using (public.is_admin());

-- (No update policy: organisers change settings through admin_set_spots()
--  and admin_set_checkin(), which check the values first.)

create policy "read own admin row" on public.admins
  for select to authenticated using (user_id = auth.uid());


-- ---------------------------------------------------------------------
-- Function permissions
-- Supabase grants EXECUTE on new functions to anon by default, so take
-- it away from everything first, then grant back only the public API.
-- ---------------------------------------------------------------------
revoke execute on all functions in schema public from public, anon, authenticated;

grant execute on function public.public_stats()               to anon, authenticated;
grant execute on function public.rsvp(text, text)             to anon, authenticated;
grant execute on function public.cancel_rsvp(text)            to anon, authenticated;
grant execute on function public.check_in(text, text)         to anon, authenticated;
grant execute on function public.admin_check_in(text, text)   to authenticated;
grant execute on function public.admin_remove_attendee(bigint) to authenticated;
grant execute on function public.admin_set_spots(int)         to authenticated;
grant execute on function public.admin_set_checkin(boolean)   to authenticated;
grant execute on function public.admin_set_walkins(boolean)   to authenticated;
grant execute on function public.is_admin()                   to authenticated;  -- used by RLS policies
