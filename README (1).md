# Sync Up

A shared web app for two people to stay in each other's loop through the day — moods, status updates, plans, weekend dates, joint journaling, a daily photo drop, and live location while driving.

## Files

- `index.html` — the app itself (same as `sync-up.html`, duplicated so GitHub Pages serves it automatically at the repo root)
- `sync-up.html` — the app source
- `sync-up-spec.md` — the full build spec for the team (roles, screens, feature specs, data model, build order)
- `us-app-plan.md` — the original project plan (concept, team, monetization, roadmap)

## Running it

It's a single self-contained HTML file — no build step, no dependencies to install.

- **Locally:** just open `index.html` in a browser
- **GitHub Pages:** push this repo, then enable Pages in repo settings (Settings → Pages → deploy from `main` branch, root folder) — it'll be live at `https://<username>.github.io/<repo>/`

## Current state — read before building on this

This is a **front-end prototype**, not production code:

- **Storage** currently uses Claude artifact key-value storage (`window.storage`), which only works inside Claude.ai. Once hosted elsewhere (GitHub Pages, Vercel, etc.), this needs to be swapped for a real backend — see `sync-up-spec.md` section 8 for the recommended approach (Firebase Auth or Supabase).
- **Login/signup** is a visual mockup — passwords are stored in plain text in the same storage as everything else. Not secure. Real auth is Tlotlang's first task per the spec.
- **Maps/driving** uses free OpenStreetMap tiles (Leaflet) and browser geolocation — no API key needed, this part works as-is anywhere.
- **Photos** are compressed client-side and stored as base64 — fine for a prototype, but a real image host (e.g. S3, Cloudinary) is worth considering once there are real users.

## Team

- **Muzi** — product & core dev
- **Tlotlang** — dev & monetization (accounts/backend, ads)
- **Thato** — visual identity & design

See `sync-up-spec.md` for the full role breakdown and build order.
