# Sync Up — Build Spec

For: Muzi (product/dev), Tlotlang (dev/monetization), Thato (design)

## 1. What we're building

A web app for couples to stay in each other's loop through the day — moods, live status updates, plans, weekend dates, and location while driving. Not a calendar, not a chat app: a running shared "thread" of the day.

## 2. Team & responsibilities

| Person | Owns |
|---|---|
| **Muzi** | Product decisions, feature logic, driving/map integration, overall priority calls |
| **Tlotlang** | Accounts/auth, backend & hosting, ad integration, monetization |
| **Thato** | Logo, icon, color & type system, all screen designs, onboarding flow |

## 3. Current status

Build order steps 1 to 4 are done (November 2026):

- **Accounts & auth:** real email/password accounts on Supabase, with the joint couple setup and a single-use invite code/link for the second partner.
- **Real backend:** per-couple tables, live sync between phones, full history kept, photos in private storage. Privacy is enforced by row level security in the database.
- **Driving auto-stop:** destination lookup (Nominatim), ETA, and auto-stop within an arrival radius, for car, Uber/Bolt, Gautrain and taxi/bus.
- **Free feature pass:** journaling (private until both have written), photo drop, streaks, countdown banner, reactions, plus "thinking of you" and a shareable weekly recap.

Still open: custom SMTP for email confirmation and password reset (see the README), the design pass, ads, and launch.

## 4. Screens / information architecture

1. **Sign up / Couple setup** (new) — Sims-4-style joint setup: create account, both partners' names entered as one guided flow
2. **Login** (new) — email + password
3. **Home / Today** — mood cards for both partners, quick status composer, today's thread
4. **Driving** — start/stop, live map, auto-stop on arrival
5. **Day plans** — each partner's timed schedule
6. **Weekend / Dates** — planned dates list, add new
7. **Journal** (new) — joint journaling entry point
8. **History** (new) — past days, "on this day" view
9. **Verse / Ritual** — daily verse + whichever ritual we pick (see open decisions)
10. **Settings** — account details, notifications, log out

## 5. Feature specs

### 5.1 Accounts & login (Tlotlang — priority 1)
- Email + password signup and login
- Signup flow: one partner starts setup, invites the other (via email or a shared code) to complete the "couple profile" together — modeled on creating a family in Sims 4
- Needs a real backend/auth provider (Firebase Auth or Supabase recommended — free tier covers early usage)
- Replaces the current "anyone with the link" access model

### 5.2 History (Muzi/Tlotlang — priority 2)
- No daily reset — all moods, statuses, and journal entries persist
- Requires the app's data layer to move from the current shared-key storage to real per-couple records in the backend
- Powers the "on this day" / weekly recap views later

### 5.3 Driving auto-stop (Muzi — priority 2)
- Currently manual start/stop
- Add: when a destination is set, compare live location to destination coordinates; auto-stop sharing once within a small radius (e.g. ~150m)
- Needs destination to be geocoded (address/place → coordinates) — can still use free OpenStreetMap (Nominatim) for this

### 5.4 Joint journaling (Muzi — priority 3, first of the "free feature pass")
- Each partner writes a private entry for the day
- Entries unlock and become visible to both once **both** have written that day
- Open decision: fully shared single entry vs. this private-then-unlock model (leaning unlock — makes writing feel less self-conscious)

### 5.5 Shared photo drop (priority 3)
- One photo per person per day, shown side by side on that day's entry

### 5.6 Streaks (priority 3)
- Count consecutive days both partners checked in (mood or status counts)
- Show streak count somewhere visible on Home

### 5.7 Countdown banner (priority 3)
- Small banner showing days until the next planned weekend date, pulled from the existing date planner

### 5.8 Reactions on thread (priority 3)
- Tap a heart (or similar) on a partner's status update instead of replying with text

### 5.9 Ads (Tlotlang — priority 4)
- Free to use; ads fund it instead of charging upfront
- Placement: between sections, never inside/over the thread or journal — protect the emotional core of the app from feeling commercial
- Revisit a paid/ad-free tier only once there's a real user base

## 6. Data model (rough)

- **Couple** — id, created date
- **User** — id, couple_id, name, email, password hash
- **MoodEntry** — user_id, date, emoji, label, note, timestamp
- **StatusUpdate** — user_id, date, text, timestamp
- **ScheduleItem** — user_id, date, time, activity
- **DatePlan** — couple_id, title, date, time, notes, added_by
- **JournalEntry** — user_id, date, text, photo_url (optional), unlocked (bool)
- **DrivingSession** — user_id, active, destination, lat, lng, started_at, ended_at

## 7. Design brief for Thato

- Current placeholder direction: dark background, warm two-color system (amber for one partner, rose for the other), serif display type for headers, a "thread" visual motif running through the timeline
- Needed: a real logo/icon for **Sync Up**, a refined color and type system (can keep or replace the placeholder direction), and full designs for the new screens (signup/couple-setup, journal, history)
- Keep the "two people, one thread" idea somewhere in the visual language if possible — it's the core metaphor of the app

## 8. Technical requirements for Tlotlang

- Pick and set up backend/auth (Firebase Auth or Supabase)
- Design the database schema (see section 6) and migrate off the current artifact-based shared storage
- Set up real hosting (GitHub Pages for static, or Vercel/Netlify if a backend framework is used)
- Integrate an ad network once accounts + hosting are stable
- Geocoding for driving destinations (OpenStreetMap Nominatim, free)

## 9. Build order

1. Accounts & auth
2. Data migration to real backend (unlocks history)
3. Driving auto-stop
4. Journaling → photo drop → streaks → countdown → reactions
5. Design pass across all screens
6. Ad integration
7. Public launch

## 10. Open decisions

- ~~Journaling: fully shared entries, or private-then-unlock?~~ Decided: private-then-unlock, enforced by the database.
- Daily ritual beyond the verse: leaning toward "question of the day" with a reveal-once-both-answer mechanic — needs a final call
- Notifications: push (needs more backend work) vs. check-when-you-open-it for now
