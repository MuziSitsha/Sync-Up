# Us — Project Plan

A shared web app for two people to stay in each other's loop through the day: moods, live status updates, plans, weekend dates, and location while driving.

## Concept

Not a calendar, not a chat app — a running "thread" of the day that both people can glance at. Each partner sets their mood, posts quick status updates ("in a meeting," "driving," "free"), and plans what they're doing so the other doesn't have to ask.

## Core Features (v1 — built)

- **Names & identity** — each person sets up their name once and picks "which one am I" on their own device
- **Mood check-in** — emoji + label + optional note, timestamped, visible to both
- **Status updates / thread** — quick-tap chips (in a meeting, at work, free, etc.) or free text, posted to a shared timestamped feed
- **Day plans** — each partner has their own timed schedule (e.g. 09:00 — team standup) visible to both
- **Weekend date planner** — simple list of planned dates with title, date, time, no external calendar needed
- **Verse of the day** — rotates automatically, same verse for both
- **Driving / location sharing** — start driving, optional destination, live location shared on a free OpenStreetMap map; stop when you arrive

## Tech / Cost

- Single-file web app, works as a Claude artifact — no hosting cost, no accounts, no API keys
- Location: browser's built-in geolocation (free)
- Maps: OpenStreetMap tiles via Leaflet (free, no key)
- Data: shared key-value storage tied to the artifact — updates sync every ~5 seconds while the page is open
- **Free to run** — no backend, no subscription, no paid map API

## Known limitations (current build)

- Only syncs while the tab/app is open (polls every 5s) — not true push notifications
- Anyone with the link can open it — no password, fine for two people but not private beyond that
- Driving location only updates while that browser tab stays active and awake

## Team & Roles

- **Muzi — product & core dev.** Owns features, the shared-state/sync logic, driving/map integration, and prioritizing what ships next.
- **Tlotlang — dev & monetization.** Ad integration (network setup, placement), plus infra/hosting once it moves off being a Claude artifact.
- **Thato — visual identity.** Logo, icon, onboarding screens, and polishing the mood/status UI so it feels inviting rather than like a dashboard.

## Monetization

- Free to use from launch — ads (via Tlotlang) fund it instead of charging users upfront
- Revisit a paid/premium tier later once there's a real user base, not before

## Accounts / Login

- Move away from "anyone with the link can open it" to real accounts: email + password, one login per person
- Onboarding modeled on creating a family in Sims 4 — a couple signs up together and fills in both partners' details (names, maybe a shared "couple" profile) as one guided setup, rather than each person independently registering
- This is a bigger technical step than the current build: needs a real backend/auth service (e.g. Firebase Auth or Supabase) instead of the current artifact-based shared storage — a good first infra task for Tlotlang once the app moves off Claude

## Feature Roadmap (free features first, paid ideas parked for later)

**Next up — free, high impact, low effort:**
1. Joint journaling — shared daily entry, or private entries that unlock for both once both have written
2. Shared photo drop — one photo a day each, side by side
3. Streaks — track consecutive days both partners checked in
4. Countdown banner to the next planned weekend date
5. Reactions on thread updates (tap a heart instead of replying)

**Later — once accounts/login exist:**
- Memory timeline / "on this day" — needs real accounts to store history long-term
- Voice notes
- Premium tier (ad-free, extra themes, etc.) — only after there's a real user base

## Build Plan / Next Steps

1. **Test together** — both open the same link, each pick your name, try posting updates back and forth
2. **Accounts** — Tlotlang sets up email/password auth + the Sims-style couple onboarding
3. **Free feature pass** — journaling, photo drop, streaks, countdown banner, reactions (in that order)
4. **Decide on hosting** — move off Claude artifact to a free static host (e.g. GitHub Pages, Vercel, Netlify) once accounts are in place
5. **Ad integration** — Tlotlang picks an ad network and non-intrusive placement (e.g. between sections, not over the thread)
6. **Design pass** — Thato reworks visuals once core features are stable, so effort isn't wasted on screens that still change
7. **Notifications** — explore push notifications later, or stick with "check when you open it" for now
8. **Privacy** — accounts replace the need for a shared passcode

## Decisions

- **History** — full history is kept (no daily reset); ties into the memory timeline feature once accounts exist
- **Driving** — auto-stops when the destination is reached (needs geofencing / distance-to-destination check, not just a manual button)

## Daily Ritual Ideas (beyond verse of the day)

- **Question of the day** — a shared prompt both answer separately, revealed once both have replied (e.g. "what made you smile today")
- **Gratitude line** — one sentence each, "today I'm grateful for…", shown together
- **Mini goal for the day** — each sets one small intention, the other can cheer it on
- **"Thinking of you" button** — a single tap that just sends a heart/notification, no text needed, for when there's nothing to say but you want to check in
- **Weekly recap** — Sunday summary pulling from the history: moods across the week, days you both journaled, dates you went on

Worth picking one or two rather than stacking all of them — a ritual only works if it's light enough to actually do daily.

## Open Questions

- Journaling: shared entries, or private-then-unlock?
