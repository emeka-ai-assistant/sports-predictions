-- Run this in your Supabase SQL Editor
-- Project: sports-predictions

CREATE TABLE IF NOT EXISTS predictions (
  id                  TEXT PRIMARY KEY,
  match_id            INTEGER NOT NULL,
  home_team           TEXT NOT NULL,
  away_team           TEXT NOT NULL,
  home_crest          TEXT DEFAULT '',
  away_crest          TEXT DEFAULT '',
  competition         TEXT NOT NULL,
  competition_code    TEXT NOT NULL DEFAULT '',
  competition_emblem  TEXT DEFAULT '',
  match_date          DATE NOT NULL,
  kickoff             TEXT NOT NULL,
  pick                TEXT NOT NULL,
  pick_label          TEXT NOT NULL,
  confidence          INTEGER NOT NULL,
  reasoning           JSONB NOT NULL DEFAULT '[]',
  odds                DECIMAL(6,2),
  result              TEXT CHECK (result IN ('WIN','LOSS','VOID')),
  home_score          INTEGER,
  away_score          INTEGER,
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW()
);

-- Index for fast date queries
CREATE INDEX IF NOT EXISTS idx_predictions_match_date ON predictions(match_date DESC);

-- Enable Row Level Security
ALTER TABLE predictions ENABLE ROW LEVEL SECURITY;

-- Allow public read + write (you can restrict this later with auth)
CREATE POLICY "Public access" ON predictions
  FOR ALL USING (true) WITH CHECK (true);

-- Auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER predictions_updated_at
  BEFORE UPDATE ON predictions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ─────────────────────────────────────────────────────────────────────────────
-- Standings cache (prevents hitting the 10 req/min free-tier rate limit)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS standings_cache (
  competition_code  TEXT PRIMARY KEY,   -- e.g. 'PL', 'BL1', 'SA'
  standings         JSONB NOT NULL,     -- full standings array
  fetched_at        TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE standings_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public access" ON standings_cache
  FOR ALL USING (true) WITH CHECK (true);

-- ─────────────────────────────────────────────────────────────────────────────
-- Accumulator tracking table
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS accumulator_entries (
  id                  TEXT PRIMARY KEY,         -- e.g. "2026-02-27-accum"
  date                DATE NOT NULL UNIQUE,     -- one entry per day
  amount              DECIMAL(12,2) NOT NULL,   -- stake amount (NGN)
  odds                DECIMAL(8,3) NOT NULL,    -- combined odds for the day
  accumulator_total   DECIMAL(12,2),            -- NULL while pending; result after WIN/LOSS
  status              TEXT NOT NULL DEFAULT 'PENDING'
                        CHECK (status IN ('WIN','LOSS','PENDING')),
  pick_count          INTEGER NOT NULL DEFAULT 1,
  pick_summary        JSONB NOT NULL DEFAULT '[]',  -- ["Arsenal vs Man City — Home Win @ 1.85"]
  created_at          TIMESTAMPTZ DEFAULT NOW()
);

-- Index for chronological listing
CREATE INDEX IF NOT EXISTS idx_accumulator_entries_date ON accumulator_entries(date DESC);

-- Enable Row Level Security
ALTER TABLE accumulator_entries ENABLE ROW LEVEL SECURITY;

-- Allow public read + write
CREATE POLICY "Public access" ON accumulator_entries
  FOR ALL USING (true) WITH CHECK (true);
