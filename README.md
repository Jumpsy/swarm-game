# SWARM — Neon Arena

A tight, twin-stick neon arena shooter. Survive five minutes, kill the Core, top the leaderboard.

Plain HTML/CSS/JS · single file · no build step · Vercel + Supabase for the global leaderboard.

## Play

```bash
python3 -m http.server 5174
# open http://localhost:5174
```

## Controls

- `W A S D` / arrows — move
- `MOUSE` — aim
- `LMB` hold — fire
- `R` or `RMB` — blink (short teleport + shockwave, 3s cd)
- `ESC` — pause · `M` — mute

## Loop

5 enemy types, 12 stackable upgrades across common/rare/epic rarities. Mid-boss at 2:30. Final boss (the Core) at 5:00 — kill it to win the run.

XP shards drop from kills and magnet to you when close. Each level-up offers 3 upgrades. Chain kills within 2 seconds to multiply score (capped at ×8).

## Deploy

1. Create a Supabase project, run `supabase/schema.sql` in the SQL editor.
2. `vercel link` then set env vars:
   - `SUPABASE_URL`
   - `SUPABASE_ANON_KEY`
3. (Optional) `ADSENSE_CLIENT_ID` / `ADSENSE_SLOT_ID` for monetization.
4. `vercel --prod`.

## Files

```
index.html             — game (single file)
api/leaderboard.js     — GET top 10 / POST a run
api/config.js          — public config (AdSense ids)
api/ads-txt.js         — ads.txt route
supabase/schema.sql    — Postgres schema with RLS
vercel.json            — rewrites
```

## Credits

Code: Jacob Hurvitz · rebuilt with Claude Code · MIT license.
