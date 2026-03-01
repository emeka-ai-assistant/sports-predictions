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

  // ── Scoring profiles ──────────────────────────────────────────
  // Is each team genuinely a scoring side?
  const homeScoringTeam  = hAvgFor >= 1.4  // scores regularly
  const awayScoringTeam  = aAvgFor >= 1.2
  const homeLeakyDefence = hAvgAgst >= 1.3  // concedes regularly
  const awayLeakyDefence = aAvgAgst >= 1.3
  const homeCleanSheet   = hAvgAgst <= 0.9  // tight defence
  const awayCleanSheet   = aAvgAgst <= 0.9

  // True BTTS signal: BOTH teams score AND BOTH defences are soft
  const bttsProbable = hAvgFor >= 1.2 && aAvgFor >= 1.1
                    && homeLeakyDefence && awayLeakyDefence

  // Over 2.5 signal: combined xG is genuinely high (not just average)
  const highScoring = xTotal >= 3.1 && (homeScoringTeam || awayScoringTeam)

  // Over 1.5 signal: clearly a goals game — at least one attack + at least one soft defence
  const goalsProbable = xTotal >= 2.7
                     && (homeScoringTeam || awayScoringTeam)
                     && (homeLeakyDefence || awayLeakyDefence)

  // Over 0.5 signal: at least one team scores and neither side is a wall
  const atLeastOneGoal = xTotal >= 1.6
                      && (hAvgFor >= 0.9 || aAvgFor >= 0.9)
                      && !(homeCleanSheet && awayCleanSheet)

  // ── Decision tree ─────────────────────────────────────────────
  // Priority: Over 1.5 → BTTS → Over 2.5 → Win/Draw → 1UP → Handicap → Over 0.5
  let pick: PickType
  let pickLabel: string
  let confidence: number

  // ── 1. OVER 1.5 (goals game — not just average, needs real evidence) ──
  if (goalsProbable) {
    pick = 'OVER_1_5'; pickLabel = 'Over 1.5 Goals'
    confidence = Math.min(83, 52 + Math.round((xTotal - 2.7) * 12))
    reasoning.push(`${xTotal.toFixed(1)} xG expected — both sides in a scoring mood`)
    if (homeScoringTeam) reasoning.push(`${homeName} scores ${hAvgFor.toFixed(1)}/game`)
    if (awayScoringTeam) reasoning.push(`${awayName} scores ${aAvgFor.toFixed(1)}/game`)
    if (homeLeakyDefence) reasoning.push(`${homeName} concedes ${hAvgAgst.toFixed(1)}/game`)

  // ── 2. BTTS (both teams genuinely score and both defences are porous) ─
  } else if (bttsProbable) {
    pick = 'BTTS'; pickLabel = 'Both Teams to Score'
    confidence = Math.min(82, 56 + Math.round((xTotal - 2.3) * 10))
    reasoning.push(`${homeName} scores ${hAvgFor.toFixed(1)}/g, concedes ${hAvgAgst.toFixed(1)}/g`)
    reasoning.push(`${awayName} scores ${aAvgFor.toFixed(1)}/g, concedes ${aAvgAgst.toFixed(1)}/g`)

  // ── 3. OVER 2.5 (proper high-scorer, xG well above average) ──────────
  } else if (highScoring) {
    pick = 'OVER_2_5'; pickLabel = 'Over 2.5 Goals'
    confidence = Math.min(82, 50 + Math.round((xTotal - 3.1) * 14))
    reasoning.push(`High-scoring match expected — ${xTotal.toFixed(1)} total xG`)
    if (hAvgFor >= 1.6) reasoning.push(`${homeName} averages ${hAvgFor.toFixed(1)} goals/game`)
    if (aAvgFor >= 1.6) reasoning.push(`${awayName} averages ${aAvgFor.toFixed(1)} goals/game`)

  // ── 4. WIN / DRAW markets (use when there's a real competitive gap) ───
  } else if (dominantHome) {
    pick = 'HOME_WIN'; pickLabel = `${homeName} to Win`
    confidence = Math.min(83, 46 + Math.floor(diff / 2))
    reasoning.push(`${homeName} strong favourites — ${ptsDiff}-point gap in the standings`)
    if (homeIsScorer) reasoning.push(`${homeName} averages ${hAvgFor.toFixed(1)} goals/game`)

  } else if (strongHome) {
    pick = 'HOME_WIN'; pickLabel = `${homeName} to Win`
    confidence = Math.min(80, 44 + Math.floor(diff / 2))
    reasoning.push(`${homeName} the clear home favourite`)

  } else if (dominantAway) {
    pick = 'AWAY_WIN'; pickLabel = `${awayName} to Win`
    confidence = Math.min(82, 44 + Math.floor(Math.abs(diff) / 2))
    reasoning.push(`${awayName} clearly the better side despite playing away`)
    if (awayIsScorer) reasoning.push(`${awayName} averages ${aAvgFor.toFixed(1)} goals/game`)

  } else if (strongAway) {
    pick = 'AWAY_WIN'; pickLabel = `${awayName} to Win`
    confidence = Math.min(79, 42 + Math.floor(Math.abs(diff) / 2))
    reasoning.push(`${awayName} strong away from home`)

  // ── 5. 1UP (only extreme dominance AND prolific scorer) ───────────────
  } else if (extremeHome && homeIsScorer) {
    pick = 'ONE_UP'; pickLabel = `${homeName} 1UP`
    confidence = Math.min(84, 52 + Math.floor(diff / 3))
    reasoning.push(`${homeName} dominant at home — ${hAvgFor.toFixed(1)} goals/game`)

  } else if (extremeAway && awayIsScorer) {
    pick = 'ONE_UP'; pickLabel = `${awayName} 1UP`
    confidence = Math.min(82, 50 + Math.floor(Math.abs(diff) / 3))
    reasoning.push(`${awayName} dominant even away from home`)

  // ── 6. HANDICAP (moderate mismatch, nothing else qualifies) ──────────
  } else if (moderateHome) {
    pick = 'HANDICAP_PLUS_1'; pickLabel = `${awayName} +1`
    confidence = Math.min(77, 66 + Math.floor(diff / 4))
    reasoning.push(`${homeName} slight edge — away team unlikely to lose by 2+`)

  } else if (moderateAway) {
    pick = 'HANDICAP_PLUS_1'; pickLabel = `${homeName} +1`
    confidence = Math.min(77, 66 + Math.floor(Math.abs(diff) / 4))
    reasoning.push(`${awayName} slight edge — home team unlikely to lose by 2+`)

  // ── 7. OVER 0.5 (defensive but goals still expected) ─────────────────
  } else if (atLeastOneGoal) {
    pick = 'OVER_0_5'; pickLabel = 'Over 0.5 Goals'
    confidence = Math.min(78, 64 + Math.round(xTotal * 5))
    reasoning.push(`Tight defensive match — at least one goal expected`)
    reasoning.push(`Combined xG: ${xTotal.toFixed(1)} goals`)

  // ── Fallback ──────────────────────────────────────────────────────────
  } else {
    pick = 'HOME_WIN'; pickLabel = `${homeName} to Win`
    confidence = 58
    reasoning.push(`Low-data match — slight home advantage`)
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
