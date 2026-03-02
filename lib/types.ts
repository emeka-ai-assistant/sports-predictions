export type PickType =
  | 'HOME_WIN'
  | 'AWAY_WIN'
  | 'DRAW'
  | 'OVER_0_5'          // At least 1 goal in the match
  | 'OVER_1_5'
  | 'OVER_2_5'
  | 'UNDER_1_5'         // Fewer than 2 goals
  | 'UNDER_2_5'         // Fewer than 3 goals
  | 'BTTS'              // Both teams score — Yes
  | 'NO_BTTS'           // Both teams score — No
  | 'ONE_UP'            // Team leads by 1+ goal at ANY point = WIN
  | 'TWO_UP'            // Team leads by 2+ goals at ANY point = WIN
  | 'HANDICAP_PLUS_1'   // Team gets +1 goal start. WIN if they win or draw. LOSE if they lose by 2+
  | 'HANDICAP_PLUS_2'   // Team gets +2 goal start. WIN if they win, draw or lose by 1. LOSE if they lose by 3+

// Market types for per-match breakdown display
export type MarketType = '1X2' | 'GG' | 'OVER_1_5' | 'OVER_2_5'

export type ResultType = 'WIN' | 'LOSS' | 'VOID'

export interface TeamStanding {
  position: number
  team: { id: number; name: string; crest: string }
  points: number
  won: number
  draw: number
  lost: number
  goalsFor: number
  goalsAgainst: number
  goalDifference: number
  form: string | null
  playedGames: number
}

export interface FixtureTeam {
  id: number
  name: string
  crest: string
}

export interface Fixture {
  id: number
  homeTeam: FixtureTeam
  awayTeam: FixtureTeam
  competition: { id: number; name: string; code: string; emblem: string }
  utcDate: string
  status: string
  score?: {
    fullTime: { home: number | null; away: number | null }
  }
}

export interface H2HStats {
  meetings: number       // number of recent meetings analysed
  avgGoals: number       // average total goals per meeting
  over05Rate: number     // % of meetings with 1+ goal (0–1)
  over15Rate: number     // % of meetings with 2+ goals (0–1)
  over25Rate: number     // % of meetings with 3+ goals (0–1)
  bttsRate: number       // % of meetings where both scored (0–1)
  // Win rates from the perspective of the CURRENT fixture's teams
  homeWinRate: number    // % the current home team won in H2H history
  awayWinRate: number    // % the current away team won in H2H history
  drawRate: number       // % draws in H2H history
}

export interface AnalysedFixture {
  fixture: Fixture
  homeStanding?: TeamStanding
  awayStanding?: TeamStanding
  h2h?: H2HStats
  pick: PickType
  pickLabel: string
  confidence: number
  reasoning: string[]
}

export interface Prediction {
  id: string
  matchId: number
  homeTeam: string
  awayTeam: string
  homeCrest: string
  awayCrest: string
  competition: string
  competitionCode: string
  competitionEmblem: string
  matchDate: string
  kickoff: string
  pick: PickType
  pickLabel: string
  confidence: number
  reasoning: string[]
  odds?: number
  result?: ResultType
  homeScore?: number       // Full-time home goals
  awayScore?: number       // Full-time away goals
  htHomeScore?: number     // Half-time home goals
  htAwayScore?: number     // Half-time away goals
  createdAt: string
}

// A single market prediction within a match card
export interface MatchMarket {
  marketType: MarketType
  pick: PickType        // the predicted pick type (e.g. HOME_WIN, BTTS, OVER_1_5)
  predLabel: string     // human label for the prediction (e.g. "Arsenal FC", "Yes", "Over")
  confidence: number
  reasoning: string[]
  result?: ResultType
  actualLabel?: string  // what actually happened (e.g. "Home Win", "No", "Under")
}

export interface HistoryStats {
  total: number
  wins: number
  losses: number
  voids: number
  pending: number
  winRate: number
  roi: number
}

export interface AccumulatorEntry {
  id: string
  date: string          // YYYY-MM-DD
  amount: number        // amount staked that day (carried forward from previous)
  odds: number          // combined odds for the day
  accumulatorTotal: number | null  // null while pending; amount × odds on WIN, 500 on LOSS
  status: 'WIN' | 'LOSS' | 'PENDING'
  pickCount: number     // number of picks in the combo
  pickSummary: string[] // ["Arsenal HOME_WIN @ 1.85", ...]
  createdAt: string
}
