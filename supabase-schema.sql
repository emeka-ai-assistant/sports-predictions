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
