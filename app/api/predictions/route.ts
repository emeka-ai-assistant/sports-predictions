import { NextResponse } from 'next/server'
import { getTodayFixtures, getMultipleStandings } from '@/lib/football-api'
import { selectTopPicks } from '@/lib/predictor'
import { Prediction } from '@/lib/types'
import { format } from 'date-fns'
import { supabase } from '@/lib/supabase'
import { enrichWithOdds } from '@/lib/odds-api'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  const today = new Date().toISOString().split('T')[0]
  const { searchParams } = new URL(req.url)
  const force = searchParams.get('force') === 'true'

  try {
    // 1. Return cached Supabase predictions (unless force refresh requested)
    if (!force) {
      const { data: existing, error: dbError } = await supabase
        .from('predictions')
        .select('*')
        .eq('match_date', today)
        .order('confidence', { ascending: false })

      if (!dbError && existing && existing.length > 0) {
        const predictions: Prediction[] = existing.map(rowToPrediction)
        return NextResponse.json({ predictions, source: 'database' })
      }
    } else {
      // Clear today's cache so we re-run the engine fresh
      await supabase.from('predictions').delete().eq('match_date', today)
    }

    // 2. Fetch today's fixtures across all supported leagues
    const fixtures = await getTodayFixtures()

    if (fixtures.length === 0) {
      return NextResponse.json({
        predictions: [],
        message: 'No fixtures scheduled today in supported leagues.',
      })
    }

    // 3. Fetch standings sequentially (avoids free-tier rate limit of 10 req/min)
    const codes = [...new Set(fixtures.map(f => f.competition.code))]
    const standingsMap = await getMultipleStandings(codes)

    // 4. Run prediction engine — 65% confidence threshold, up to 5 picks
    const picks = selectTopPicks(fixtures, standingsMap, 5)

    if (picks.length === 0) {
      return NextResponse.json({
        predictions: [],
        message: `Fixtures found but none cleared the 75% confidence threshold today. Check back tomorrow or add picks manually.`,
      })
    }

    // 5. Map to Prediction objects
    const rawPredictions = picks.map(p => {
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

    // 6. Auto-fetch odds
    const oddsMap = await enrichWithOdds(rawPredictions)
    const predictionsWithOdds: Prediction[] = rawPredictions.map(p => ({
      ...p,
      odds: oddsMap.get(`${p.homeTeam}|${p.awayTeam}`) ?? undefined,
    }))

    // Filter out picks where odds are too low to be worth betting (< 1.05)
    const predictions = predictionsWithOdds.filter(p => !p.odds || p.odds >= 1.05)

    // 7. Save to Supabase
    const rows = predictions.map(pred => ({
      id: pred.id,
      match_id: pred.matchId,
      home_team: pred.homeTeam,
      away_team: pred.awayTeam,
      home_crest: pred.homeCrest,
      away_crest: pred.awayCrest,
      competition: pred.competition,
      competition_code: pred.competitionCode,
      competition_emblem: pred.competitionEmblem,
      match_date: pred.matchDate,
      kickoff: pred.kickoff,
      pick: pred.pick,
      pick_label: pred.pickLabel,
      confidence: pred.confidence,
      reasoning: pred.reasoning,
      created_at: pred.createdAt,
    }))

    await supabase.from('predictions').upsert(rows, { onConflict: 'id' })

    return NextResponse.json({ predictions, source: 'live' })
  } catch (error: any) {
    console.error('Predictions API error:', error)
    return NextResponse.json(
      { error: 'Failed to generate predictions', details: error.message },
      { status: 500 }
    )
  }
}

function rowToPrediction(row: any): Prediction {
  return {
    id: row.id,
    matchId: row.match_id,
    homeTeam: row.home_team,
    awayTeam: row.away_team,
    homeCrest: row.home_crest ?? '',
    awayCrest: row.away_crest ?? '',
    competition: row.competition,
    competitionCode: row.competition_code,
    competitionEmblem: row.competition_emblem ?? '',
    matchDate: row.match_date,
    kickoff: row.kickoff,
    pick: row.pick,
    pickLabel: row.pick_label,
    confidence: row.confidence,
    reasoning: row.reasoning ?? [],
    odds: row.odds ?? undefined,
    result: row.result ?? undefined,
    homeScore: row.home_score ?? undefined,
    awayScore: row.away_score ?? undefined,
    createdAt: row.created_at,
  }
}
