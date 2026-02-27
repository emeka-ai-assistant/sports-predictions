import { Fixture, TeamStanding } from './types'

const BASE_URL = 'https://api.football-data.org/v4'
const API_KEY = process.env.FOOTBALL_API_KEY!

export const SUPPORTED_LEAGUES = ['PL', 'BL1', 'PD', 'SA', 'FL1', 'CL', 'DED', 'PPL', 'ELC']

async function apiFetch<T>(path: string, tag?: string): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { 'X-Auth-Token': API_KEY },
    next: {
      revalidate: 3600, // 1 hour cache
      tags: ['predictions', tag ?? 'football-data'].filter(Boolean),
    },
  })
  if (!res.ok) {
    throw new Error(`Football API error: ${res.status} — ${path}`)
  }
  return res.json()
}

export async function getTodayFixtures(): Promise<Fixture[]> {
  const today = new Date().toISOString().split('T')[0]
  try {
    const data = await apiFetch<{ matches: Fixture[] }>(
      `/matches?dateFrom=${today}&dateTo=${today}`,
      'fixtures'
    )
    return (data.matches || []).filter(m =>
      SUPPORTED_LEAGUES.includes(m.competition.code)
    )
  } catch (e) {
    console.error('Failed to fetch fixtures:', e)
    return []
  }
}

export async function getStandings(competitionCode: string): Promise<TeamStanding[]> {
  try {
    const data = await apiFetch<{
      standings: { type: string; table: TeamStanding[] }[]
    }>(`/competitions/${competitionCode}/standings`, `standings-${competitionCode}`)

    const total = data.standings?.find(s => s.type === 'TOTAL')
    return total?.table || []
  } catch (e) {
    console.error(`Failed to fetch standings for ${competitionCode}:`, e)
    return []
  }
}

/**
 * Fetch standings for multiple competitions sequentially with a small delay
 * between requests to respect the free-tier rate limit (10 req/min = 1 per 6s,
 * but in practice 300ms spacing is enough since Next.js caches responses).
 */
export async function getMultipleStandings(codes: string[]): Promise<Map<string, TeamStanding[]>> {
  const map = new Map<string, TeamStanding[]>()
  for (const code of codes) {
    const standings = await getStandings(code)
    if (standings.length > 0) map.set(code, standings)
    // 350ms pause — keeps us well under 10 req/min even on cold start
    await new Promise(r => setTimeout(r, 350))
  }
  return map
}

export async function getFixturesByDate(dateFrom: string, dateTo: string): Promise<Fixture[]> {
  try {
    const data = await apiFetch<{ matches: Fixture[] }>(
      `/matches?dateFrom=${dateFrom}&dateTo=${dateTo}`,
      'fixtures-range'
    )
    return (data.matches || []).filter(m =>
      SUPPORTED_LEAGUES.includes(m.competition.code)
    )
  } catch (e) {
    console.error('Failed to fetch fixtures by date:', e)
    return []
  }
}
