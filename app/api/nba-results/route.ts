import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { NBAPickType } from '@/lib/nba-types'

export const dynamic   = 'force-dynamic'
export const maxDuration = 60

const API_KEY = process.env.NBA_API_KEY!
const BASE_URL = 'https://v2.nba.api-sports.io'
const delay = (ms: number) => new Promise(r => setTimeout(r, ms))

function evaluateNBA(
  pick: NBAPickType,
  line: number | null,
  homeScore: number,
  awayScore: number
): 'WIN' | 'LOSS' | 'VOID' {
  const total = homeScore + awayScore
  switch (pick) {
    case 'HOME_WIN':  return homeScore > awayScore ? 'WIN' : 'LOSS'
    case 'AWAY_WIN':  return awayScore > homeScore ? 'WIN' : 'LOSS'
    case 'OVER':      return line !== null ? (total > line ? 'WIN' : 'LOSS') : 'VOID'
    case 'UNDER':     return line !== null ? (total < line ? 'WIN' : 'LOSS') : 'VOID'
    default:          return 'VOID'
  }
}

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  const key        = new URL(req.url).searchParams.get('key')
  const secret     = process.env.CRON_SECRET
  if (secret && authHeader !== `Bearer ${secret}` && key !== secret) {
    return new Response('Unauthorized', { status: 401 })
  }

  const today = new Date().toISOString().split('T')[0]

  const { data: pending } = await supabase
    .from('nba_predictions')
    .select('*')
    .eq('game_date', today)
    .is('result', null)

  if (!pending || pending.length === 0) {
    return NextResponse.json({ ok: true, message: 'No pending NBA picks', updated: 0 })
  }

  const updated: string[] = []

  for (const pred of pending) {
    try {
      const res = await fetch(`${BASE_URL}/games?id=${pred.game_id}`, {
        headers: { 'x-apisports-key': API_KEY },
      })
      const data = await res.json()
      const game = data.response?.[0]
      if (!game || game.status.long !== 'Finished') continue

      const homeScore = game.scores.home.points     ?? 0
      const awayScore = game.scores.visitors.points ?? 0
      const result    = evaluateNBA(pred.pick, pred.line, homeScore, awayScore)

      await supabase
        .from('nba_predictions')
        .update({ result, home_score: homeScore, away_score: awayScore })
        .eq('id', pred.id)

      updated.push(`${pred.home_team} vs ${pred.away_team}: ${homeScore}–${awayScore} → ${result} (${pred.pick_label})`)
    } catch { /* skip */ }
    await delay(300)
  }

  return NextResponse.json({ ok: true, updated: updated.length, results: updated })
}
