import { NextResponse } from 'next/server'
import { getTodayNBAGames, buildNBATeamStats } from '@/lib/nba-api'
import { selectNBAPicks } from '@/lib/nba-predictor'
import { supabase } from '@/lib/supabase'

export const dynamic   = 'force-dynamic'
export const maxDuration = 120

export async function GET(req: Request) {
  const today = new Date().toISOString().split('T')[0]
  const { searchParams } = new URL(req.url)
  const force = searchParams.get('force') === 'true'

  try {
    // 1. Return cached picks unless force refresh
    if (!force) {
      const { data: existing } = await supabase
        .from('nba_predictions')
        .select('*')
        .eq('game_date', today)
        .order('confidence', { ascending: false })

      if (existing && existing.length > 0) {
        return NextResponse.json({ predictions: existing.map(fromRow), source: 'database' })
      }
    } else {
      await supabase.from('nba_predictions').delete().eq('game_date', today)
    }

    // 2. Fetch today's scheduled games
    const games = await getTodayNBAGames()
    const debug = searchParams.get('debug') === 'true'

    if (debug) {
      return NextResponse.json({ step: 'games', count: games.length, statuses: games.map(g => ({ home: g.teams.home.name, away: g.teams.visitors.name, status: g.status.long })) })
    }

    if (games.length === 0) {
      return NextResponse.json({ predictions: [], message: 'No NBA games scheduled today.' })
    }

    // 3. Build team stats from last 7 days (parallel fetch)
    const statsMap = await buildNBATeamStats()

    // 4. Run prediction engine
    const picks = selectNBAPicks(games, statsMap, 5)
    if (picks.length === 0) {
      return NextResponse.json({ predictions: [], message: 'No high-confidence NBA picks today.', gamesFound: games.length, statsTeams: statsMap.size })
    }

    // 5. Save to Supabase
    const rows = picks.map(toRow)
    await supabase.from('nba_predictions').upsert(rows, { onConflict: 'id' })

    return NextResponse.json({ predictions: picks, source: 'live' })
  } catch (err: any) {
    console.error('NBA predictions error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

function toRow(p: any) {
  return {
    id:         p.id,
    game_id:    p.gameId,
    home_team:  p.homeTeam,
    away_team:  p.awayTeam,
    home_logo:  p.homeLogo,
    away_logo:  p.awayLogo,
    home_code:  p.homeCode,
    away_code:  p.awayCode,
    game_date:  p.gameDate,
    kickoff:    p.kickoff,
    pick:       p.pick,
    pick_label: p.pickLabel,
    line:       p.line ?? null,
    confidence: p.confidence,
    reasoning:  p.reasoning,
    created_at: p.createdAt,
  }
}

function fromRow(row: any) {
  return {
    id:         row.id,
    gameId:     row.game_id,
    homeTeam:   row.home_team,
    awayTeam:   row.away_team,
    homeLogo:   row.home_logo ?? '',
    awayLogo:   row.away_logo ?? '',
    homeCode:   row.home_code ?? '',
    awayCode:   row.away_code ?? '',
    gameDate:   row.game_date,
    kickoff:    row.kickoff,
    pick:       row.pick,
    pickLabel:  row.pick_label,
    line:       row.line ?? undefined,
    confidence: row.confidence,
    reasoning:  row.reasoning ?? [],
    result:     row.result ?? undefined,
    homeScore:  row.home_score ?? undefined,
    awayScore:  row.away_score ?? undefined,
    createdAt:  row.created_at,
  }
}

export async function PATCH(req: Request) {
  const body = await req.json()
  const { id, result, homeScore, awayScore } = body

  const update: any = {}
  if (result !== undefined) update.result = result ?? null
  if (homeScore !== undefined) update.home_score = homeScore
  if (awayScore !== undefined) update.away_score = awayScore

  const { error } = await supabase.from('nba_predictions').update(update).eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
