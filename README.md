# SWARM — Browser Horde-Survival Roguelite

A single-file canvas-2D survivor-like. WASD to move, dash on Space, weapons auto-fire, level up to pick from 3 cards, survive as long as you can.

**Stack:** Plain HTML/CSS/JS · Vercel (static + serverless functions) · Supabase Postgres (global leaderboard).

## Features

- 6 stacking weapons (Pulse, Blades, Lightning, Mines, Flame, Drone), each 1→5
- 17 passive upgrades across 4 rarity tiers
- 9 enemy types incl. shielded, exploder, spitter, spawner, boss
- Dash with iframes · Combo counter · Screen shake · Damage numbers
- Local + global leaderboard
- localStorage account (username), coins
- Synthesized SFX + background music

## Run locally

```bash
python3 -m http.server 5174
# open http://localhost:5174
```

## Deploy

1. Create a Supabase project at https://supabase.com. In SQL Editor run `supabase/schema.sql`.
2. Copy your project URL and `anon public` key from Project Settings → API.
3. Install Vercel CLI: `npm i -g vercel`. Then `vercel link` in this folder.
4. Set env: `vercel env add SUPABASE_URL` and `vercel env add SUPABASE_ANON_KEY`.
5. Deploy: `vercel --prod`.
6. (Optional) Buy a domain in the Vercel dashboard → Domains.

## Project layout

```
index.html              — game (single file, no build step)
api/leaderboard.js      — Vercel serverless function (GET top 10, POST a run)
supabase/schema.sql     — Postgres schema with RLS + indexes
vercel.json             — Vercel rewrites
package.json            — Node deps for serverless functions
LICENSE                 — MIT
PRIVACY.md / TERMS.md   — legal
```

## Legal

See `PRIVACY.md` and `TERMS.md`. The game is original code, MIT-licensed. No third-party assets — visuals are primitives, audio is synthesized at runtime.

## Roadmap

- Persistent coin shop (permanent stat boosts)
- Weapon evolution (level 5 + matching passive at boss kill = evolved weapon)
- Character select (Soldier / Scout / Heavy / Scientist / Pyro / Hacker)
- Daily challenge mode (deterministic seed)
- Achievements
- Multiple maps
- Mobile touch controls

## Credits

Code: Jacob Hurvitz · Assisted by Claude Code.
