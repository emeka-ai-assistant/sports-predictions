import { NextResponse } from 'next/server'
import { getTodayFixtures, getStandings } from '@/lib/football-api'
import { selectTopPicks } from '@/lib/predictor'
import { Prediction } from '@/lib/types'
import { format } from 'date-fns'
import { supabase } from '@/lib/supabase'
import { enrichWithOdds } from '@/lib/odds-api'

export const dynamic = 'force-dynamic'

export async function GET() {
  const today = new Date().toISOString().split('T')[0]

  try {
    // 1. Check Supabase for today's predictions first (avoids redundant API calls)
    const { data: existing, error: dbError } = await supabase
      .from('predictions')
      .select('*')
      .eq('match_date', today)
      .order('confidence', { ascending: false })

    if (!dbError && existing && existing.length > 0) {
      // Return stored predictions (preserves user-set odds + results)
      const predictions: Prediction[] = existing.map((row: any) => ({
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
      }))
      return NextResponse.json({ predictions, source: 'database' })
    }

    // 2. None found — fetch fresh from football-data.org
    const fixtures = await getTodayFixtures()

    if (fixtures.length === 0) {
      return NextResponse.json({
        predictions: [],
        message: 'No fixtures scheduled today in supported leagues.',
      })
    }

    // 3. Fetch standings for each competition
    const codes = [...new Set(fixtures.map(f => f.competition.code))]
    const standingsMap = new Map<string, any[]>()

    await Promise.allSettled(
      codes.map(async code => {
        const standings = await getStandings(code)
        if (standings.length > 0) standingsMap.set(code, standings)
      })
    )

    // 4. Run prediction engine
    const picks = selectTopPicks(fixtures, standingsMap, 6)

    if (picks.length === 0) {
      return NextResponse.json({
        predictions: [],
        message: 'No high-confidence picks found for today.',
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

    // 5b. Auto-fetch odds from The Odds API
    const oddsMap = await enrichWithOdds(rawPredictions)
    const predictions: Prediction[] = rawPredictions.map(p => ({
      ...p,
      odds: oddsMap.get(`${p.homeTeam}|${p.awayTeam}`) ?? undefined,
    }))

    // 6. Save to Supabase for future requests
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
