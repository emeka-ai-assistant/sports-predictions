import { Fixture, TeamStanding, H2HStats } from './types'
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
 * Fetch today's fixtures per competition.
 * The free-tier generic /matches endpoint returns 0 — must query each league separately.
 */
export async function getTodayFixtures(): Promise<Fixture[]> {
  const today = new Date().toISOString().split('T')[0]
  const all: Fixture[] = []

  for (const code of SUPPORTED_LEAGUES) {
    try {
      const data = await apiFetch<{ matches: Fixture[] }>(
        `/competitions/${code}/matches?dateFrom=${today}&dateTo=${today}`,
        `fixtures-${code}`
      )
      if (data.matches?.length) all.push(...data.matches)
    } catch (e) {
      console.error(`Failed to fetch fixtures for ${code}:`, e)
    }
    await delay(350)
  }

  return all
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
export async function getH2H(fixtureId: number): Promise<H2HStats | null> {
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

    const totalGoals = settled.map(m =>
      (m.score.fullTime.home || 0) + (m.score.fullTime.away || 0)
    )

    return {
      meetings: settled.length,
      avgGoals: totalGoals.reduce((a, b) => a + b, 0) / settled.length,
      over05Rate: totalGoals.filter(g => g >= 1).length / settled.length,
      over15Rate: totalGoals.filter(g => g >= 2).length / settled.length,
      over25Rate: totalGoals.filter(g => g >= 3).length / settled.length,
      bttsRate: settled.filter(m =>
        m.score.fullTime.home > 0 && m.score.fullTime.away > 0
      ).length / settled.length,
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
