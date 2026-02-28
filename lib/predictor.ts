import { Fixture, TeamStanding, AnalysedFixture, PickType } from './types'

function parseForm(form: string | null): number {
  if (!form) return 0
  return form.split(',').slice(-5).reduce((score, g) => {
    if (g === 'W') return score + 3
    if (g === 'D') return score + 1
    return score
  }, 0)
}

function getFormString(form: string | null): string {
  if (!form) return 'N/A'
  return form.split(',').slice(-5).join(' ')
}

function analyseMatch(
  fixture: Fixture,
  home?: TeamStanding,
  away?: TeamStanding
): { pick: PickType; pickLabel: string; confidence: number; reasoning: string[] } {
  const reasoning: string[] = []
  const homeName = fixture.homeTeam.name
  const awayName = fixture.awayTeam.name

  // ── Default if no standings ───────────────────────────────────
  if (!home || !away) {
    return {
      pick: 'HOME_WIN', pickLabel: `${homeName} to Win`,
      confidence: 52, reasoning: ['No standings data available']
    }
  }

  // ── Base signals ──────────────────────────────────────────────
  let homeSignal = 5  // home advantage baseline
  let awaySignal = 0

  const posDiff = away.position - home.position
  const ptsDiff = home.points - away.points
  const pg_h = home.playedGames || 1
  const pg_a = away.playedGames || 1

  if (posDiff >= 14) { homeSignal += 22; reasoning.push(`${homeName} is ${posDiff} places higher in the table`) }
  else if (posDiff >= 8) { homeSignal += 14; reasoning.push(`${homeName} holds a ${posDiff}-place table advantage`) }
  else if (posDiff >= 4) { homeSignal += 7 }
  else if (posDiff <= -14) { awaySignal += 22; reasoning.push(`${awayName} is ${Math.abs(posDiff)} places higher in the table`) }
  else if (posDiff <= -8) { awaySignal += 14; reasoning.push(`${awayName} has a ${Math.abs(posDiff)}-place table advantage`) }
  else if (posDiff <= -4) { awaySignal += 7 }

  if (ptsDiff >= 22) { homeSignal += 18; reasoning.push(`${homeName} leads by ${ptsDiff} points — dominant season`) }
  else if (ptsDiff >= 12) { homeSignal += 10; reasoning.push(`${homeName} has a ${ptsDiff}-point lead in the standings`) }
  else if (ptsDiff >= 5) { homeSignal += 5 }
  else if (ptsDiff <= -22) { awaySignal += 18; reasoning.push(`${awayName} leads by ${Math.abs(ptsDiff)} points`) }
  else if (ptsDiff <= -12) { awaySignal += 10; reasoning.push(`${awayName} has a ${Math.abs(ptsDiff)}-point advantage`) }
  else if (ptsDiff <= -5) { awaySignal += 5 }

  const homeForm = parseForm(home.form)
  const awayForm = parseForm(away.form)
  if (homeForm >= 12) { homeSignal += 10; reasoning.push(`${homeName} excellent recent form: ${getFormString(home.form)}`) }
  else if (homeForm >= 9) { homeSignal += 5 }
  if (awayForm >= 12) { awaySignal += 10; reasoning.push(`${awayName} excellent recent form: ${getFormString(away.form)}`) }
  else if (awayForm >= 9) { awaySignal += 5 }

  const homeWinRate = home.won / pg_h
  const awayWinRate = away.won / pg_a
  if (homeWinRate >= 0.65) { homeSignal += 8; reasoning.push(`${homeName} wins ${(homeWinRate * 100).toFixed(0)}% of games`) }
  if (awayWinRate >= 0.65) { awaySignal += 8; reasoning.push(`${awayName} wins ${(awayWinRate * 100).toFixed(0)}% of games`) }

  // ── Expected goals ────────────────────────────────────────────
  const hAvgFor  = home.goalsFor  / pg_h
  const aAvgFor  = away.goalsFor  / pg_a
  const hAvgAgst = home.goalsAgainst / pg_h
  const aAvgAgst = away.goalsAgainst / pg_a

  const xH = (hAvgFor + aAvgAgst) / 2
  const xA = (aAvgFor + hAvgAgst) / 2
  const xTotal = xH + xA

  // ── Strength classification ───────────────────────────────────
  const diff = homeSignal - awaySignal
  const extremeHome   = diff >= 32   // true dominance (Porto vs bottom) → 1UP
  const dominantHome  = diff >= 22   // clear home favourite → HOME_WIN
  const strongHome    = diff >= 12   // moderate home edge
  const moderateHome  = diff >= 5
  const extremeAway   = diff <= -30
  const dominantAway  = diff <= -20
  const strongAway    = diff <= -10
  const moderateAway  = diff <= -5

  // Goal quality checks for 1UP (only when team genuinely scores a lot)
  const homeIsScorer   = hAvgFor >= 1.8 && aAvgAgst >= 1.2
  const awayIsScorer   = aAvgFor >= 1.8 && hAvgAgst >= 1.2

  // ── Decision tree ─────────────────────────────────────────────
  // Priority order per Emeka's betting strategy:
  // 1. Over 1.5  →  2. BTTS  →  3. Over 2.5  →  4. Win/Draw  →  5. 1UP  →  6. Handicap
  let pick: PickType
  let pickLabel: string
  let confidence: number

  // ── 1. OVER 1.5 (most reliable goals market) ──────────────────
  if (xTotal >= 2.0) {
    pick = 'OVER_1_5'; pickLabel = 'Over 1.5 Goals'
    confidence = Math.min(83, 56 + Math.round((xTotal - 2.0) * 10))
    reasoning.push(`${xTotal.toFixed(1)} total goals expected — 2+ very likely`)
    if (hAvgFor >= 1.3) reasoning.push(`${homeName} scores ${hAvgFor.toFixed(1)} goals/game`)
    if (aAvgFor >= 1.3) reasoning.push(`${awayName} scores ${aAvgFor.toFixed(1)} goals/game`)

  // ── 2. BTTS (both teams scoring) ──────────────────────────────
  } else if (hAvgFor >= 1.2 && aAvgFor >= 1.0 && xTotal >= 1.8) {
    pick = 'BTTS'; pickLabel = 'Both Teams to Score'
    confidence = Math.min(82, 54 + Math.round((xTotal - 1.8) * 12))
    reasoning.push(`Both teams expected to score — ${xTotal.toFixed(1)} xG combined`)
    reasoning.push(`${homeName} scores ${hAvgFor.toFixed(1)}/g, ${awayName} scores ${aAvgFor.toFixed(1)}/g`)

  // ── 3. OVER 2.5 (high-scoring match) ──────────────────────────
  } else if (xTotal >= 2.8) {
    pick = 'OVER_2_5'; pickLabel = 'Over 2.5 Goals'
    confidence = Math.min(82, 50 + Math.round((xTotal - 2.8) * 14))
    reasoning.push(`High-scoring game expected: ~${xTotal.toFixed(1)} goals`)
    if (hAvgFor >= 1.5) reasoning.push(`${homeName} averages ${hAvgFor.toFixed(1)} goals/game`)
    if (aAvgFor >= 1.5) reasoning.push(`${awayName} averages ${aAvgFor.toFixed(1)} goals/game`)

  // ── 4. WIN / DRAW markets ──────────────────────────────────────
  } else if (dominantHome) {
    pick = 'HOME_WIN'; pickLabel = `${homeName} to Win`
    confidence = Math.min(83, 46 + Math.floor(diff / 2))
    if (homeIsScorer) reasoning.push(`${homeName} averages ${hAvgFor.toFixed(1)} goals/game`)

  } else if (strongHome) {
    pick = 'HOME_WIN'; pickLabel = `${homeName} to Win`
    confidence = Math.min(81, 44 + Math.floor(diff / 2))

  } else if (dominantAway) {
    pick = 'AWAY_WIN'; pickLabel = `${awayName} to Win`
    confidence = Math.min(82, 44 + Math.floor(Math.abs(diff) / 2))
    if (awayIsScorer) reasoning.push(`${awayName} averages ${aAvgFor.toFixed(1)} goals/game`)

  } else if (strongAway) {
    pick = 'AWAY_WIN'; pickLabel = `${awayName} to Win`
    confidence = Math.min(80, 42 + Math.floor(Math.abs(diff) / 2))

  // ── 5. 1UP (only truly dominant + prolific scorers) ────────────
  } else if (extremeHome && homeIsScorer) {
    pick = 'ONE_UP'; pickLabel = `${homeName} 1UP`
    confidence = Math.min(84, 52 + Math.floor(diff / 3))
    reasoning.push(`${homeName} dominant at home and averaging ${hAvgFor.toFixed(1)} goals/game`)

  } else if (extremeAway && awayIsScorer) {
    pick = 'ONE_UP'; pickLabel = `${awayName} 1UP`
    confidence = Math.min(82, 50 + Math.floor(Math.abs(diff) / 3))
    reasoning.push(`${awayName} dominant even away from home`)

  // ── 6. HANDICAP (moderate mismatch, no clear goals signal) ────
  } else if (moderateHome) {
    pick = 'HANDICAP_PLUS_1'; pickLabel = `${awayName} +1`
    confidence = Math.min(77, 66 + Math.floor(diff / 4))
    reasoning.push(`${homeName} slight favourite — away unlikely to lose by 2+`)

  } else if (moderateAway) {
    pick = 'HANDICAP_PLUS_1'; pickLabel = `${homeName} +1`
    confidence = Math.min(77, 66 + Math.floor(Math.abs(diff) / 4))
    reasoning.push(`${awayName} slight edge — home unlikely to lose by 2+`)

  // ── Fallback ───────────────────────────────────────────────────
  } else if (xTotal >= 1.2) {
    pick = 'OVER_0_5'; pickLabel = 'Over 0.5 Goals'
    confidence = Math.min(76, 68 + Math.round(xTotal * 4))
    reasoning.push(`At least one goal expected — ${xTotal.toFixed(1)} xG combined`)

  } else {
    pick = 'HOME_WIN'; pickLabel = `${homeName} to Win`
    confidence = 58
  }

  // Final reasoning padding (home advantage note)
  if (!reasoning.some(r => r.toLowerCase().includes('home'))) {
    reasoning.push(`${homeName} playing at home`)
  }

  return { pick, pickLabel, confidence, reasoning: reasoning.slice(0, 4) }
}

const TARGET_PICKS = 5
const THRESHOLDS = [75, 68, 62]

export function selectTopPicks(
  fixtures: Fixture[],
  standingsMap: Map<string, TeamStanding[]>,
  count = TARGET_PICKS
): AnalysedFixture[] {
  const analysed: AnalysedFixture[] = []

  for (const fixture of fixtures) {
    const standings = standingsMap.get(fixture.competition.code) || []
    const homeStanding = standings.find(s => s.team.id === fixture.homeTeam.id)
    const awayStanding = standings.find(s => s.team.id === fixture.awayTeam.id)
    if (!homeStanding || !awayStanding) continue

    const analysis = analyseMatch(fixture, homeStanding, awayStanding)
    analysed.push({ fixture, homeStanding, awayStanding, ...analysis })
  }

  const sorted = analysed.sort((a, b) => b.confidence - a.confidence)

  for (const threshold of THRESHOLDS) {
    const picks = sorted.filter(p => p.confidence >= threshold)
    if (picks.length >= 4) return picks.slice(0, count)
  }

  return sorted.filter(p => p.confidence >= 60).slice(0, count)
}
