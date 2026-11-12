-- =====================================================================
-- Logic tests for schema.sql.
--
-- !!! NEVER RUN THIS AGAINST THE REAL SUPABASE PROJECT !!!
-- It TRUNCATES attendees and CHANGES settings.
-- Run it locally with:  ./supabase/tests/local/run.sh
-- =====================================================================
\set ON_ERROR_STOP on

create or replace function pg_temp.expect(actual jsonb, key text, expected text, label text)
returns void language plpgsql as $$
begin
  if coalesce(actual ->> key, '<null>') <> expected then
    raise exception 'FAIL %: expected %=% but got %', label, key, expected, actual;
  end if;
  raise notice 'pass: %', label;
end $$;

truncate public.attendees restart identity;
update public.settings set rsvp_cap = 3, cap = 4, rsvp_open = true,
  release_at = null, checkin_opens = null, checkin_closes = null;

-- ---------- rsvp ----------
set role anon;
select pg_temp.expect(public.rsvp('Alice', 'e1234567@u.nus.edu'), 'status', 'ok', 'rsvp ok (email)');
select pg_temp.expect(public.rsvp('  Bob   Tan ', ' Bob.Tan@U.NUS.EDU '), 'status', 'ok', 'rsvp ok (caps, spaces)');
select pg_temp.expect(public.rsvp('Alice again', 'E1234567@U.NUS.EDU'), 'status', 'already_registered', 'duplicate is case-insensitive');
select pg_temp.expect(public.rsvp('', 'e7654321@u.nus.edu'), 'status', 'invalid_name', 'empty name');
select pg_temp.expect(public.rsvp(repeat('x', 81), 'e7654321@u.nus.edu'), 'status', 'invalid_name', 'name too long');
select pg_temp.expect(public.rsvp('Eve', 'eve@gmail.com'), 'status', 'invalid_identifier', 'non-NUS email');
select pg_temp.expect(public.rsvp('Eve', 'A0123456X'), 'status', 'invalid_identifier', 'matric number rejected');
select pg_temp.expect(public.rsvp('Carol', 'carol@comp.nus.edu.sg'), 'status', 'ok', 'rsvp ok (staff email)');
select pg_temp.expect(public.rsvp('Dan', 'e1111111@u.nus.edu'), 'status', 'full', 'rsvp_cap reached');
reset role;

select pg_temp.expect(to_jsonb(a), 'name', 'Bob Tan', 'name whitespace collapsed') from public.attendees a where identifier = 'bob.tan@u.nus.edu';

update public.settings set rsvp_open = false;
set role anon;
select pg_temp.expect(public.rsvp('Dan', 'e1111111@u.nus.edu'), 'status', 'closed', 'rsvp closed');
reset role;
update public.settings set rsvp_open = true;

-- ---------- cancel ----------
set role anon;
select pg_temp.expect(public.cancel_rsvp('nobody@u.nus.edu'), 'status', 'not_found', 'cancel unknown email');
select pg_temp.expect(public.cancel_rsvp('hello'), 'status', 'invalid_identifier', 'cancel invalid input');
select pg_temp.expect(public.cancel_rsvp(' BOB.tan@u.nus.edu '), 'status', 'ok', 'cancel ok (case/space-insensitive)');
select pg_temp.expect(public.cancel_rsvp('bob.tan@u.nus.edu'), 'status', 'not_found', 'cancel twice -> not_found');
select pg_temp.expect(public.rsvp('Dan', 'e1111111@u.nus.edu'), 'status', 'ok', 'cancel freed a spot');

-- ---------- check-in window ----------
select pg_temp.expect(public.check_in('e1234567@u.nus.edu'), 'status', 'not_open', 'check-in not configured');
reset role;
update public.settings set checkin_opens = now() + interval '1 hour';
set role anon;
select pg_temp.expect(public.check_in('e1234567@u.nus.edu'), 'status', 'not_open', 'check-in before window');
reset role;
update public.settings set checkin_opens = now() - interval '2 hours', checkin_closes = now() - interval '1 hour';
set role anon;
select pg_temp.expect(public.check_in('e1234567@u.nus.edu'), 'status', 'not_open', 'check-in after window');
reset role;
update public.settings set checkin_opens = now() - interval '1 hour', checkin_closes = now() + interval '1 hour';

