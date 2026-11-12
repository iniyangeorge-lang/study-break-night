-- =====================================================================
-- DANGER: deletes ALL Study Break Night tables, data and functions.
-- Use only to start over (e.g. before launch), then run schema.sql again.
-- Do NOT run this after RSVPs have opened.
-- =====================================================================

drop function if exists public._clean_name(text);
drop function if exists public._new_cancel_code();
drop table if exists public.attendees cascade;
drop table if exists public.settings  cascade;
drop table if exists public.admins    cascade;

drop function if exists public.rsvp(text, text, text);
drop function if exists public.rsvp(text, text);
drop function if exists public.cancel_rsvp(text, text);
drop function if exists public.cancel_rsvp(text);
drop function if exists public.check_in(text, text);
drop function if exists public.admin_check_in(text, text);
drop function if exists public.public_stats();
drop function if exists public.is_admin();
drop function if exists public._check_in(text, text, boolean);
drop function if exists public._normalize_identifier(text);
