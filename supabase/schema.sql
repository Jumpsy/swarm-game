-- SWARM global leaderboard schema. Run once in Supabase SQL editor.

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_name text NOT NULL CHECK (char_length(user_name) <= 14),
  time_seconds int NOT NULL CHECK (time_seconds >= 0 AND time_seconds <= 18000),
  kills int NOT NULL CHECK (kills >= 0),
  level int NOT NULL CHECK (level >= 0),
  wave int NOT NULL CHECK (wave >= 0),
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS runs_time_kills_idx ON runs (time_seconds DESC, kills DESC);

ALTER TABLE runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY allow_insert_for_all ON runs
  FOR INSERT TO anon WITH CHECK (true);

CREATE POLICY allow_select_for_all ON runs
  FOR SELECT TO anon USING (true);

-- Lobbies table for online co-op matchmaking
CREATE TABLE IF NOT EXISTS lobbies (
  room_id text PRIMARY KEY,
  players jsonb NOT NULL DEFAULT '[]'::jsonb,
  last_updated timestamptz DEFAULT now()
);

ALTER TABLE lobbies ENABLE ROW LEVEL SECURITY;

CREATE POLICY allow_insert_lobbies ON lobbies
  FOR INSERT TO anon WITH CHECK (true);

CREATE POLICY allow_select_lobbies ON lobbies
  FOR SELECT TO anon USING (true);

CREATE POLICY allow_update_lobbies ON lobbies
  FOR UPDATE TO anon USING (true) WITH CHECK (true);

-- Global shared AI-generated NPC table
CREATE TABLE IF NOT EXISTS global_npcs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  color text NOT NULL,
  skin text NOT NULL,
  hp int NOT NULL,
  speed int NOT NULL,
  xp int NOT NULL,
  description text NOT NULL,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE global_npcs ENABLE ROW LEVEL SECURITY;

CREATE POLICY allow_select_npcs ON global_npcs
  FOR SELECT TO anon USING (true);

CREATE POLICY allow_insert_npcs ON global_npcs
  FOR INSERT TO anon WITH CHECK (true);