-- ---------- check-in ----------
set role anon;
select pg_temp.expect(public.check_in('not an id'), 'status', 'invalid_identifier', 'check-in bad id');
select pg_temp.expect(public.check_in('e1234567@u.nus.edu'), 'cup_number', '1', 'rsvp check-in gets cup 1');
select pg_temp.expect(public.check_in('E1234567@u.nus.edu'), 'status', 'already', 'second scan says already');
select pg_temp.expect(public.check_in('E1234567@u.nus.edu'), 'cup_number', '1', 'already keeps cup number');
select pg_temp.expect(public.check_in('e9999999@u.nus.edu', 'Walker'), 'status', 'walkins_not_yet', 'walk-in before release (null)');
reset role;
update public.settings set release_at = now() + interval '10 minutes';
set role anon;
select pg_temp.expect(public.check_in('e9999999@u.nus.edu', 'Walker'), 'status', 'walkins_not_yet', 'walk-in before release');
select pg_temp.expect(public.cancel_rsvp('e1234567@u.nus.edu'), 'status', 'already_checked_in', 'cannot cancel after check-in');
reset role;
update public.settings set release_at = now() - interval '1 minute';
set role anon;
select pg_temp.expect(public.check_in('e9999999@u.nus.edu'), 'status', 'need_name', 'walk-in needs name');
select pg_temp.expect(public.check_in('e9999999@u.nus.edu', '   '), 'status', 'need_name', 'walk-in blank name');
select pg_temp.expect(public.check_in('e9999999@u.nus.edu', 'Walker'), 'type', 'walkin', 'walk-in ok');
select pg_temp.expect(public.check_in('carol@comp.nus.edu.sg'), 'cup_number', '3', 'rsvp after walk-in gets cup 3');
select pg_temp.expect(public.check_in('e1111111@u.nus.edu'), 'cup_number', '4', 'cup 4 = cap');
select pg_temp.expect(public.check_in('e8888888@u.nus.edu', 'Late'), 'status', 'no_cups', 'cap reached for walk-in');

-- ---------- admin ----------
do $$
begin
  perform public.admin_check_in('e8888888@u.nus.edu', 'Late');
  raise exception 'FAIL: anon could call admin_check_in';
exception when insufficient_privilege then
  raise notice 'pass: anon cannot call admin_check_in';
end $$;
reset role;
insert into auth.users (id, email) values ('00000000-0000-0000-0000-000000000001', 'org@example.com');
insert into public.admins (user_id) values ('00000000-0000-0000-0000-000000000001');
update public.settings set cap = 5, checkin_opens = now() + interval '1 day', release_at = null;
set role authenticated;
select pg_temp.expect(public.admin_check_in('e8888888@u.nus.edu', 'Late'), 'status', 'forbidden', 'non-admin login forbidden');
set test.uid = '00000000-0000-0000-0000-000000000001';
select pg_temp.expect(public.admin_check_in('e8888888@u.nus.edu'), 'status', 'need_name', 'admin walk-in still needs name');
select pg_temp.expect(public.admin_check_in('e8888888@u.nus.edu', 'Late'), 'cup_number', '5', 'admin skips window + release');
select pg_temp.expect(public.admin_check_in('e7777777@u.nus.edu', 'Later'), 'status', 'no_cups', 'admin still respects cap');
select pg_temp.expect(jsonb_build_object('n', (select count(*) from public.attendees)), 'n', '5', 'admin can read attendees');
reset role;
set test.uid = '';

-- ---------- permissions ----------
set role anon;
select pg_temp.expect(public.public_stats(), 'cups_left', '0', 'public_stats cups_left');
select pg_temp.expect(public.public_stats(), 'rsvp_count', '3', 'public_stats rsvp_count');
do $$
begin
  perform * from public.attendees;
  raise exception 'FAIL: anon could read attendees';
exception when insufficient_privilege then
  raise notice 'pass: anon cannot read attendees';
end $$;
do $$
begin
  perform public._check_in('x', 'y', true);
  raise exception 'FAIL: anon could call _check_in';
exception when insufficient_privilege then
  raise notice 'pass: anon cannot call internal _check_in';
end $$;
reset role;
set role authenticated;   -- logged in, but not an admin
select pg_temp.expect(jsonb_build_object('n', (select count(*) from public.attendees)), 'n', '0', 'non-admin sees no attendees');
reset role;

\echo '=== ALL LOGIC TESTS PASSED ==='
