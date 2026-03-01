import { NBAGame, NBATeamStats } from './nba-api'
import { NBAPickType, NBAPrediction } from './nba-types'
import { format } from 'date-fns'

function parseForm(form: string): number {
  if (!form) return 0
  return form.split(',').reduce((n, r) => n + (r === 'W' ? 1 : 0), 0)
}

function formatKickoff(isoDate: string): string {
  // Convert UTC to WAT (UTC+1)
  const d = new Date(isoDate)
  d.setHours(d.getHours() + 1)
  return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`
}

function analyseGame(
  game: NBAGame,
  homeStats: NBATeamStats | undefined,
  awayStats: NBATeamStats | undefined,
): { pick: NBAPickType; pickLabel: string; line?: number; confidence: number; reasoning: string[] } {

  const homeName = game.teams.home.name
  const awayName = game.teams.visitors.name
  const reasoning: string[] = []

  if (!homeStats || !awayStats) {
    return { pick: 'HOME_WIN', pickLabel: `${homeName} to Win`, confidence: 54, reasoning: ['No recent data available'] }
  }

  // ── Base: NBA home court advantage ~60% win rate ───────────
  let homeSignal = 8
  let awaySignal = 0

  // ── Win rate ───────────────────────────────────────────────
  const wrDiff = homeStats.winRate - awayStats.winRate

  if (homeStats.winRate >= 0.70) { homeSignal += 14; reasoning.push(`${homeName} win rate: ${(homeStats.winRate*100).toFixed(0)}% (${homeStats.wins}W-${homeStats.losses}L last 14 days)`) }
  else if (homeStats.winRate >= 0.55) { homeSignal += 7;  reasoning.push(`${homeName} solid form: ${homeStats.wins}W-${homeStats.losses}L recently`) }
  else if (homeStats.winRate <= 0.30) { homeSignal -= 5;  reasoning.push(`${homeName} struggling: ${homeStats.wins}W-${homeStats.losses}L recently`) }

  if (awayStats.winRate >= 0.70) { awaySignal += 14; reasoning.push(`${awayName} win rate: ${(awayStats.winRate*100).toFixed(0)}% (${awayStats.wins}W-${awayStats.losses}L last 14 days)`) }
  else if (awayStats.winRate >= 0.55) { awaySignal += 7;  reasoning.push(`${awayName} solid away form: ${awayStats.wins}W-${awayStats.losses}L recently`) }
  else if (awayStats.winRate <= 0.30) { awaySignal -= 5;  reasoning.push(`${awayName} struggling: ${awayStats.wins}W-${awayStats.losses}L recently`) }

  // ── Recent form (last 5) ───────────────────────────────────
  const homeForm5 = parseForm(homeStats.last5)
  const awayForm5 = parseForm(awayStats.last5)
  if (homeForm5 >= 4) { homeSignal += 10; reasoning.push(`${homeName} hot streak — ${homeStats.last5.replace(/,/g,' ')} last 5`) }
  else if (homeForm5 >= 3) { homeSignal += 5 }
  else if (homeForm5 <= 1) { homeSignal -= 6; reasoning.push(`${homeName} cold — ${homeStats.last5.replace(/,/g,' ')} last 5`) }

  if (awayForm5 >= 4) { awaySignal += 10; reasoning.push(`${awayName} hot streak — ${awayStats.last5.replace(/,/g,' ')} last 5`) }
  else if (awayForm5 >= 3) { awaySignal += 5 }
  else if (awayForm5 <= 1) { awaySignal -= 6; reasoning.push(`${awayName} cold — ${awayStats.last5.replace(/,/g,' ')} last 5`) }

  // ── Scoring & defence ──────────────────────────────────────
  if (homeStats.avgFor >= 118) { homeSignal += 6; reasoning.push(`${homeName} high-powered offence: ${homeStats.avgFor.toFixed(1)} pts/game`) }
  else if (homeStats.avgFor <= 108) { homeSignal -= 3 }

  if (awayStats.avgFor >= 118) { awaySignal += 6; reasoning.push(`${awayName} high-powered offence: ${awayStats.avgFor.toFixed(1)} pts/game`) }
  else if (awayStats.avgFor <= 108) { awaySignal -= 3 }

  if (homeStats.avgAgainst <= 108) { homeSignal += 5; reasoning.push(`${homeName} stingy defence: allows ${homeStats.avgAgainst.toFixed(1)} pts/game`) }
  else if (homeStats.avgAgainst >= 118) { homeSignal -= 3 }

  if (awayStats.avgAgainst <= 108) { awaySignal += 5; reasoning.push(`${awayName} stingy defence: allows ${awayStats.avgAgainst.toFixed(1)} pts/game`) }
  else if (awayStats.avgAgainst >= 118) { awaySignal -= 3 }

  // ── Expected total points (for OVER/UNDER) ─────────────────
  const xHome  = (homeStats.avgFor  + awayStats.avgAgainst) / 2
  const xAway  = (awayStats.avgFor  + homeStats.avgAgainst) / 2
  const xTotal = xHome + xAway

  // ── Decision ───────────────────────────────────────────────
  const diff = homeSignal - awaySignal

  // Strong win signal — pick the side
  if (diff >= 18) {
    const conf = Math.min(82, 52 + Math.floor(diff / 2))
    reasoning.push(`${homeName} clear favourites at home — ${ptsDiffLabel(homeStats, awayStats)}`)
    return { pick: 'HOME_WIN', pickLabel: `${homeName} to Win`, confidence: conf, reasoning: reasoning.slice(0,5) }
  }
  if (diff <= -18) {
    const conf = Math.min(80, 50 + Math.floor(Math.abs(diff) / 2))
    reasoning.push(`${awayName} strong enough to win on the road — ${ptsDiffLabel(awayStats, homeStats)}`)
    return { pick: 'AWAY_WIN', pickLabel: `${awayName} to Win`, confidence: conf, reasoning: reasoning.slice(0,5) }
  }

  // Moderate win signal — OVER/UNDER might be better
  if (xTotal >= 230) {
    const line = Math.round(xTotal / 5) * 5 - 2.5  // e.g. 228.5
    const conf = Math.min(80, 52 + Math.round((xTotal - 228) * 1.5))
    reasoning.push(`Combined xPts: ${xTotal.toFixed(0)} — both offences firing`)
    reasoning.push(`${homeName} avg: ${homeStats.avgFor.toFixed(0)} pts | ${awayName} avg: ${awayStats.avgFor.toFixed(0)} pts`)
    return { pick: 'OVER', pickLabel: `Over ${line} Pts`, line, confidence: conf, reasoning: reasoning.slice(0,5) }
  }

  if (xTotal <= 212) {
    const line = Math.round(xTotal / 5) * 5 + 2.5  // e.g. 212.5
    const conf = Math.min(78, 52 + Math.round((214 - xTotal) * 1.5))
    reasoning.push(`Low-scoring game expected: ${xTotal.toFixed(0)} xPts total`)
    reasoning.push(`${homeName} defence: ${homeStats.avgAgainst.toFixed(0)} allowed | ${awayName}: ${awayStats.avgAgainst.toFixed(0)} allowed`)
    return { pick: 'UNDER', pickLabel: `Under ${line} Pts`, line, confidence: conf, reasoning: reasoning.slice(0,5) }
  }

  // Moderate signal — lean with home advantage
  if (diff >= 8) {
    const conf = Math.min(72, 52 + Math.floor(diff / 2))
    reasoning.push(`${homeName} slight home court edge`)
    return { pick: 'HOME_WIN', pickLabel: `${homeName} to Win`, confidence: conf, reasoning: reasoning.slice(0,5) }
  }

  if (diff <= -8) {
    const conf = Math.min(70, 50 + Math.floor(Math.abs(diff) / 2))
    reasoning.push(`${awayName} hot enough to win away`)
    return { pick: 'AWAY_WIN', pickLabel: `${awayName} to Win`, confidence: conf, reasoning: reasoning.slice(0,5) }
  }

  // Too close to call — fall back to OVER/UNDER near the middle line
  const line = Math.round(xTotal / 5) * 5 - 2.5
  const conf = Math.min(68, 52 + Math.abs(Math.round((xTotal - 220) * 1.2)))
  reasoning.push(`Evenly matched — picking the totals market`)
  reasoning.push(`xTotal: ${xTotal.toFixed(0)} pts`)
  return { pick: xTotal >= 222 ? 'OVER' : 'UNDER', pickLabel: `${xTotal >= 222 ? 'Over' : 'Under'} ${line} Pts`, line, confidence: conf, reasoning: reasoning.slice(0,5) }
}

function ptsDiffLabel(a: NBATeamStats, b: NBATeamStats): string {
  const diff = ((a.winRate - b.winRate) * 100).toFixed(0)
  return `${diff}% higher win rate`
}

const TARGET = 5
const THRESHOLDS = [75, 68, 62]

export function selectNBAPicks(
  games: NBAGame[],
  statsMap: Map<number, NBATeamStats>,
  count = TARGET
): NBAPrediction[] {
  const analysed: (NBAPrediction & { _sort: number })[] = []

  for (const game of games) {
    const homeId = game.teams.home.id
    const awayId = game.teams.visitors.id
    const homeStats = statsMap.get(homeId)
    const awayStats = statsMap.get(awayId)

    const result = analyseGame(game, homeStats, awayStats)
    const dateObj = new Date(game.date.start)

    analysed.push({
      id:          `nba-${game.id}-${format(dateObj, 'yyyy-MM-dd')}`,
      gameId:      game.id,
      homeTeam:    game.teams.home.name,
      awayTeam:    game.teams.visitors.name,
      homeLogo:    game.teams.home.logo,
      awayLogo:    game.teams.visitors.logo,
      homeCode:    game.teams.home.code,
      awayCode:    game.teams.visitors.code,
      gameDate:    format(dateObj, 'yyyy-MM-dd'),
      kickoff:     formatKickoff(game.date.start ?? game.date),
      pick:        result.pick,
      pickLabel:   result.pickLabel,
      line:        result.line,
      confidence:  result.confidence,
      reasoning:   result.reasoning,
      createdAt:   new Date().toISOString(),
      _sort:       result.confidence,
    })
  }

  const sorted = analysed.sort((a, b) => b._sort - a._sort)

  for (const threshold of THRESHOLDS) {
    const picks = sorted.filter(p => p.confidence >= threshold)
    if (picks.length >= 3) return picks.slice(0, count).map(({ _sort, ...p }) => p)
  }

  return sorted
    .filter(p => p.confidence >= 60)
    .slice(0, count)
    .map(({ _sort, ...p }) => p)
}
