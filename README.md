# Study Break Night

Free bubble tea + snacks at the COM1 foyer, the night before finals (7–9pm, 150 cups).

- `/`: home page: event info, menu (edit in `src/config.js`), Sign up / Check in buttons, cancel link
- `/signup`: sign-up form (name + NUS email) and confirmation
- `/full`: "all spots filled" (or `?reason=closed`) with the Telegram channel link
- `/cancel`: cancel a booking with just the NUS email
- `/checkin`: self check-in on the night via QR code *(to do)*
- `/admin`: organiser dashboard *(to do)*

Stack: Vite + React (`src/`), Supabase Postgres (`supabase/schema.sql`), hosted on Vercel.
**All event rules live in SQL functions.** The frontend only calls them via `src/lib/api.js`.

## Setup

1. **Database.** In the Supabase dashboard, open SQL Editor and run `supabase/schema.sql`.
   - If an older version of the schema was run before, first run `supabase/reset.sql`
     (deletes all event tables and data), then `schema.sql`.
2. **Env vars.** `cp .env.example .env` and fill in:
   - `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` (Project Settings → API).
     Use the **anon / publishable** key only, **never** the service_role / secret key.
   - `VITE_TELEGRAM_CHANNEL_URL`
3. `npm install` then `npm run dev`. The home page should show **0 / 150 spots taken**.
4. **Make an organiser an admin.** Authentication → Users → Add user (email + password), then in SQL Editor:
   ```sql
   insert into public.admins (user_id)
   select id from auth.users where email = 'organiser@example.com';
   ```
5. **Before the event**, set the times (from `/admin`, or SQL for now). Times are stored with timezone:
   ```sql
   update public.settings set
     checkin_opens  = '2026-11-20 18:45+08',
     checkin_closes = '2026-11-20 21:15+08',
     release_at     = '2026-11-20 19:45+08';
   ```

## Deploy (Vercel)

Import the repo, set the same three `VITE_` env vars in Vercel, deploy.
`vercel.json` rewrites every path to `index.html` so `/checkin` etc. work on refresh.

## Testing the database locally

```sh
npm run test:db
```

This starts a throwaway Postgres in Docker, loads `schema.sql`, runs `supabase/tests/logic_test.sql`,
then fires 200 simultaneous RSVPs and 200 simultaneous check-ins to check the caps hold.
**Never run `logic_test.sql` against the real Supabase project**: it truncates attendees and changes settings.

## After the event

```sql
truncate public.attendees restart identity;
```
