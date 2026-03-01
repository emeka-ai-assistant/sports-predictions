import { NextRequest, NextResponse } from 'next/server'
import { revalidateTag } from 'next/cache'
import { getTodayFixtures, prefetchAllStandings, getH2H } from '@/lib/football-api'
import { selectTopPicks } from '@/lib/predictor'
import { enrichWithOdds } from '@/lib/odds-api'
import { supabase } from '@/lib/supabase'
import { format } from 'date-fns'
import { Prediction } from '@/lib/types'

export const dynamic = 'force-dynamic'
export const maxDuration = 300 // 5 min — cron does more work now

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return new Response('Unauthorized', { status: 401 })
  }

  const startedAt = Date.now()
  const today = new Date().toISOString().split('T')[0]
  console.log(`[CRON] Daily refresh started — ${new Date().toISOString()}`)

  try {
    // 1. Bust Next.js cache
    revalidateTag('predictions')
    revalidateTag('football-data')

    // 2. Pre-warm ALL standings into Supabase cache
    //    This uses up ~9 API calls but runs only once per day at 7 AM.
    //    All subsequent predictions requests read standings from Supabase (0 API calls).
    const standingsMap = await prefetchAllStandings()
    console.log(`[CRON] Standings cached for ${standingsMap.size} leagues`)

    // 3. Fetch today's fixtures + recent results for form computation
    const { fixtures, formMap } = await getTodayFixtures()
    console.log(`[CRON] ${fixtures.length} fixtures found for ${today}`)

    if (fixtures.length === 0) {
      return NextResponse.json({
        ok: true, message: 'No fixtures today', date: today,
        durationMs: Date.now() - startedAt,
      })
    }

    // 4. Fetch H2H for each fixture
    const h2hMap = new Map<number, any>()
    for (const fixture of fixtures) {
      const h2h = await getH2H(fixture.id, fixture.homeTeam.id, fixture.awayTeam.id)
      if (h2h) h2hMap.set(fixture.id, h2h)
      await new Promise(r => setTimeout(r, 350))
    }

    // 5. Run prediction engine with H2H + computed form data
    const picks = selectTopPicks(fixtures, standingsMap, h2hMap, 5, formMap)

    if (picks.length === 0) {
      return NextResponse.json({
        ok: true, message: 'Fixtures found but none cleared 75% confidence', date: today,
        fixturesFound: fixtures.length, durationMs: Date.now() - startedAt,
      })
    }

    // 5. Build prediction objects
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

    // Filter out picks where odds are below 1.05 (not worth betting)
    const predictions = predictionsWithOdds.filter(p => !p.odds || p.odds >= 1.05)

    // 7. Save predictions to Supabase (clear today's first to avoid stale picks)
    await supabase.from('predictions').delete().eq('match_date', today)
    await supabase.from('predictions').upsert(
      predictions.map(pred => ({
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
      })),
      { onConflict: 'id' }
    )

    const summary = predictions.map(p => ({
      match: `${p.homeTeam} vs ${p.awayTeam}`,
      pick: p.pickLabel,
      confidence: p.confidence,
      odds: p.odds,
      kickoff: p.kickoff,
    }))

    console.log(`[CRON] Done in ${Date.now() - startedAt}ms. ${predictions.length} picks saved.`)

    return NextResponse.json({
      ok: true, date: today,
      standingsCached: standingsMap.size,
      fixturesFound: fixtures.length,
      picksGenerated: predictions.length,
      picks: summary,
      durationMs: Date.now() - startedAt,
    })
  } catch (error: any) {
    console.error('[CRON] Error:', error.message)
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  }
}
