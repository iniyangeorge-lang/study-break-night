-- =====================================================================
-- TEST DATA: creates 149 fake sign-ups, so the next real sign-up takes
-- the last spot (150) and the one after that sees the "full" page.
--
-- Paste into the Supabase SQL Editor and click Run.
-- Uses the real rsvp() function, so the normal rules (cap, duplicates)
-- apply. Safe to run twice: existing seed rows come back as
-- already_registered rather than being duplicated.
--
-- All seed rows use emails like  seed.test.001@u.nus.edu
-- REMOVE THEM BEFORE LAUNCH with the cleanup query at the bottom.
-- =====================================================================

-- 1. Create the sign-ups.
select public.rsvp(
         'Test User ' || n,
         'seed.test.' || lpad(n::text, 3, '0') || '@u.nus.edu'
       ) ->> 'status' as status
from generate_series(1, 149) as n;

-- 2. Summary (this is the result the SQL editor shows).
select
  (select count(*) from public.attendees where identifier like 'seed.test.%@u.nus.edu') as seed_rows,
  (select count(*) from public.attendees where type = 'rsvp')                           as total_rsvps,
  (select rsvp_cap from public.settings where id = 1)                                   as rsvp_cap;

-- Expected on an empty table:  seed_rows = 149, total_rsvps = 149, rsvp_cap = 150
-- If seed_rows < 149, the table already had other sign-ups and the cap was hit.


-- ---------------------------------------------------------------------
-- CLEANUP (run this on its own when you're done testing):
--
--   delete from public.attendees where identifier like 'seed.test.%@u.nus.edu';
-- ---------------------------------------------------------------------
