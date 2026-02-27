import { NextResponse } from 'next/server'
import { getTodayFixtures, getStandings } from '@/lib/football-api'
import { selectTopPicks } from '@/lib/predictor'
import { Prediction } from '@/lib/types'
import { format } from 'date-fns'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const fixtures = await getTodayFixtures()

    if (fixtures.length === 0) {
      return NextResponse.json({
        predictions: [],
        message: 'No fixtures scheduled today in supported leagues.',
      })
    }

    // Fetch standings for each competition that has matches today
    const codes = [...new Set(fixtures.map(f => f.competition.code))]
    const standingsMap = new Map<string, any[]>()

    await Promise.allSettled(
      codes.map(async code => {
        const standings = await getStandings(code)
        if (standings.length > 0) standingsMap.set(code, standings)
      })
    )

    // Run prediction engine
    const picks = selectTopPicks(fixtures, standingsMap, 6)

    if (picks.length === 0) {
      return NextResponse.json({
        predictions: [],
        message: 'No high-confidence picks found for today.',
      })
    }

    // Map to Prediction objects
    const predictions: Prediction[] = picks.map(p => {
      const date = new Date(p.fixture.utcDate)
      return {
        id: `${p.fixture.id}-${format(date, 'yyyy-MM-dd')}`,
        matchId: p.fixture.id,
        homeTeam: p.fixture.homeTeam.name,
        awayTeam: p.fixture.awayTeam.name,
        homeCrest: p.fixture.homeTeam.crest || '',
        awayCrest: p.fixture.awayTeam.crest || '',
        competition: p.fixture.competition.name,
        competitionCode: p.fixture.competition.code,
        competitionEmblem: p.fixture.competition.emblem || '',
        matchDate: format(date, 'yyyy-MM-dd'),
        kickoff: format(date, 'HH:mm'),
        pick: p.pick,
        pickLabel: p.pickLabel,
        confidence: p.confidence,
        reasoning: p.reasoning,
        createdAt: new Date().toISOString(),
      }
    })

    return NextResponse.json({ predictions })
  } catch (error: any) {
    console.error('Predictions API error:', error)
    return NextResponse.json(
      { error: 'Failed to generate predictions', details: error.message },
      { status: 500 }
    )
  }
}
