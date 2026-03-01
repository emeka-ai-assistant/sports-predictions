import { Fixture, TeamStanding, H2HStats } from './types'

/** Build a form string (e.g. "W,D,L,W,W") for each team from recent finished matches. */
export function computeFormMap(matches: any[]): Map<number, string> {
  const raw = new Map<number, string[]>()

  // Sort descending so we pick the 5 most-recent first
  const finished = matches
    .filter(m => m.score?.winner && m.score?.fullTime?.home !== null)
    .sort((a, b) => new Date(b.utcDate).getTime() - new Date(a.utcDate).getTime())

  for (const m of finished) {
    const homeId: number = m.homeTeam?.id
    const awayId: number = m.awayTeam?.id
    const winner: string = m.score.winner // 'HOME_TEAM' | 'AWAY_TEAM' | 'DRAW'

    if (!raw.has(homeId)) raw.set(homeId, [])
    if (!raw.has(awayId)) raw.set(awayId, [])

    const hForm = raw.get(homeId)!
    const aForm = raw.get(awayId)!

    if (hForm.length < 5) hForm.push(winner === 'HOME_TEAM' ? 'W' : winner === 'DRAW' ? 'D' : 'L')
    if (aForm.length < 5) aForm.push(winner === 'AWAY_TEAM' ? 'W' : winner === 'DRAW' ? 'D' : 'L')
  }

  const out = new Map<number, string>()
  raw.forEach((arr, id) => out.set(id, arr.join(',')))
  return out
}
import { supabase } from './supabase'

const BASE_URL = 'https://api.football-data.org/v4'
const API_KEY = process.env.FOOTBALL_API_KEY!
const STANDINGS_CACHE_TTL_HOURS = 12

export const SUPPORTED_LEAGUES = ['PL', 'BL1', 'PD', 'SA', 'FL1', 'CL', 'DED', 'PPL', 'ELC']

async function apiFetch<T>(path: string, tag?: string): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { 'X-Auth-Token': API_KEY },
    next: {
      revalidate: 3600,
      tags: ['predictions', tag ?? 'football-data'].filter(Boolean),
    },
  })
  if (!res.ok) {
    throw new Error(`Football API error: ${res.status} — ${path}`)
  }
  return res.json()
}

const delay = (ms: number) => new Promise(r => setTimeout(r, ms))

/**
 * Fetch today's fixtures per competition, plus recent completed matches for form calculation.
 * Expands date range to last 6 weeks so we can compute our own form (free tier returns form=null).
 * Returns fixtures for today AND a formMap (teamId → "W,D,L,W,D" last-5 string).
 */
export async function getTodayFixtures(): Promise<{ fixtures: Fixture[]; formMap: Map<number, string> }> {
  const today = new Date().toISOString().split('T')[0]
  const sixWeeksAgo = new Date()
  sixWeeksAgo.setDate(sixWeeksAgo.getDate() - 42)
  const fromDate = sixWeeksAgo.toISOString().split('T')[0]

  const allMatches: any[] = []
  const todayFixtures: Fixture[] = []

  for (const code of SUPPORTED_LEAGUES) {
    try {
      const data = await apiFetch<{ matches: any[] }>(
        `/competitions/${code}/matches?dateFrom=${fromDate}&dateTo=${today}`,
        `fixtures-${code}`
      )
      if (data.matches?.length) {
        // Today's scheduled/live games
        const todays = data.matches.filter(m =>
          m.utcDate.startsWith(today) && ['TIMED', 'SCHEDULED', 'IN_PLAY', 'PAUSED'].includes(m.status)
        )
        todayFixtures.push(...todays)
        // All matches (including finished) for form computation
        allMatches.push(...data.matches)
      }
    } catch (e) {
      console.error(`Failed to fetch fixtures for ${code}:`, e)
    }
    await delay(350)
  }

  const formMap = computeFormMap(allMatches)
  return { fixtures: todayFixtures, formMap }
}

export async function getFixturesByDate(dateFrom: string, dateTo: string): Promise<Fixture[]> {
  const all: Fixture[] = []
  for (const code of SUPPORTED_LEAGUES) {
    try {
      const data = await apiFetch<{ matches: Fixture[] }>(
        `/competitions/${code}/matches?dateFrom=${dateFrom}&dateTo=${dateTo}`,
        `fixtures-range-${code}`
      )
      if (data.matches?.length) all.push(...data.matches)
    } catch (e) {
      console.error(`Failed to fetch fixtures for ${code}:`, e)
    }
    await delay(350)
  }
  return all
}

/**
 * Get standings for a competition.
 * Checks Supabase cache first (12-hour TTL) before hitting football-data.org.
 * This keeps us well under the free-tier 10 req/min limit.
 */
