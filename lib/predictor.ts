import { Fixture, TeamStanding, AnalysedFixture, PickType, H2HStats } from './types'

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
  away?: TeamStanding,
  h2h?: H2HStats | null
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

  // ── 1. League position gap ────────────────────────────────────
  if (posDiff >= 14) { homeSignal += 22; reasoning.push(`${homeName} is ${posDiff} places higher in the table`) }
  else if (posDiff >= 8) { homeSignal += 14; reasoning.push(`${homeName} holds a ${posDiff}-place table advantage`) }
  else if (posDiff >= 4) { homeSignal += 7 }
  else if (posDiff <= -14) { awaySignal += 22; reasoning.push(`${awayName} is ${Math.abs(posDiff)} places higher in the table`) }
  else if (posDiff <= -8) { awaySignal += 14; reasoning.push(`${awayName} has a ${Math.abs(posDiff)}-place table advantage`) }
  else if (posDiff <= -4) { awaySignal += 7 }

  // ── 2. Points gap ─────────────────────────────────────────────
  if (ptsDiff >= 22) { homeSignal += 18; reasoning.push(`${homeName} leads by ${ptsDiff} points — dominant season`) }
  else if (ptsDiff >= 12) { homeSignal += 10; reasoning.push(`${homeName} has a ${ptsDiff}-point lead in the standings`) }
  else if (ptsDiff >= 5) { homeSignal += 5 }
  else if (ptsDiff <= -22) { awaySignal += 18; reasoning.push(`${awayName} leads by ${Math.abs(ptsDiff)} points`) }
  else if (ptsDiff <= -12) { awaySignal += 10; reasoning.push(`${awayName} has a ${Math.abs(ptsDiff)}-point advantage`) }
  else if (ptsDiff <= -5) { awaySignal += 5 }

  // ── 3. Recent form (last 5 games) — bigger weight than before ─
  const homeForm = parseForm(home.form)
  const awayForm = parseForm(away.form)
  const homeFormStr = getFormString(home.form)
  const awayFormStr = getFormString(away.form)

  // Bonus for hot form; PENALTY for cold streak
  if (homeForm >= 13)      { homeSignal += 14; reasoning.push(`${homeName} on fire — form: ${homeFormStr}`) }
  else if (homeForm >= 10) { homeSignal += 9;  reasoning.push(`${homeName} good recent form: ${homeFormStr}`) }
  else if (homeForm >= 7)  { homeSignal += 4 }
  else if (homeForm <= 2)  { homeSignal -= 6;  reasoning.push(`${homeName} in terrible form: ${homeFormStr}`) }
  else if (homeForm <= 4)  { homeSignal -= 3 }

  if (awayForm >= 13)      { awaySignal += 14; reasoning.push(`${awayName} on fire — form: ${awayFormStr}`) }
  else if (awayForm >= 10) { awaySignal += 9;  reasoning.push(`${awayName} good recent form: ${awayFormStr}`) }
  else if (awayForm >= 7)  { awaySignal += 4 }
  else if (awayForm <= 2)  { awaySignal -= 6;  reasoning.push(`${awayName} in terrible form: ${awayFormStr}`) }
  else if (awayForm <= 4)  { awaySignal -= 3 }

  // ── 4. Season win rate ────────────────────────────────────────
  const homeWinRate = home.won / pg_h
  const awayWinRate = away.won / pg_a
  if (homeWinRate >= 0.65) { homeSignal += 8; reasoning.push(`${homeName} wins ${(homeWinRate * 100).toFixed(0)}% of games`) }
  if (awayWinRate >= 0.65) { awaySignal += 8; reasoning.push(`${awayName} wins ${(awayWinRate * 100).toFixed(0)}% of games`) }

  // ── 5. Head-to-Head history (who wins when these two meet) ────
  if (h2h && h2h.meetings >= 3) {
    if (h2h.homeWinRate >= 0.65) {
      homeSignal += 12
      reasoning.push(`H2H: ${homeName} won ${Math.round(h2h.homeWinRate * h2h.meetings)}/${h2h.meetings} recent meetings`)
    } else if (h2h.homeWinRate >= 0.5) {
      homeSignal += 6
      reasoning.push(`H2H: ${homeName} edges ${Math.round(h2h.homeWinRate * h2h.meetings)}/${h2h.meetings} recent meetings`)
    } else if (h2h.awayWinRate >= 0.65) {
      awaySignal += 12
      reasoning.push(`H2H: ${awayName} won ${Math.round(h2h.awayWinRate * h2h.meetings)}/${h2h.meetings} recent meetings`)
    } else if (h2h.awayWinRate >= 0.5) {
      awaySignal += 6
      reasoning.push(`H2H: ${awayName} edges ${Math.round(h2h.awayWinRate * h2h.meetings)}/${h2h.meetings} recent meetings`)
    } else if (h2h.drawRate >= 0.5) {
      // H2H suggests a draw is likely — reduce both win signals slightly
      homeSignal -= 3
      awaySignal -= 3
      reasoning.push(`H2H: ${Math.round(h2h.drawRate * h2h.meetings)}/${h2h.meetings} recent meetings ended as draws`)
    }
  }

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
  const homeScoringTeam  = hAvgFor >= 1.4
  const awayScoringTeam  = aAvgFor >= 1.2
  const homeLeakyDefence = hAvgAgst >= 1.3
  const awayLeakyDefence = aAvgAgst >= 1.3
  const homeCleanSheet   = hAvgAgst <= 0.9
  const awayCleanSheet   = aAvgAgst <= 0.9
  // When two attack-minded teams meet, solid defences still get exposed
  const bothAttacking = hAvgFor >= 1.4 && aAvgFor >= 1.3

  // H2H signals — historical meetings override season-long defensive stats
  const h2hOver15 = h2h && h2h.meetings >= 3 && h2h.over15Rate >= 0.6
  const h2hOver25 = h2h && h2h.meetings >= 3 && h2h.over25Rate >= 0.6
  const h2hBtts   = h2h && h2h.meetings >= 3 && h2h.bttsRate   >= 0.6
  const h2hOver05 = h2h && h2h.meetings >= 3 && h2h.over05Rate >= 0.8

  // BTTS: both teams score AND both defences are soft (OR H2H confirms it)
  const bttsProbable = h2hBtts
    || (hAvgFor >= 1.2 && aAvgFor >= 1.1 && homeLeakyDefence && awayLeakyDefence)

  // Over 2.5: high xG OR H2H confirms regularly high-scoring
  const highScoring = h2hOver25
    || (xTotal >= 3.1 && (homeScoringTeam || awayScoringTeam))

  // Over 1.5: goals game — regular season stats OR H2H history OR two attackers meeting
  const goalsProbable = h2hOver15
    || (xTotal >= 2.7 && (homeScoringTeam || awayScoringTeam) && (homeLeakyDefence || awayLeakyDefence))
    || (xTotal >= 2.6 && bothAttacking)  // two attacking teams always produce goals

  // Over 0.5: at least one team scores and defences aren't both watertight
  const atLeastOneGoal = h2hOver05
    || (xTotal >= 1.6 && (hAvgFor >= 0.9 || aAvgFor >= 0.9) && !(homeCleanSheet && awayCleanSheet))

  // ── Decision tree ─────────────────────────────────────────────
  // Priority: Over 1.5 → BTTS → Over 2.5 → Win/Draw → 1UP → Handicap → Over 0.5
  let pick: PickType
  let pickLabel: string
  let confidence: number

  // H2H confidence boosts for win markets
  const h2hHomeBoost = h2h && h2h.meetings >= 3 && h2h.homeWinRate >= 0.5
    ? Math.round(h2h.homeWinRate * 10) : 0
  const h2hAwayBoost = h2h && h2h.meetings >= 3 && h2h.awayWinRate >= 0.5
    ? Math.round(h2h.awayWinRate * 10) : 0

  // Form confidence boosts
  const formHomeBoost = homeForm >= 10 ? 4 : homeForm <= 3 ? -4 : 0
  const formAwayBoost = awayForm >= 10 ? 4 : awayForm <= 3 ? -4 : 0

  // ── 1. OVER 1.5 (goals game — needs real evidence, not just average xG) ──
  if (goalsProbable) {
    pick = 'OVER_1_5'; pickLabel = 'Over 1.5 Goals'
    const h2hBoost = h2hOver15 ? 5 : 0
    confidence = Math.min(84, 52 + Math.round((xTotal - 2.7) * 10) + h2hBoost)
    if (h2hOver15 && h2h) {
      reasoning.push(`H2H: ${(h2h.over15Rate * 100).toFixed(0)}% of last ${h2h.meetings} meetings had 2+ goals (avg ${h2h.avgGoals.toFixed(1)}/game)`)
    } else {
      reasoning.push(`${xTotal.toFixed(1)} xG expected — both sides in a scoring mood`)
      if (homeScoringTeam) reasoning.push(`${homeName} scores ${hAvgFor.toFixed(1)}/game`)
      if (awayScoringTeam) reasoning.push(`${awayName} scores ${aAvgFor.toFixed(1)}/game`)
    }
    if (bothAttacking && !h2hOver15) reasoning.push(`Two attack-minded sides — goals likely`)

  // ── 2. BTTS (both teams genuinely score and both defences are porous) ─
  } else if (bttsProbable) {
    pick = 'BTTS'; pickLabel = 'Both Teams to Score'
    const h2hBoost = h2hBtts ? 6 : 0
    confidence = Math.min(83, 56 + Math.round((xTotal - 2.3) * 10) + h2hBoost)
    if (h2hBtts && h2h) {
      reasoning.push(`H2H: both teams scored in ${(h2h.bttsRate * 100).toFixed(0)}% of last ${h2h.meetings} meetings`)
    }
    reasoning.push(`${homeName} scores ${hAvgFor.toFixed(1)}/g, concedes ${hAvgAgst.toFixed(1)}/g`)
    reasoning.push(`${awayName} scores ${aAvgFor.toFixed(1)}/g, concedes ${aAvgAgst.toFixed(1)}/g`)

  // ── 3. OVER 2.5 (proper high-scorer, xG well above average) ──────────
  } else if (highScoring) {
    pick = 'OVER_2_5'; pickLabel = 'Over 2.5 Goals'
    const h2hBoost = h2hOver25 ? 6 : 0
    confidence = Math.min(83, 50 + Math.round((xTotal - 3.1) * 14) + h2hBoost)
    if (h2hOver25 && h2h) {
      reasoning.push(`H2H: ${(h2h.over25Rate * 100).toFixed(0)}% of last ${h2h.meetings} meetings had 3+ goals`)
    }
    reasoning.push(`High-scoring match expected — ${xTotal.toFixed(1)} total xG`)
    if (hAvgFor >= 1.6) reasoning.push(`${homeName} averages ${hAvgFor.toFixed(1)} goals/game`)
    if (aAvgFor >= 1.6) reasoning.push(`${awayName} averages ${aAvgFor.toFixed(1)} goals/game`)

  // ── 4. WIN markets (use when there's a real competitive gap) ─────────
  } else if (dominantHome) {
    pick = 'HOME_WIN'; pickLabel = `${homeName} to Win`
    confidence = Math.min(84, 46 + Math.floor(diff / 2) + h2hHomeBoost + formHomeBoost)
    reasoning.push(`${homeName} strong favourites — ${ptsDiff} pts ahead, ${posDiff} places higher`)
    if (homeIsScorer) reasoning.push(`${homeName} averages ${hAvgFor.toFixed(1)} goals/game`)

  } else if (strongHome) {
    pick = 'HOME_WIN'; pickLabel = `${homeName} to Win`
    confidence = Math.min(81, 44 + Math.floor(diff / 2) + h2hHomeBoost + formHomeBoost)
    reasoning.push(`${homeName} clear home favourite — form: ${homeFormStr}`)

  } else if (dominantAway) {
    pick = 'AWAY_WIN'; pickLabel = `${awayName} to Win`
    confidence = Math.min(83, 44 + Math.floor(Math.abs(diff) / 2) + h2hAwayBoost + formAwayBoost)
    reasoning.push(`${awayName} clearly the better side despite playing away`)
    if (awayIsScorer) reasoning.push(`${awayName} averages ${aAvgFor.toFixed(1)} goals/game`)

  } else if (strongAway) {
    pick = 'AWAY_WIN'; pickLabel = `${awayName} to Win`
    confidence = Math.min(80, 42 + Math.floor(Math.abs(diff) / 2) + h2hAwayBoost + formAwayBoost)
    reasoning.push(`${awayName} strong away from home — form: ${awayFormStr}`)

  // ── 5. 1UP (only extreme dominance AND prolific scorer) ───────────────
  } else if (extremeHome && homeIsScorer) {
    pick = 'ONE_UP'; pickLabel = `${homeName} 1UP`
    confidence = Math.min(84, 52 + Math.floor(diff / 3) + formHomeBoost)
    reasoning.push(`${homeName} dominant at home — ${hAvgFor.toFixed(1)} goals/game, form: ${homeFormStr}`)

  } else if (extremeAway && awayIsScorer) {
    pick = 'ONE_UP'; pickLabel = `${awayName} 1UP`
    confidence = Math.min(82, 50 + Math.floor(Math.abs(diff) / 3) + formAwayBoost)
    reasoning.push(`${awayName} dominant even away from home — form: ${awayFormStr}`)

  // ── 6. HANDICAP (moderate mismatch, nothing else qualifies) ──────────
  } else if (moderateHome) {
    pick = 'HANDICAP_PLUS_1'; pickLabel = `${awayName} +1`
    confidence = Math.min(78, 66 + Math.floor(diff / 4) + formHomeBoost)
    reasoning.push(`${homeName} slight edge — away team unlikely to lose by 2+`)
    if (h2h && h2h.meetings >= 3) reasoning.push(`H2H: ${Math.round(h2h.homeWinRate * h2h.meetings)}W-${Math.round(h2h.drawRate * h2h.meetings)}D-${Math.round(h2h.awayWinRate * h2h.meetings)}L in last ${h2h.meetings}`)

  } else if (moderateAway) {
    pick = 'HANDICAP_PLUS_1'; pickLabel = `${homeName} +1`
    confidence = Math.min(78, 66 + Math.floor(Math.abs(diff) / 4) + formAwayBoost)
    reasoning.push(`${awayName} slight edge — home team unlikely to lose by 2+`)
    if (h2h && h2h.meetings >= 3) reasoning.push(`H2H: ${Math.round(h2h.awayWinRate * h2h.meetings)}W-${Math.round(h2h.drawRate * h2h.meetings)}D-${Math.round(h2h.homeWinRate * h2h.meetings)}L in last ${h2h.meetings}`)

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

  // Always append form + H2H summary if not already mentioned
  if (h2h && h2h.meetings >= 3 && !reasoning.some(r => r.includes('H2H'))) {
    reasoning.push(`H2H: ${Math.round(h2h.homeWinRate * h2h.meetings)}W-${Math.round(h2h.drawRate * h2h.meetings)}D-${Math.round(h2h.awayWinRate * h2h.meetings)}L (${homeName} perspective, last ${h2h.meetings})`)
  }
  if (!reasoning.some(r => r.includes('form'))) {
    reasoning.push(`Form — ${homeName}: ${homeFormStr} | ${awayName}: ${awayFormStr}`)
  }

  return { pick, pickLabel, confidence, reasoning: reasoning.slice(0, 5) }
}

