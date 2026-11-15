# Study Break Night

A small website for a free bubble tea + snacks event at the COM1 foyer, the night before finals (7–9pm).
Students reserve a spot in advance. On the night they check themselves in by scanning a QR code and show a
green confirmation screen to staff. Organisers watch everything from a dashboard.

- [What the site does](#what-the-site-does)
- [Organiser guide](#organiser-guide)
- [How it works](#how-it-works)
- [Why Supabase](#why-supabase)
- [What could break](#what-could-break)
- [Setup and deployment](#setup-and-deployment)
- [Project structure](#project-structure)

---

## What the site does

### Pages

| URL | Who | What it's for |
|---|---|---|
| `/` | Everyone | Event details, the menu, and three actions: **Reserve your spot**, **Check in**, **Cancel your booking** |
| `/signup` | Students | Name + NUS email → reserves a spot |
| `/full` | Students | "Sorry, all spots are filled" + Telegram channel link (or "Sign-ups are closed" via `?reason=closed`) |
| `/cancel` | Students | Enter NUS email → booking deleted, spot freed |
| `/checkin` | Students, on the night | Enter NUS email → big green confirmation screen with their number |
| `/admin` | Organisers | Login, live counts, list of everyone, remove people, open check-in, allow walk-ins, set spots |


**Signing up**
- One booking per NUS email. Email is the only identifier: capitals and spaces are ignored, so
  `E1234567@U.NUS.EDU ` and `e1234567@u.nus.edu` are the same person.
- Only NUS addresses are accepted: anything ending in `nus.edu` or `nus.edu.sg`
  (`@u.nus.edu`, `@nus.edu.sg`, `@comp.nus.edu.sg`, …).
- Sign-ups stop when the number of bookings reaches **spots** (150 by default). After that, anyone clicking
  **Reserve your spot** goes straight to the "all spots are filled" page.
- Signing up again with the same email shows "You've already signed up!". 

**Cancelling**
- Only the email is needed. The booking is deleted and the spot becomes available to someone else.
- A booking can't be cancelled after that person has checked in.

**Checking in on the night**

The check-in function asks these questions in order and stops at the first "no":

1. **Is check-in open?** (an organiser pressed *Open check-in now*) → otherwise *"Check-in isn't open yet"* or *"Check-in has closed"*
2. **Is it a valid NUS email?** → otherwise *"Please use your NUS email"*
3. **Already checked in?** → shows the same green screen and the same number again (*"Already checked in"*)
4. **No booking, and walk-ins not allowed yet?** → *"No booking found for this email"* (nothing is saved)
5. **Have `spots` people already checked in?** → *"Sorry, we're all out"*
6. **No booking (a walk-in)?** → asks for their name first
7. Otherwise → ✅ green screen with the next number (#1, #2, …)

**Booked people vs walk-ins**
- Until an organiser presses **Allow walk-ins now**, only booked people can check in. Since bookings can't
  exceed `spots`, **a booked person is never turned away before that button is pressed.**
- After it's pressed, anyone with an NUS email can check in, first come first served, until `spots` people
  have checked in. **A booked person who arrives late can then find the spots gone.** The sign-up page warns
  people that their spot is "held until 7:45pm".
- "Sorry, we're all out" depends only on **check-ins**, never on sign-ups. 150 sign-ups closes sign-ups;
  150 check-ins closes check-in.

---

## Organiser guide

### Getting access
Each organiser needs a login, created in Supabase:
1. Supabase → **Authentication → Users → Add user → Create new user** (email + password, tick **Auto Confirm User**).
2. Supabase → **SQL Editor**:
   ```sql
   insert into public.admins (user_id)
   select id from auth.users where email = 'their-email@example.com';
   ```
3. They go to `/admin` and log in.


```

### The dashboard (`/admin`)
- **Signed up** (x / spots) and **Checked in** (x / spots). Refreshes every 10 seconds.
- **Check-in**: *Open check-in now* / *Close check-in*. 
- **Walk-ins**: *Allow walk-ins now* / *Stop walk-ins*. 
- **Spots**: Number that sets both the max sign-ups and the max check-ins. It can't go below the number
  of people already signed up or checked in.
- **List**: search by name or email, filter by *Not checked in* / *Checked in*.
  - **Remove** deletes a booking. Only possible for people who haven't checked in.
  - Checked-in people show their number and time (e.g. `#12 · 7:14pm`).

### Running the night
1. **Before**: print the sign-up list as a backup (see below). Put the QR code (pointing to `/checkin`) at the
   foyer.
2. **~7pm**: press **Open check-in now**.
3. **People arrive**: they scan, type their email, and show the green screen. Staff hand over bubble tea + snacks
   and can glance at the name and number.
4. **~7:45pm** (or when most booked people are in): compare *Signed up* vs *Checked in* on the dashboard,
   then press **Allow walk-ins now**.
5. **End**: press **Close check-in**.


### Things only changeable in code or SQL
| What | Where |
|---|---|
| Event title, date, time, venue, menu | `src/config.js` (then redeploy) |
| "Spot held until 7:45pm" text, before walk-ins are allowed | `defaultReleaseLabel` in `src/config.js` |
| Telegram channel link | `VITE_TELEGRAM_CHANNEL_URL` env var |
| Allowed email domains | `_normalize_identifier` in `supabase/schema.sql` |

---

## How it works

### 1. All rules live in the database
Every action calls one SQL function, which checks the rules and returns
a `status` (`ok`, `full`, `already_registered`, `no_cups`, …). Database code can't be tampered
with from outside.

| Function | Called by | Returns |
|---|---|---|
| `rsvp(name, email)` | `/signup` | `ok` · `already_registered` · `full` · `closed` · `invalid_name` · `invalid_identifier` |
| `cancel_rsvp(email)` | `/cancel` | `ok` · `not_found` · `already_checked_in` · `invalid_identifier` |
| `check_in(email, name?)` | `/checkin` | `ok` / `already` (+ name, number, time, type) · `need_name` · `walkins_not_yet` · `no_cups` · `not_open` · `invalid_identifier` |
| `public_stats()` | Home, sign-up, admin | counts and settings only, no personal data |
| `admin_remove_attendee(id)` | `/admin` | `ok` · `not_found` · `checked_in` · `forbidden` |
| `admin_set_checkin(open)` | `/admin` | `ok` · `forbidden` |
| `admin_set_walkins(allow)` | `/admin` | `ok` · `forbidden` |
| `admin_set_spots(n)` | `/admin` | `ok` · `too_low` · `invalid` · `forbidden` |
| `admin_check_in(email, name?)` | *(not used by the UI yet)* | like `check_in`, but ignores the time window and walk-in rule |

### 2. No double-booking, even when everyone clicks at once
If 200 people click *Reserve* in the same second for the last spot, two requests could both see "149 taken"
and both insert, giving 151. To prevent this, every function that changes data starts by **locking the
single `settings` row** (`select … for update`). Requests then run strictly one after another: the second
waits until the first has finished, then sees the updated count.

This is tested: 200 simultaneous sign-ups give exactly 150 bookings, and 200 simultaneous check-ins give
exactly 150 check-ins numbered 1–150 with no duplicates (`npm run test:db`).

### 3. Data kept
`attendees` table holds only: name, NUS email, booking or walk-in, sign-up time, check-in time, number.
`settings` table is a single row: spots, check-in open/close times, walk-in release time.

---

## Why Supabase

| Option | Why not |
|---|---|
| Google Form + Sheet | No way to enforce a cap or uniqueness at the moment of submission; no check-in flow |
| Firebase / Firestore | Possible, but caps need transactions and security rules in a separate language; harder to test locally |
| Own server (Express etc.) + database | Another thing to host, secure and keep running for one night |
| **Supabase** | ✅ chosen |

What Supabase gives us:
- **Real Postgres**: transactions and row locks make the cap and unique numbering reliable, and the same SQL
  can be tested in a local Postgres (Docker) before touching the real project.
- **No backend to run**: the website calls SQL functions directly over HTTPS; Supabase handles the API.
- **Row Level Security** is built in, so the public key can be shipped in the website safely.
- **Login for organisers** is built in (Supabase Auth).
- **Free tier** comfortably covers a few hundred users for one event.

---

## What could break

### Before the event
| Risk | Effect | What to do |
|---|---|---|
| **Supabase free tier pauses inactive projects** (after about a week without activity) | Every page shows "Couldn't reach the server" | Open the Supabase dashboard a day before **and** on the day; restore the project if it says *Paused* |
| `schema.sql` changed but not re-run | Errors like "Could not find the function …" | Re-run `supabase/schema.sql` in the SQL Editor|
| Env vars missing on Vercel | Site shows "Setup needed" | Set the three `VITE_` variables in Vercel → Settings → Environment Variables, then redeploy |
| Organiser account not in `admins` | "Not an organiser" on `/admin` | See [Getting access](#getting-access) |


### Known limitations (by design)
- **Email ownership isn't verified.** The site checks the email's *format*, not that the person owns it
  (no verification email is sent). Someone could sign up with, or **cancel**, another person's booking if
  they know that person's NUS email.
- **One person, several NUS addresses**: staff with both `@nus.edu.sg` and `@u.nus.edu` addresses could
  book twice.
- **The locking design is meant for hundreds of people**, not tens of thousands. Requests queue one at a time,
  which is instant at this scale.
- **No automated messages.** Telegram updates are posted by organisers by hand.

---

## Setup and deployment

### First-time setup
1. Create a Supabase project. In **SQL Editor**, run all of `supabase/schema.sql`.
2. `cp .env.example .env` and fill in:
   - `VITE_SUPABASE_URL`: Project Settings → Data API → Project URL
   - `VITE_SUPABASE_ANON_KEY`: Project Settings → API Keys → **publishable** key (or legacy *anon* key)
   - `VITE_TELEGRAM_CHANNEL_URL`: the public Telegram channel
3. `npm install`, then `npm run dev`, and open the URL it prints.
4. Create an organiser login (see [Getting access](#getting-access)).
5. Recommended: Supabase → Authentication → Sign In / Providers → turn **off** "Allow new users to sign up",
   since organiser accounts are created by hand.

### Deploy (Vercel)
Import the GitHub repo into Vercel, add the same three `VITE_` env vars, and deploy. `vercel.json` sends
every URL to `index.html` so `/checkin` and `/admin` work when opened directly or refreshed.

### Testing the database locally
```sh
npm run test:db
```
This starts a throwaway Postgres in Docker (on macOS: `colima start` first), loads `schema.sql`, runs about
70 rule checks (`supabase/tests/logic_test.sql`), then the 200-at-once race tests. It never touches the real
project. 

To test the "full" flow on the real project, `supabase/seed_149.sql` creates 149 fake sign-ups
(`seed.test.NNN@u.nus.edu`). Remove them with:
```sql
delete from public.attendees where identifier like 'seed.test.%@u.nus.edu';
```

## Project structure

```
index.html              the single HTML page React renders into
vercel.json             send every URL to index.html (single-page app)
.env.example            template for the three VITE_ settings (.env itself is never committed)

src/
  main.jsx              starts React, maps URLs to pages
  config.js             event text and menu (edit me)
  index.css             all styles (mobile-first, light, no web fonts)
  lib/
    supabase.js         connects to Supabase using .env
    api.js              one small function per SQL function. The only file that talks to the database
    format.js           shows times in Singapore time
  hooks/
    usePublicStats.js   loads public counts/settings; helpers isFull() and checkinState()
  components/
    EventFacts.jsx      date · time · venue line
    TelegramButton.jsx  Telegram link button (hidden if no link is set)
  pages/
    Home.jsx  Signup.jsx  Full.jsx  Cancel.jsx  Checkin.jsx  Admin.jsx

supabase/
  schema.sql            tables, ALL rules (SQL functions), security. Safe to re-run
  seed_149.sql          149 fake sign-ups for testing
  tests/
    logic_test.sql      rule checks (local only)
    local/run.sh        runs everything in Docker (npm run test:db)
    local/supabase_stub.sql   fakes Supabase's auth bits for local Postgres
```
