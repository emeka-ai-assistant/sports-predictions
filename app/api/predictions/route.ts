import { NextResponse } from 'next/server'
import { getTodayFixtures, getMultipleStandings, getH2H } from '@/lib/football-api'
import { selectTopMatches } from '@/lib/predictor'
import { Prediction } from '@/lib/types'
import { format } from 'date-fns'
import { supabase } from '@/lib/supabase'

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
        .order('match_id', { ascending: true })

      if (!dbError && existing && existing.length > 0) {
        const predictions: Prediction[] = existing.map(rowToPrediction)
        return NextResponse.json({ predictions, source: 'database' })
      }
    } else {
      await supabase.from('predictions').delete().eq('match_date', today)
    }

    // 2. Fetch today's fixtures + computed form
    const { fixtures, formMap } = await getTodayFixtures()

    if (fixtures.length === 0) {
      return NextResponse.json({
        predictions: [],
        message: 'No fixtures scheduled today in supported leagues.',
      })
    }

    // 3. Fetch standings
    const codes = [...new Set(fixtures.map(f => f.competition.code))]
    const standingsMap = await getMultipleStandings(codes)

    // 4. Fetch H2H for each fixture
    const h2hMap = new Map<number, any>()
    for (const fixture of fixtures) {
      const h2h = await getH2H(fixture.id, fixture.homeTeam.id, fixture.awayTeam.id)
      if (h2h) h2hMap.set(fixture.id, h2h)
      await new Promise(r => setTimeout(r, 350))
    }

    // 5. Run multi-market engine — top 6 matches × 4 markets each
    const matchCards = selectTopMatches(fixtures, standingsMap, h2hMap, 6, formMap)

    if (matchCards.length === 0) {
      return NextResponse.json({
        predictions: [],
        message: 'No fixtures with enough data found today.',
      })
    }

    // 6. Flatten all markets into Prediction rows
    const now = new Date().toISOString()
    const predictions: Prediction[] = []

    for (const card of matchCards) {
      const date = new Date(card.fixture.utcDate)
      const matchDate = format(date, 'yyyy-MM-dd')
      const kickoff = format(date, 'HH:mm')

      for (const market of card.markets) {
        const id = `${card.fixture.id}-${matchDate}-${market.marketType}`
        predictions.push({
          id,
          matchId: card.fixture.id,
          homeTeam: card.fixture.homeTeam.name,
          awayTeam: card.fixture.awayTeam.name,
          homeCrest: card.fixture.homeTeam.crest || '',
          awayCrest: card.fixture.awayTeam.crest || '',
          competition: card.fixture.competition.name,
          competitionCode: card.fixture.competition.code,
          competitionEmblem: card.fixture.competition.emblem || '',
          matchDate,
          kickoff,
          pick: market.pick,
          pickLabel: market.predLabel,
          confidence: market.confidence,
          reasoning: market.reasoning,
          createdAt: now,
        })
      }
    }

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
    homeScore:   row.home_score    ?? undefined,
    awayScore:   row.away_score    ?? undefined,
    htHomeScore: row.ht_home_score ?? undefined,
    htAwayScore: row.ht_away_score ?? undefined,
    createdAt: row.created_at,
  }
}
