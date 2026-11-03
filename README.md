# Sync Up

A web app for couples to stay in each other's loop through the day: moods, a shared status
thread, a joint journal, a daily photo drop, live location while you're on the way, day plans,
weekend dates, and a weekly recap you can share.

## How it works

- **Accounts and couples.** One partner signs up and sets up the couple with both names (the
  "start a household" joint setup). They get a 6-character invite code and link to send. The
  other partner opens it, checks their name and creates their own login. Codes work once.
- **Live sync.** Everything one of you does shows up on the other's phone within a second or two.
- **Private by design.** Privacy is enforced by the database (row level security), not just the UI:
  - a couple only ever sees its own data
  - each partner can only post as themselves
  - your partner's journal entry stays hidden until you've written yours that day
  - photos sit in a private bucket and are only shown through short-lived links
- **History is kept.** Nothing resets daily. The History section and weekly recap read from it.

## Stack

- Plain HTML, CSS and JavaScript. No build step.
- [Supabase](https://supabase.com) for accounts, the Postgres database, live updates and photo
  storage. The project is `sync-up` (London region) in the **Sync Up** organization.
- OpenStreetMap (Leaflet) for the map and Nominatim to look up destinations. Free, no API keys.

## Running it locally

It's static files, so serve the folder with anything:

```bash
python -m http.server 8000      # or: npx serve
```

Then open http://localhost:8000. It talks to the live Supabase project, so it's real data.
Location sharing only works on `localhost` or HTTPS.

## Project structure

```
index.html                  page markup (setup screens + the app)
css/app.css                 styles
js/config.js                Supabase project URL and public (anon) key
js/db.js                    data layer: accounts, loading, saving, live sync
js/app.js                   screens and features
supabase/migrations/        database schema, security rules and storage setup
supabase/config.toml        auth settings pushed to the hosted project
sync-up-spec.md             build spec (roles, screens, data model, build order)
us-app-plan.md              the original project plan
```

The anon key in `js/config.js` is meant to be public. What each person can do is decided by the
security rules in `supabase/migrations`.

## Changing the database

Add a new `.sql` file to `supabase/migrations/` (never edit one that has already been pushed),
then push it:

```bash
npx supabase db push --remote -p <database password>
```

The database password is in `.env.local` on Muzi's machine. It is git-ignored and never committed.

## Still to do

- **Email (Tlotlang).** Set up a custom SMTP provider (e.g. Resend) in the Supabase dashboard.
  Supabase's built-in email only reaches your own Supabase team. So email confirmation is
  currently off, and there's no "forgot password" yet. Add both once SMTP is in.
- **Design pass (Thato).** The new sign-up, invite and join screens use the existing styles.
- **Ads (Tlotlang)**, between sections, never over the thread or journal.
- **Push notifications.** Updates currently arrive live while the app is open.
- **Daily ritual.** Decide on "question of the day" (see the spec's open decisions).

## Team

- **Muzi**: product & core dev
- **Tlotlang**: dev & monetization (accounts/backend, ads)
- **Thato**: visual identity & design

See `sync-up-spec.md` for the full role breakdown and build order.
