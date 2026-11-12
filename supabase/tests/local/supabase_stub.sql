-- Minimal stand-in for the bits of Supabase that schema.sql relies on,
-- so the schema can be tested in a plain local Postgres (Docker).
-- Never run this against the real Supabase project.

create role anon nologin;
create role authenticated nologin;

create schema auth;
create table auth.users (id uuid primary key default gen_random_uuid(), email text);

-- Supabase reads the logged-in user from the request's JWT claims.
-- Here we fake it with a session setting: set test.uid = '<uuid>'.
create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('test.uid', true), '')::uuid
$$;

grant usage on schema auth to anon, authenticated;
grant execute on function auth.uid() to anon, authenticated;
-- Supabase's default table grants (RLS then restricts them).
grant all on all tables in schema public to anon, authenticated;
alter default privileges in schema public grant all on tables to anon, authenticated;
grant usage on schema public to anon, authenticated;
