# SWARM Privacy Policy

_Last updated: 2026-05-24._

SWARM is a browser game. This policy explains what we collect, why, and how to delete it.

## What we collect

- **Display name** — the 1–14 character tag you choose in-game. Stored in your browser's localStorage. Submitted to the global leaderboard with each run.
- **Run statistics** — time survived, kills, level reached, wave reached. Stored in localStorage and submitted to the global leaderboard on game over.
- **Game settings** — volume, screen shake, ad slot toggle. Local only.
- **No accounts. No emails. No passwords. No PII.**

We do not use cookies. We do not run analytics or trackers. The only outbound network calls the game makes are:
1. Loading the page itself
2. POST to `/api/leaderboard` on game-over (sending only the fields above)
3. GET from `/api/leaderboard` when you open the leaderboard

## Where it's stored

- **Locally** in your browser's localStorage. Clearing site data removes everything.
- **Server-side** in a Supabase Postgres database, fields: name, time, kills, level, wave, created timestamp. No IP addresses are stored; rate-limit checks are in-memory and discarded.

## Ad slot

The game reserves a 728×60 ad placeholder. **No ad code is loaded in this build**, so no third-party tracking is active. If you (the operator) later integrate an ad network like Google AdSense, you must update this policy to disclose what they collect.

## Removing your data

- **Local:** clear site data for the game's domain in your browser.
- **Global leaderboard:** email the operator (see README contact) with your display name; entries will be removed within 7 days.

## Children

The game is rated for general audiences but contains stylized combat. No data collected differs by age. Operators in jurisdictions requiring COPPA/GDPR-K compliance should review this before publishing.

## Contact

File an issue at the project's GitHub repository.
