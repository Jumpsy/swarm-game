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