export async function getStandings(competitionCode: string): Promise<TeamStanding[]> {
  // ── 1. Try Supabase cache ─────────────────────────────────────────────
  try {
    const { data } = await supabase
      .from('standings_cache')
      .select('standings, fetched_at')
      .eq('competition_code', competitionCode)
      .single()

    if (data?.standings) {
      const ageMs = Date.now() - new Date(data.fetched_at).getTime()
      if (ageMs < STANDINGS_CACHE_TTL_HOURS * 3600_000) {
        return data.standings as TeamStanding[]
      }
    }
  } catch { /* cache miss — fall through to API */ }

  // ── 2. Fetch fresh from football-data.org + save to cache ─────────────
  try {
    const apiData = await apiFetch<{
      standings: { type: string; table: TeamStanding[] }[]
    }>(`/competitions/${competitionCode}/standings`, `standings-${competitionCode}`)

    const total = apiData.standings?.find(s => s.type === 'TOTAL')
    const table = total?.table || []

    await supabase
      .from('standings_cache')
      .upsert(
        { competition_code: competitionCode, standings: table, fetched_at: new Date().toISOString() },
        { onConflict: 'competition_code' }
      )

    return table
  } catch (e) {
    console.error(`Failed to fetch standings for ${competitionCode}:`, e)
    return []
  }
}

/**
 * Fetch standings for multiple competitions.
 * Mostly reads from Supabase cache — only hits the API for stale/missing entries.
 */
export async function getMultipleStandings(codes: string[]): Promise<Map<string, TeamStanding[]>> {
  const map = new Map<string, TeamStanding[]>()
  for (const code of codes) {
    const standings = await getStandings(code)
    if (standings.length > 0) map.set(code, standings)
    await delay(100) // small delay — mostly cache reads, so no rate limit concern
  }
  return map
}

/**
 * Fetch head-to-head stats for a fixture.
 * Returns historical goal averages, over-rates, and BTTS rate.
 */
/**
 * Fetch head-to-head stats for a fixture.
 * homeTeamId / awayTeamId = the current fixture's teams — used to normalise
 * win rates correctly regardless of who was "home" in past meetings.
 */
export async function getH2H(
  fixtureId: number,
  homeTeamId: number,
  awayTeamId: number
): Promise<H2HStats | null> {
  try {
    const data = await apiFetch<{ matches: any[] }>(
      `/matches/${fixtureId}/head2head?limit=10`,
      `h2h-${fixtureId}`
    )
    const matches = data.matches || []
    if (matches.length === 0) return null

    const settled = matches.filter(m =>
      m.score?.fullTime?.home !== null && m.score?.fullTime?.away !== null
    )
    if (settled.length === 0) return null

    const n = settled.length

    // Total goals per meeting
    const totalGoals = settled.map(m =>
      (m.score.fullTime.home || 0) + (m.score.fullTime.away || 0)
    )

    // Win/draw rates — normalised from the current fixture's home-team perspective.
    // In each historical meeting the "home" team might be either side, so we use
    // team IDs to figure out who actually won each game.
    let homeWins = 0, awayWins = 0, draws = 0
    for (const m of settled) {
      const winner = m.score?.winner // 'HOME_TEAM' | 'AWAY_TEAM' | 'DRAW' | null
      const mHomeId = m.homeTeam?.id
      const mAwayId = m.awayTeam?.id
      if (winner === 'DRAW') {
        draws++
      } else if (winner === 'HOME_TEAM') {
        // Home team in that meeting won — map to current fixture perspective
        if (mHomeId === homeTeamId) homeWins++
        else if (mHomeId === awayTeamId) awayWins++
      } else if (winner === 'AWAY_TEAM') {
        if (mAwayId === homeTeamId) homeWins++
        else if (mAwayId === awayTeamId) awayWins++
      }
    }

    return {
      meetings: n,
      avgGoals: totalGoals.reduce((a, b) => a + b, 0) / n,
      over05Rate: totalGoals.filter(g => g >= 1).length / n,
      over15Rate: totalGoals.filter(g => g >= 2).length / n,
      over25Rate: totalGoals.filter(g => g >= 3).length / n,
      bttsRate:   settled.filter(m =>
        m.score.fullTime.home > 0 && m.score.fullTime.away > 0
      ).length / n,
      homeWinRate: homeWins / n,
      awayWinRate: awayWins / n,
      drawRate:    draws   / n,
    }
  } catch (e) {
    console.error(`Failed to fetch H2H for fixture ${fixtureId}:`, e)
    return null
  }
}

/**
 * Pre-warm standings cache for ALL supported leagues.
 * Called by the daily 7 AM cron so predictions never need to hit the API for standings.
 */
export async function prefetchAllStandings(): Promise<Map<string, TeamStanding[]>> {
  console.log('[CRON] Pre-warming standings for all leagues...')
  const map = new Map<string, TeamStanding[]>()

  for (const code of SUPPORTED_LEAGUES) {
    try {
      // Force fresh fetch by deleting cache first
      await supabase.from('standings_cache').delete().eq('competition_code', code)
      const standings = await getStandings(code)
      if (standings.length > 0) {
        map.set(code, standings)
        console.log(`[CRON] ✓ ${code}: ${standings.length} teams cached`)
      }
    } catch (e) {
      console.error(`[CRON] Failed to cache standings for ${code}:`, e)
    }
    await delay(700) // 700ms between API calls = ~85 req/min headroom safely under 10/min
  }

  return map
}
