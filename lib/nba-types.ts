export type NBAPickType = 'HOME_WIN' | 'AWAY_WIN' | 'OVER' | 'UNDER'
export type ResultType  = 'WIN' | 'LOSS' | 'VOID'

export interface NBATeamMeta {
  id:       number
  name:     string
  nickname: string
  code:     string
  logo:     string
}

export interface NBAPrediction {
  id:          string
  gameId:      number
  homeTeam:    string
  awayTeam:    string
  homeLogo:    string
  awayLogo:    string
  homeCode:    string
  awayCode:    string
  gameDate:    string   // YYYY-MM-DD
  kickoff:     string   // HH:mm WAT
  pick:        NBAPickType
  pickLabel:   string   // "Celtics to Win" | "Over 228.5 Pts"
  line?:       number   // OVER/UNDER total line
  confidence:  number
  reasoning:   string[]
  result?:     ResultType
  homeScore?:  number
  awayScore?:  number
  createdAt:   string
}
