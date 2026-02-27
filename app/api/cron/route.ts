import { NextRequest, NextResponse } from 'next/server'
import { revalidateTag } from 'next/cache'
import { getTodayFixtures, getStandings } from '@/lib/football-api'
import { selectTopPicks } from '@/lib/predictor'
import { format } from 'date-fns'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function GET(request: NextRequest) {
  // Verify cron secret — Vercel auto-injects Authorization header
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return new Response('Unauthorized', { status: 401 })
  }

  const startedAt = Date.now()
  console.log(`[CRON] Daily predictions refresh started at ${new Date().toISOString()}`)

  try {
    // 1. Bust the Next.js cache for all football data
    revalidateTag('predictions')
    revalidateTag('football-data')

    // 2. Fetch today's fixtures fresh (no-store bypasses cache)
    const today = new Date().toISOString().split('T')[0]
    const fixtures = await getTodayFixtures()

    if (fixtures.length === 0) {
      console.log('[CRON] No fixtures today.')
      return NextResponse.json({
        ok: true,
        message: 'No fixtures today',
        date: today,
        durationMs: Date.now() - startedAt,
      })
    }

    // 3. Fetch standings for all competitions that have matches today
    const codes = [...new Set(fixtures.map(f => f.competition.code))]
    const standingsMap = new Map<string, any[]>()

    await Promise.allSettled(
      codes.map(async code => {
        const standings = await getStandings(code)
        if (standings.length > 0) standingsMap.set(code, standings)
      })
    )

    // 4. Run prediction analysis
    const picks = selectTopPicks(fixtures, standingsMap, 6)

    // 5. Build summary
    const summary = picks.map(p => ({
      match: `${p.fixture.homeTeam.name} vs ${p.fixture.awayTeam.name}`,
      competition: p.fixture.competition.name,
      pick: p.pickLabel,
      confidence: p.confidence,
      kickoff: format(new Date(p.fixture.utcDate), 'HH:mm'),
    }))

    const durationMs = Date.now() - startedAt
    console.log(`[CRON] Done in ${durationMs}ms. Found ${picks.length} picks.`)

    return NextResponse.json({
      ok: true,
      date: today,
      fixturesFound: fixtures.length,
      picksGenerated: picks.length,
      picks: summary,
      durationMs,
    })
  } catch (error: any) {
    console.error('[CRON] Error:', error.message)
    return NextResponse.json(
      { ok: false, error: error.message },
      { status: 500 }
    )
  }
}
