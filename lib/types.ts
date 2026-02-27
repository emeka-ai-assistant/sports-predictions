export type PickType =
  | 'HOME_WIN'
  | 'AWAY_WIN'
  | 'DRAW'
  | 'OVER_1_5'
  | 'OVER_2_5'
  | 'BTTS'
  | 'ONE_UP'    // Team leads by 1 goal at ANY point = WIN

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

export interface AnalysedFixture {
  fixture: Fixture
  homeStanding?: TeamStanding
  awayStanding?: TeamStanding
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
  homeScore?: number
  awayScore?: number
  createdAt: string
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