const TARGET_PICKS = 5
const THRESHOLDS = [75, 68, 62]

export function selectTopPicks(
  fixtures: Fixture[],
  standingsMap: Map<string, TeamStanding[]>,
  h2hMap: Map<number, H2HStats | null> = new Map(),
  count = TARGET_PICKS,
  formMap: Map<number, string> = new Map()   // teamId → "W,D,L,W,W" (last 5)
): AnalysedFixture[] {
  const analysed: AnalysedFixture[] = []

  for (const fixture of fixtures) {
    const standings = standingsMap.get(fixture.competition.code) || []
    let homeStanding = standings.find(s => s.team.id === fixture.homeTeam.id)
    let awayStanding = standings.find(s => s.team.id === fixture.awayTeam.id)
    if (!homeStanding || !awayStanding) continue

    // Inject computed form if the API didn't supply it (free-tier returns null)
    if (!homeStanding.form && formMap.has(fixture.homeTeam.id)) {
      homeStanding = { ...homeStanding, form: formMap.get(fixture.homeTeam.id) ?? null }
    }
    if (!awayStanding.form && formMap.has(fixture.awayTeam.id)) {
      awayStanding = { ...awayStanding, form: formMap.get(fixture.awayTeam.id) ?? null }
    }

    const h2h = h2hMap.get(fixture.id) ?? undefined
    const analysis = analyseMatch(fixture, homeStanding, awayStanding, h2h)
    analysed.push({ fixture, homeStanding, awayStanding, h2h, ...analysis })
  }

  const sorted = analysed.sort((a, b) => b.confidence - a.confidence)

  for (const threshold of THRESHOLDS) {
    const picks = sorted.filter(p => p.confidence >= threshold)
    if (picks.length >= 4) return picks.slice(0, count)
  }

  return sorted.filter(p => p.confidence >= 60).slice(0, count)
}
