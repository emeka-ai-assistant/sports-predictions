/**
 * NBA API client — api-sports.io v2.nba.api-sports.io
 * Free tier allows games-by-date queries. We derive form from last 14 days.
 */

const BASE_URL = 'https://v2.nba.api-sports.io'
const API_KEY  = process.env.NBA_API_KEY!
const delay = (ms: number) => new Promise(r => setTimeout(r, ms))

async function apiFetch<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { 'x-apisports-key': API_KEY },
    next: { revalidate: 3600 },
  })
  if (!res.ok) throw new Error(`NBA API ${res.status} — ${path}`)
  return res.json()
}

export interface NBAGame {
  id: number
  season: number
  date: { start: string; end: string | null; duration: string | null }
  status: { long: string; short: string; clock: string | null }
  teams: {
    home:     { id: number; name: string; nickname: string; code: string; logo: string }
    visitors: { id: number; name: string; nickname: string; code: string; logo: string }
  }
  scores: {
    home:     { points: number | null; linescore: string[] }
    visitors: { points: number | null; linescore: string[] }
  }
}

export interface NBATeamStats {
  teamId:   number
  name:     string
  wins:     number
  losses:   number
  gamesPlayed: number
  winRate:  number
  avgFor:   number   // avg points scored
  avgAgainst: number // avg points allowed
  last5:    string   // e.g. "W,W,L,W,L"
}

/** Get NBA games for a specific date (YYYY-MM-DD) */
export async function getNBAGamesByDate(date: string): Promise<NBAGame[]> {
  const data = await apiFetch<{ response: NBAGame[] }>(`/games?date=${date}`)
  return data.response || []
}

/** Get today's scheduled NBA games */
export async function getTodayNBAGames(): Promise<NBAGame[]> {
  const today = new Date().toISOString().split('T')[0]
  const games = await getNBAGamesByDate(today)
  return games.filter(g => ['Scheduled', 'Not Started', 'NS'].includes(g.status.long))
}

/**
 * Build a stats map for all NBA teams by fetching last 14 days of completed games.
 * Returns a Map<teamId, NBATeamStats>.
 * Results are ordered newest-first per team (for form calculation).
 */
export async function buildNBATeamStats(): Promise<Map<number, NBATeamStats>> {
  const allGames: NBAGame[] = []
  const today = new Date()

  // Fetch last 14 days (sequential to respect rate limits)
  for (let i = 1; i <= 14; i++) {
    const d = new Date(today)
    d.setDate(d.getDate() - i)
    const dateStr = d.toISOString().split('T')[0]
    try {
      const games = await apiFetch<{ response: NBAGame[] }>(`/games?date=${dateStr}`)
      const finished = (games.response || []).filter(g => g.status.long === 'Finished')
      allGames.push(...finished)
    } catch { /* skip */ }
    await delay(200)
  }

  // Aggregate per team
  const raw = new Map<number, {
    name: string; wins: number; losses: number; pf: number; pa: number; results: string[]
  }>()

  const ensure = (id: number, name: string) => {
    if (!raw.has(id)) raw.set(id, { name, wins: 0, losses: 0, pf: 0, pa: 0, results: [] })
  }

  for (const g of allGames) {
    const homeId  = g.teams.home.id
    const awayId  = g.teams.visitors.id
    const homeP   = g.scores.home.points     ?? 0
    const awayP   = g.scores.visitors.points ?? 0
    if (homeP === 0 && awayP === 0) continue

    ensure(homeId, g.teams.home.name)
    ensure(awayId, g.teams.visitors.name)

    const homeWon = homeP > awayP
    const home = raw.get(homeId)!
    const away = raw.get(awayId)!

    home.wins   += homeWon ? 1 : 0
    home.losses += homeWon ? 0 : 1
    home.pf     += homeP
    home.pa     += awayP
    home.results.unshift(homeWon ? 'W' : 'L')   // newest first

    away.wins   += homeWon ? 0 : 1
    away.losses += homeWon ? 1 : 0
    away.pf     += awayP
    away.pa     += homeP
    away.results.unshift(homeWon ? 'L' : 'W')
  }

  const statsMap = new Map<number, NBATeamStats>()
  raw.forEach((v, id) => {
    const gp = v.wins + v.losses
    statsMap.set(id, {
      teamId:     id,
      name:       v.name,
      wins:       v.wins,
      losses:     v.losses,
      gamesPlayed: gp,
      winRate:    gp ? v.wins / gp : 0.5,
      avgFor:     gp ? v.pf / gp : 110,
      avgAgainst: gp ? v.pa / gp : 110,
      last5:      v.results.slice(0, 5).join(','),
    })
  })

  return statsMap
}

/** Fetch H2H games between two teams this season */
export async function getNBAH2H(team1Id: number, team2Id: number): Promise<NBAGame[]> {
  try {
    const data = await apiFetch<{ response: NBAGame[] }>(
      `/games?h2h=${team1Id}-${team2Id}&season=2025`
    )
    return (data.response || []).filter(g => g.status.long === 'Finished').slice(0, 8)
  } catch {
    return []
  }
}
