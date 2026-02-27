import { NextRequest, NextResponse } from 'next/server'
import { getOddsForLeague, extractOdds, LEAGUE_TO_SPORT } from '@/lib/odds-api'

export const dynamic = 'force-dynamic'

// GET /api/odds?competitionCode=PL&homeTeam=Arsenal&awayTeam=Chelsea
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const code = searchParams.get('competitionCode')
  const homeTeam = searchParams.get('homeTeam')
  const awayTeam = searchParams.get('awayTeam')

  if (!code || !homeTeam || !awayTeam) {
    return NextResponse.json({ error: 'competitionCode, homeTeam, awayTeam required' }, { status: 400 })
  }

  const sportKey = LEAGUE_TO_SPORT[code]
  if (!sportKey) {
    return NextResponse.json({ error: `No odds available for competition: ${code}` }, { status: 404 })
  }

  const games = await getOddsForLeague(sportKey, 'h2h,totals')

  // Try to find matching game
  const game = games.find(g =>
    g.home_team.toLowerCase().includes(homeTeam.split(' ')[0].toLowerCase()) ||
    homeTeam.toLowerCase().includes(g.home_team.split(' ')[0].toLowerCase())
  )

  if (!game) {
    return NextResponse.json({ error: 'Match not found in odds data', available: games.length }, { status: 404 })
  }

  const odds = extractOdds(game, game.home_team, game.away_team)

  return NextResponse.json({
    match: `${game.home_team} vs ${game.away_team}`,
    commence: game.commence_time,
    odds,
    bookmakers: (game.bookmakers || []).map((b: any) => b.title),
  })
}
