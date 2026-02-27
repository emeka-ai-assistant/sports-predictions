import { Fixture, TeamStanding, AnalysedFixture, PickType } from './types'

function parseForm(form: string | null): number {
  if (!form) return 0
  const games = form.split(',').slice(-5)
  return games.reduce((score, g) => {
    if (g === 'W') return score + 3
    if (g === 'D') return score + 1
    return score
  }, 0)
}

function getFormString(form: string | null): string {
  if (!form) return 'No data'
  return form.split(',').slice(-5).join(' ')
}

function analyseMatch(
  fixture: Fixture,
  homeStanding?: TeamStanding,
  awayStanding?: TeamStanding
): { pick: PickType; pickLabel: string; confidence: number; reasoning: string[] } {
  const reasoning: string[] = []
  let homeScore = 0
  let awayScore = 0
  let bttsSignal = 0
  let overSignal = 0

  // ── Position advantage ──────────────────────────────────────────
  if (homeStanding && awayStanding) {
    const posDiff = awayStanding.position - homeStanding.position

    if (posDiff >= 10) {
      homeScore += 20
      reasoning.push(`${fixture.homeTeam.name} is ${posDiff} places above ${fixture.awayTeam.name} in the table`)
    } else if (posDiff >= 5) {
      homeScore += 12
      reasoning.push(`${fixture.homeTeam.name} holds a ${posDiff}-place table advantage`)
    } else if (posDiff <= -10) {
      awayScore += 20
      reasoning.push(`${fixture.awayTeam.name} is ${Math.abs(posDiff)} places above ${fixture.homeTeam.name} in the table`)
    } else if (posDiff <= -5) {
      awayScore += 12
      reasoning.push(`${fixture.awayTeam.name} has a ${Math.abs(posDiff)}-place advantage in the standings`)
    }

    // ── Points gap ──────────────────────────────────────────────
    const ptsDiff = homeStanding.points - awayStanding.points
    if (ptsDiff >= 15) {
      homeScore += 15
      reasoning.push(`${fixture.homeTeam.name} leads by ${ptsDiff} points`)
    } else if (ptsDiff >= 8) {
      homeScore += 8
      reasoning.push(`${fixture.homeTeam.name} leads on points (+${ptsDiff})`)
    } else if (ptsDiff <= -15) {
      awayScore += 15
      reasoning.push(`${fixture.awayTeam.name} leads by ${Math.abs(ptsDiff)} points`)
    } else if (ptsDiff <= -8) {
      awayScore += 8
      reasoning.push(`${fixture.awayTeam.name} leads on points (+${Math.abs(ptsDiff)})`)
    }

    // ── Form ──────────────────────────────────────────────────
    const homeFormScore = parseForm(homeStanding.form)
    const awayFormScore = parseForm(awayStanding.form)
    const formDiff = homeFormScore - awayFormScore

    if (homeFormScore >= 12) {
      homeScore += 12
      reasoning.push(`${fixture.homeTeam.name} in excellent form: ${getFormString(homeStanding.form)}`)
    } else if (homeFormScore >= 9) {
      homeScore += 6
      reasoning.push(`${fixture.homeTeam.name} good recent form: ${getFormString(homeStanding.form)}`)
    }

    if (awayFormScore >= 12) {
      awayScore += 12
      reasoning.push(`${fixture.awayTeam.name} in excellent form: ${getFormString(awayStanding.form)}`)
    } else if (awayFormScore >= 9) {
      awayScore += 6
      reasoning.push(`${fixture.awayTeam.name} good recent form: ${getFormString(awayStanding.form)}`)
    }

    // ── Goals / BTTS / Over signals ────────────────────────────
    const homeAvgGoals = homeStanding.playedGames > 0
      ? homeStanding.goalsFor / homeStanding.playedGames : 0
    const awayAvgGoals = awayStanding.playedGames > 0
      ? awayStanding.goalsFor / awayStanding.playedGames : 0
    const homeConcedes = homeStanding.playedGames > 0
      ? homeStanding.goalsAgainst / homeStanding.playedGames : 0
    const awayConcedes = awayStanding.playedGames > 0
      ? awayStanding.goalsAgainst / awayStanding.playedGames : 0

    if (homeAvgGoals >= 1.8) {
      overSignal += 8
      reasoning.push(`${fixture.homeTeam.name} averages ${homeAvgGoals.toFixed(1)} goals/game`)
    }
    if (awayAvgGoals >= 1.5) {
      overSignal += 6
      reasoning.push(`${fixture.awayTeam.name} averages ${awayAvgGoals.toFixed(1)} goals/game`)
    }
    if (homeAvgGoals >= 1.5 && awayConcedes >= 1.5) {
      bttsSignal += 8
      reasoning.push(`${fixture.homeTeam.name} scores freely; ${fixture.awayTeam.name} concedes ${awayConcedes.toFixed(1)}/game`)
    }
    if (awayAvgGoals >= 1.3 && homeConcedes >= 1.3) {
      bttsSignal += 6
      reasoning.push(`${fixture.awayTeam.name} scores regularly; ${fixture.homeTeam.name} concedes ${homeConcedes.toFixed(1)}/game`)
    }

    // ── Win rate advantage ──────────────────────────────────────
    const homeWinRate = homeStanding.playedGames > 0
      ? (homeStanding.won / homeStanding.playedGames) * 100 : 0
    const awayWinRate = awayStanding.playedGames > 0
      ? (awayStanding.won / awayStanding.playedGames) * 100 : 0

    if (homeWinRate >= 60) {
      homeScore += 8
      reasoning.push(`${fixture.homeTeam.name} wins ${homeWinRate.toFixed(0)}% of games`)
    }
    if (awayWinRate >= 60) {
      awayScore += 8
      reasoning.push(`${fixture.awayTeam.name} wins ${awayWinRate.toFixed(0)}% of games`)
    }
  }

  // Home advantage bonus
  homeScore += 5
  reasoning.push(`${fixture.homeTeam.name} playing at home`)

  // ── Decide pick ─────────────────────────────────────────────
  const totalScore = Math.max(homeScore, awayScore, bttsSignal, overSignal)
  let pick: PickType
  let pickLabel: string
  let confidence: number

  // BTTS or Over 2.5 if both teams are prolific and scores are close
  if (bttsSignal >= 14 && Math.abs(homeScore - awayScore) <= 10) {
    pick = 'BTTS'
    pickLabel = 'Both Teams to Score'
    confidence = Math.min(90, 55 + bttsSignal)
    if (!reasoning.some(r => r.includes('Both teams'))) {
      reasoning.push('Both teams have been scoring consistently')
    }
  } else if (overSignal >= 16 && Math.abs(homeScore - awayScore) <= 8) {
    pick = 'OVER_2_5'
    pickLabel = 'Over 2.5 Goals'
    confidence = Math.min(88, 50 + overSignal)
  } else if (homeScore > awayScore + 10) {
    pick = 'HOME_WIN'
    pickLabel = `${fixture.homeTeam.name} to Win`
    confidence = Math.min(90, 45 + (homeScore - awayScore))
  } else if (awayScore > homeScore + 8) {
    pick = 'AWAY_WIN'
    pickLabel = `${fixture.awayTeam.name} to Win`
    confidence = Math.min(88, 40 + (awayScore - homeScore))
  } else if (homeScore > awayScore) {
    pick = 'HOME_WIN'
    pickLabel = `${fixture.homeTeam.name} to Win`
    confidence = Math.min(78, 40 + (homeScore - awayScore))
  } else {
    pick = 'AWAY_WIN'
    pickLabel = `${fixture.awayTeam.name} to Win`
    confidence = Math.min(75, 38 + (awayScore - homeScore))
  }

  return { pick, pickLabel, confidence, reasoning: reasoning.slice(0, 4) }
}

export function selectTopPicks(
  fixtures: Fixture[],
  standingsMap: Map<string, TeamStanding[]>,
  count = 6
): AnalysedFixture[] {
  const analysed: AnalysedFixture[] = []

  for (const fixture of fixtures) {
    const standings = standingsMap.get(fixture.competition.code) || []
    const homeStanding = standings.find(s => s.team.id === fixture.homeTeam.id)
    const awayStanding = standings.find(s => s.team.id === fixture.awayTeam.id)

    const analysis = analyseMatch(fixture, homeStanding, awayStanding)

    // Only include if confidence >= 60
    if (analysis.confidence >= 60) {
      analysed.push({
        fixture,
        homeStanding,
        awayStanding,
        ...analysis,
      })
    }
  }

  // Sort by confidence descending, take top N
  return analysed
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, count)
}
