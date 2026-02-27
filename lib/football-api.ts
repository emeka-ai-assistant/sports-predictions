import { Fixture, TeamStanding } from './types'

const BASE_URL = 'https://api.football-data.org/v4'
const API_KEY = process.env.FOOTBALL_API_KEY!

const LEAGUES = ['PL', 'BL1', 'PD', 'SA', 'FL1', 'CL', 'DED', 'PPL', 'ELC']

async function apiFetch<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { 'X-Auth-Token': API_KEY },
    next: { revalidate: 300 }, // 5 min cache
  })
  if (!res.ok) {
    throw new Error(`Football API error: ${res.status} ${path}`)
  }
  return res.json()
}

export async function getTodayFixtures(): Promise<Fixture[]> {
  const today = new Date()
  const dateStr = today.toISOString().split('T')[0]

  try {
    const data = await apiFetch<{ matches: Fixture[] }>(
      `/matches?dateFrom=${dateStr}&dateTo=${dateStr}`
    )
    // Filter to our supported leagues
    return (data.matches || []).filter(m =>
      LEAGUES.includes(m.competition.code)
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
    }>(`/competitions/${competitionCode}/standings`)

    const total = data.standings?.find(s => s.type === 'TOTAL')
    return total?.table || []
  } catch (e) {
    console.error(`Failed to fetch standings for ${competitionCode}:`, e)
    return []
  }
}

export async function getFixturesByDate(dateFrom: string, dateTo: string): Promise<Fixture[]> {
  try {
    const data = await apiFetch<{ matches: Fixture[] }>(
      `/matches?dateFrom=${dateFrom}&dateTo=${dateTo}`
    )
    return (data.matches || []).filter(m =>
      LEAGUES.includes(m.competition.code)
    )
  } catch (e) {
    console.error('Failed to fetch fixtures by date:', e)
    return []
  }
}
