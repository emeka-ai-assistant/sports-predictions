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
  let homeScore = 0
  let awayScore = 0
  let bttsSignal = 0
  let over15Signal = 0
  let over25Signal = 0

  const homeName = fixture.homeTeam.name
  const awayName = fixture.awayTeam.name

  if (home && away) {
    // ── Position + Points gap ─────────────────────────────────────
    const posDiff = away.position - home.position
    const ptsDiff = home.points - away.points

    if (posDiff >= 12) {
      homeScore += 22
      reasoning.push(`${homeName} is ${posDiff} places above ${awayName} in the table`)
    } else if (posDiff >= 6) {
      homeScore += 12
      reasoning.push(`${homeName} holds a ${posDiff}-place table advantage`)
    } else if (posDiff <= -12) {
      awayScore += 22
      reasoning.push(`${awayName} is ${Math.abs(posDiff)} places above ${homeName} in the table`)
    } else if (posDiff <= -6) {
      awayScore += 12
      reasoning.push(`${awayName} has a ${Math.abs(posDiff)}-place table advantage`)
    }

    if (ptsDiff >= 20) {
      homeScore += 18
      reasoning.push(`${homeName} leads by ${ptsDiff} points — dominant season`)
    } else if (ptsDiff >= 10) {
      homeScore += 10
      reasoning.push(`${homeName} leads on points (+${ptsDiff})`)
    } else if (ptsDiff <= -20) {
      awayScore += 18
      reasoning.push(`${awayName} leads by ${Math.abs(ptsDiff)} points`)
    } else if (ptsDiff <= -10) {
      awayScore += 10
      reasoning.push(`${awayName} leads on points (+${Math.abs(ptsDiff)})`)
    }

    // ── Form ──────────────────────────────────────────────────────
    const homeForm = parseForm(home.form)
    const awayForm = parseForm(away.form)

    if (homeForm >= 12) {
      homeScore += 12
      reasoning.push(`${homeName} in excellent form: ${getFormString(home.form)}`)
    } else if (homeForm >= 9) {
      homeScore += 6
    }
    if (awayForm >= 12) {
      awayScore += 12
      reasoning.push(`${awayName} in excellent form: ${getFormString(away.form)}`)
    } else if (awayForm >= 9) {
      awayScore += 6
    }

    // ── Win rate ──────────────────────────────────────────────────
    const homeWinRate = home.playedGames > 0 ? home.won / home.playedGames : 0
    const awayWinRate = away.playedGames > 0 ? away.won / away.playedGames : 0

    if (homeWinRate >= 0.65) {
      homeScore += 10
      reasoning.push(`${homeName} wins ${(homeWinRate * 100).toFixed(0)}% of games`)
    }
    if (awayWinRate >= 0.65) {
      awayScore += 10
      reasoning.push(`${awayName} wins ${(awayWinRate * 100).toFixed(0)}% of games`)
    }

    // ── Goals / BTTS / Over signals ───────────────────────────────
    const homeAvgFor = home.playedGames > 0 ? home.goalsFor / home.playedGames : 0
    const awayAvgFor = away.playedGames > 0 ? away.goalsFor / away.playedGames : 0
    const homeAvgAgainst = home.playedGames > 0 ? home.goalsAgainst / home.playedGames : 0
    const awayAvgAgainst = away.playedGames > 0 ? away.goalsAgainst / away.playedGames : 0

    const expectedHomeGoals = (homeAvgFor + awayAvgAgainst) / 2
    const expectedAwayGoals = (awayAvgFor + homeAvgAgainst) / 2
    const expectedTotal = expectedHomeGoals + expectedAwayGoals

    if (expectedTotal >= 3.0) {
      over25Signal += 14
      over15Signal += 18
      reasoning.push(`High-scoring game expected: ~${expectedTotal.toFixed(1)} goals`)
    } else if (expectedTotal >= 2.0) {
      over15Signal += 14
      over25Signal += 6
    } else if (expectedTotal >= 1.5) {
      over15Signal += 8
    }

    if (homeAvgFor >= 2.0 && awayAvgAgainst >= 1.5) {
      bttsSignal += 8
      reasoning.push(`${homeName} scores ${homeAvgFor.toFixed(1)}/game; ${awayName} concedes ${awayAvgAgainst.toFixed(1)}/game`)
    }
    if (awayAvgFor >= 1.5 && homeAvgAgainst >= 1.2) {
      bttsSignal += 8
      reasoning.push(`${awayName} scores ${awayAvgFor.toFixed(1)}/game; ${homeName} concedes ${homeAvgAgainst.toFixed(1)}/game`)
    }
  }

  // Home advantage
  homeScore += 5
  if (!reasoning.some(r => r.includes('home'))) {
    reasoning.push(`${homeName} playing at home`)
  }

  // ── Determine winner and margins ──────────────────────────────
  const strongerHome = homeScore > awayScore + 10
  const dominantHome = homeScore > awayScore + 20
  const strongerAway = awayScore > homeScore + 8
  const dominantAway = awayScore > homeScore + 18

  const home2 = home
  const away2 = away

  // Calculate expected goal margin for winner
  let expectedMargin = 0
  if (home2 && away2) {
    const homeAvgFor = home2.goalsFor / home2.playedGames
    const awayAvgAgainst = away2.goalsAgainst / away2.playedGames
    const awayAvgFor = away2.goalsFor / away2.playedGames
    const homeAvgAgainst = home2.goalsAgainst / home2.playedGames
    if (strongerHome || dominantHome) {
      expectedMargin = (homeAvgFor + awayAvgAgainst) / 2 - (awayAvgFor + homeAvgAgainst) / 2
    } else if (strongerAway || dominantAway) {
      expectedMargin = (awayAvgFor + homeAvgAgainst) / 2 - (homeAvgFor + awayAvgAgainst) / 2
    }
  }

  // ── Final pick decision ───────────────────────────────────────
  let pick: PickType
  let pickLabel: string
  let confidence: number

  if (dominantHome) {
    pick = 'ONE_UP'
    pickLabel = `${fixture.homeTeam.name} 1UP`
    confidence = Math.min(92, 58 + homeScore - awayScore)
    reasoning.push(`${fixture.homeTeam.name} expected to take and hold the lead`)
  } else if (dominantAway) {
    pick = 'ONE_UP'
    pickLabel = `${fixture.awayTeam.name} 1UP`
    confidence = Math.min(90, 56 + awayScore - homeScore)
    reasoning.push(`${fixture.awayTeam.name} expected to take and hold the lead`)
  } else if (bttsSignal >= 14 && Math.abs(homeScore - awayScore) <= 10) {
    pick = 'BTTS'
    pickLabel = 'Both Teams to Score'
    confidence = Math.min(88, 52 + bttsSignal)
  } else if (over25Signal >= 14 && Math.abs(homeScore - awayScore) <= 8) {
    pick = 'OVER_2_5'
    pickLabel = 'Over 2.5 Goals'
    confidence = Math.min(86, 50 + over25Signal)
  } else if (over15Signal >= 12 && Math.abs(homeScore - awayScore) <= 6) {
    pick = 'OVER_1_5'
    pickLabel = 'Over 1.5 Goals'
    confidence = Math.min(88, 54 + over15Signal)
  } else if (strongerHome) {
    pick = 'HOME_WIN'
    pickLabel = `${fixture.homeTeam.name} to Win`
    confidence = Math.min(88, 44 + (homeScore - awayScore))
  } else if (strongerAway) {
    pick = 'AWAY_WIN'
    pickLabel = `${fixture.awayTeam.name} to Win`
    confidence = Math.min(86, 42 + (awayScore - homeScore))
  } else if (homeScore >= awayScore) {
    pick = 'HOME_WIN'
    pickLabel = `${fixture.homeTeam.name} to Win`
    confidence = Math.min(72, 40 + (homeScore - awayScore))
  } else {
    pick = 'AWAY_WIN'
    pickLabel = `${fixture.awayTeam.name} to Win`
    confidence = Math.min(70, 38 + (awayScore - homeScore))
  }

  return { pick, pickLabel, confidence, reasoning: reasoning.slice(0, 4) }
}

const MIN_CONFIDENCE = 75   // Minimum confidence to show a pick
const TARGET_PICKS = 5      // Aim for 4–5 picks per day

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

    // Skip if we have no standings data — can't reach MIN_CONFIDENCE without it
    if (!homeStanding || !awayStanding) continue

    const analysis = analyseMatch(fixture, homeStanding, awayStanding)

    if (analysis.confidence >= MIN_CONFIDENCE) {
      analysed.push({ fixture, homeStanding, awayStanding, ...analysis })
    }
  }

  return analysed
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, count)
}
