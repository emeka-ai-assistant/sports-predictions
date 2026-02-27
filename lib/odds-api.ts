import { PickType } from './types'

const ODDS_API_KEY = process.env.ODDS_API_KEY!
const ODDS_BASE = 'https://api.the-odds-api.com/v4'

// Map our competition codes → Odds API sport keys
export const LEAGUE_TO_SPORT: Record<string, string> = {
  PL:  'soccer_epl',
  BL1: 'soccer_germany_bundesliga',
  PD:  'soccer_spain_la_liga',
  SA:  'soccer_italy_serie_a',
  FL1: 'soccer_france_ligue_one',
  CL:  'soccer_uefa_champs_league',
  DED: 'soccer_netherlands_eredivisie',
  PPL: 'soccer_portugal_primeira_liga',
  ELC: 'soccer_efl_champ',
}

export interface MatchOdds {
  homeOdds: number | null
  drawOdds: number | null
  awayOdds: number | null
  over15: number | null
  over25: number | null
  btts: number | null
  bookmaker: string
}

// Normalize team names for fuzzy matching
function normalise(name: string): string {
  return name
    .toLowerCase()
    .replace(/\s?(fc|cf|afc|sc|ac|ss|us|sk|rsc|fk|cd|sd|rc|ud|sv|vfb|rb|bv|bsc|bvb|if|ik|gd|hsk)\s?/gi, ' ')
    .replace(/[^a-z0-9\s]/gi, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function matchTeam(target: string, candidates: string[]): string | null {
  const norm = normalise(target)
  // Exact match first
  const exact = candidates.find(c => normalise(c) === norm)
  if (exact) return exact
  // Contains match
  const contains = candidates.find(c =>
    normalise(c).includes(norm) || norm.includes(normalise(c))
  )
  if (contains) return contains
  // Word-level match (at least 2 matching words)
  const words = norm.split(' ').filter(w => w.length > 2)
  const partial = candidates.find(c => {
    const cWords = normalise(c).split(' ').filter(w => w.length > 2)
    const common = words.filter(w => cWords.includes(w))
    return common.length >= Math.min(2, words.length)
  })
  return partial || null
}

function avgOdds(values: number[]): number | null {
  const valid = values.filter(v => v > 1)
  if (valid.length === 0) return null
  return Math.round((valid.reduce((a, b) => a + b, 0) / valid.length) * 100) / 100
}

export async function getOddsForLeague(
  sportKey: string,
  markets = 'h2h,totals'
): Promise<any[]> {
  try {
    const url = `${ODDS_BASE}/sports/${sportKey}/odds/?apiKey=${ODDS_API_KEY}&regions=eu&markets=${markets}&dateFormat=iso&oddsFormat=decimal`
    const res = await fetch(url, { next: { revalidate: 1800 } }) // 30 min cache
    if (!res.ok) return []
    return res.json()
  } catch {
    return []
  }
}

export function extractOdds(
  game: any,
  homeTeam: string,
  awayTeam: string
): MatchOdds {
  const bookmakers: string[] = []
  const homeOddsArr: number[] = []
  const drawOddsArr: number[] = []
  const awayOddsArr: number[] = []
  const over15Arr: number[] = []
  const over25Arr: number[] = []
  const bttsArr: number[] = []

  for (const bm of (game.bookmakers || [])) {
    for (const mkt of (bm.markets || [])) {
      if (mkt.key === 'h2h') {
        for (const outcome of (mkt.outcomes || [])) {
          const n = outcome.name
          if (n === homeTeam || n === game.home_team) homeOddsArr.push(outcome.price)
          else if (n === awayTeam || n === game.away_team) awayOddsArr.push(outcome.price)
          else if (n === 'Draw') drawOddsArr.push(outcome.price)
        }
        if (!bookmakers.includes(bm.title)) bookmakers.push(bm.title)
      }
      if (mkt.key === 'totals') {
        for (const outcome of (mkt.outcomes || [])) {
          if (outcome.name === 'Over' && Math.abs(outcome.point - 1.5) < 0.1) over15Arr.push(outcome.price)
          if (outcome.name === 'Over' && Math.abs(outcome.point - 2.5) < 0.1) over25Arr.push(outcome.price)
        }
      }
      if (mkt.key === 'btts' || mkt.key === 'both_teams_to_score') {
        for (const outcome of (mkt.outcomes || [])) {
          if (outcome.name === 'Yes') bttsArr.push(outcome.price)
        }
      }
    }
  }

  return {
    homeOdds: avgOdds(homeOddsArr),
    drawOdds: avgOdds(drawOddsArr),
    awayOdds: avgOdds(awayOddsArr),
    over15: avgOdds(over15Arr),
    over25: avgOdds(over25Arr),
    btts: avgOdds(bttsArr),
    bookmaker: bookmakers.slice(0, 2).join(', ') || 'Market avg',
  }
}

export function getPickOdds(matchOdds: MatchOdds, pick: PickType, pickLabel: string): number | null {
  switch (pick) {
    case 'HOME_WIN': return matchOdds.homeOdds
    case 'AWAY_WIN': return matchOdds.awayOdds
    case 'DRAW':     return matchOdds.drawOdds
    case 'OVER_1_5': return matchOdds.over15
    case 'OVER_2_5': return matchOdds.over25
    case 'BTTS':     return matchOdds.btts
    case 'ONE_UP':
      // 1UP is closest to team win in h2h
      if (pickLabel.includes('home') || !pickLabel.toLowerCase().includes('away')) return matchOdds.homeOdds
      return matchOdds.awayOdds
    default: return null
  }
}

export async function enrichWithOdds(
  predictions: Array<{
    homeTeam: string
    awayTeam: string
    competitionCode: string
    pick: PickType
    pickLabel: string
    odds?: number
  }>
): Promise<Map<string, number | null>> {
  // Group by league to minimise API calls
  const byLeague = new Map<string, typeof predictions>()
  for (const p of predictions) {
    const sport = LEAGUE_TO_SPORT[p.competitionCode]
    if (!sport) continue
    if (!byLeague.has(sport)) byLeague.set(sport, [])
    byLeague.get(sport)!.push(p)
  }

  const result = new Map<string, number | null>()

  await Promise.allSettled(
    [...byLeague.entries()].map(async ([sport, preds]) => {
      const games = await getOddsForLeague(sport)
      for (const pred of preds) {
        const key = `${pred.homeTeam}|${pred.awayTeam}`
        // Find matching game
        const allTeams = games.flatMap(g => [g.home_team, g.away_team])
        const homeMatch = matchTeam(pred.homeTeam, allTeams)
        const game = homeMatch
          ? games.find(g => g.home_team === homeMatch || g.away_team === homeMatch)
          : null

        if (game) {
          const mo = extractOdds(game, game.home_team, game.away_team)
          // Determine if we need home or away odds based on team match
          let odds = getPickOdds(mo, pred.pick, pred.pickLabel)
          // If pick is ONE_UP, determine team from pickLabel
          if (pred.pick === 'ONE_UP') {
            const isHome = normalise(pred.pickLabel).includes(normalise(pred.homeTeam))
            odds = isHome ? mo.homeOdds : mo.awayOdds
          }
          result.set(key, odds)
        }
      }
    })
  )

  return result
}
