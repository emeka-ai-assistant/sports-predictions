import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { PickType, ResultType } from '@/lib/types'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

const API_KEY = process.env.FOOTBALL_API_KEY!
const BASE_URL = 'https://api.football-data.org/v4'
const delay = (ms: number) => new Promise(r => setTimeout(r, ms))

/**
 * Evaluate the result of a pick given the full-time score.
 *
 * For ONE_UP / TWO_UP: we use the final result as a proxy
 *   (team must have led at some point — if they win, they almost certainly led)
 *
 * For HANDICAP picks: pickLabel contains the team that gets the handicap,
 *   e.g. "Crystal Palace +1" means Crystal Palace gets +1 goal start.
 */
function evaluateResult(
  pick: PickType,
  pickLabel: string,
  homeTeam: string,
  awayTeam: string,
  homeGoals: number,
  awayGoals: number
): ResultType {
  const total = homeGoals + awayGoals

  // Identify which team the pick is for (used by win/handicap picks)
  const labelLower = pickLabel.toLowerCase()
  const homeWords = homeTeam.toLowerCase().split(' ').filter(w => w.length > 2)
  const awayWords = awayTeam.toLowerCase().split(' ').filter(w => w.length > 2)
  const homeScore = homeWords.filter(w => labelLower.includes(w)).length
  const awayScore = awayWords.filter(w => labelLower.includes(w)).length
  const pickIsForHome = homeScore >= awayScore

  switch (pick) {
    case 'HOME_WIN':
      return homeGoals > awayGoals ? 'WIN' : 'LOSS'

    case 'AWAY_WIN':
      return awayGoals > homeGoals ? 'WIN' : 'LOSS'

    case 'DRAW':
      return homeGoals === awayGoals ? 'WIN' : 'LOSS'

    case 'OVER_0_5':
      return total >= 1 ? 'WIN' : 'LOSS'

    case 'OVER_1_5':
      return total >= 2 ? 'WIN' : 'LOSS'

    case 'OVER_2_5':
      return total >= 3 ? 'WIN' : 'LOSS'

    case 'BTTS':
      return homeGoals >= 1 && awayGoals >= 1 ? 'WIN' : 'LOSS'

    case 'ONE_UP':
      // Proxy: if picked team wins → they led at some point → WIN
      if (pickIsForHome) return homeGoals > awayGoals ? 'WIN' : 'LOSS'
      return awayGoals > homeGoals ? 'WIN' : 'LOSS'

    case 'TWO_UP':
      // Proxy: team wins by 2+ → they led by 2+ at some point
      if (pickIsForHome) return homeGoals - awayGoals >= 2 ? 'WIN' : 'LOSS'
      return awayGoals - homeGoals >= 2 ? 'WIN' : 'LOSS'

    case 'HANDICAP_PLUS_1':
      // Team gets +1: WIN if win or draw; VOID if lose by exactly 1; LOSS if lose by 2+
      if (pickIsForHome) {
        const diff = homeGoals - awayGoals
        if (diff >= 0) return 'WIN'
        if (diff === -1) return 'VOID'
        return 'LOSS'
      } else {
        const diff = awayGoals - homeGoals
        if (diff >= 0) return 'WIN'
        if (diff === -1) return 'VOID'
        return 'LOSS'
      }

    case 'HANDICAP_PLUS_2':
      // Team gets +2: WIN if lose by <=1; VOID if lose by exactly 2; LOSS if lose by 3+
      if (pickIsForHome) {
        const diff = homeGoals - awayGoals
        if (diff >= -1) return 'WIN'
        if (diff === -2) return 'VOID'
        return 'LOSS'
      } else {
        const diff = awayGoals - homeGoals
        if (diff >= -1) return 'WIN'
        if (diff === -2) return 'VOID'
        return 'LOSS'
      }

    default:
      return 'VOID'
  }
}

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    // Also allow manual trigger from ?key= query param
    const key = new URL(request.url).searchParams.get('key')
    if (key !== cronSecret) {
      return new Response('Unauthorized', { status: 401 })
    }
  }

  const today = new Date().toISOString().split('T')[0]

  // 1. Get today's pending predictions
  const { data: pending, error } = await supabase
    .from('predictions')
    .select('*')
    .eq('match_date', today)
    .is('result', null)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  if (!pending || pending.length === 0) {
    return NextResponse.json({ ok: true, message: 'No pending predictions for today', updated: 0 })
  }

  console.log(`[RESULTS] Checking ${pending.length} pending predictions...`)

  const updated: string[] = []
  const skipped: string[] = []

  for (const pred of pending) {
    try {
      // Fetch match status from API
      const res = await fetch(`${BASE_URL}/matches/${pred.match_id}`, {
        headers: { 'X-Auth-Token': API_KEY },
      })
      if (!res.ok) {
        skipped.push(`${pred.home_team} vs ${pred.away_team} (API ${res.status})`)
        await delay(400)
        continue
      }

      const data = await res.json()
      const match = data

      if (match.status !== 'FINISHED') {
        skipped.push(`${pred.home_team} vs ${pred.away_team} (${match.status})`)
        await delay(400)
        continue
      }

      const homeGoals: number = match.score?.fullTime?.home ?? 0
      const awayGoals: number = match.score?.fullTime?.away ?? 0

      const result = evaluateResult(
        pred.pick as PickType,
        pred.pick_label,
        pred.home_team,
        pred.away_team,
        homeGoals,
        awayGoals
      )

      // Update Supabase
      await supabase
        .from('predictions')
        .update({
          result,
          home_score: homeGoals,
          away_score: awayGoals,
        })
        .eq('id', pred.id)

      updated.push(`${pred.home_team} vs ${pred.away_team}: ${homeGoals}–${awayGoals} → ${result} (${pred.pick_label})`)
      console.log(`[RESULTS] ✓ ${pred.home_team} vs ${pred.away_team}: ${homeGoals}–${awayGoals} → ${result}`)

    } catch (e: any) {
      skipped.push(`${pred.home_team} vs ${pred.away_team} (${e.message})`)
    }

    await delay(400) // respect 10 req/min rate limit
  }

  return NextResponse.json({
    ok: true,
    date: today,
    updated: updated.length,
    skipped: skipped.length,
    results: updated,
    notFinished: skipped,
  })
}
