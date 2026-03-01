import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { PickType, ResultType } from '@/lib/types'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

const API_KEY = process.env.FOOTBALL_API_KEY!
const BASE_URL = 'https://api.football-data.org/v4'
const delay = (ms: number) => new Promise(r => setTimeout(r, ms))

/**
 * Determine which team a pick label refers to (home or away).
 * e.g. "Crystal Palace +1" → match against homeTeam / awayTeam names.
 */
function pickIsForHome(pickLabel: string, homeTeam: string, awayTeam: string): boolean {
  const label = pickLabel.toLowerCase()
  const homeWords = homeTeam.toLowerCase().split(' ').filter(w => w.length > 2)
  const awayWords = awayTeam.toLowerCase().split(' ').filter(w => w.length > 2)
  const homeHits = homeWords.filter(w => label.includes(w)).length
  const awayHits = awayWords.filter(w => label.includes(w)).length
  return homeHits >= awayHits
}

/**
 * Evaluate result using full-time AND half-time score.
 *
 * ONE_UP  — "Team leads by 1+ goal at ANY POINT = WIN"
 *   WIN:  Team wins the match (they definitely led at some point)
 *         OR team was LEADING at half-time (they had the lead, even if they later
 *         drew or lost — e.g. won 2-0 then lost 2-3 but the 2-0 counts)
 *   LOSS: Team scored 0 goals total — mathematically impossible to have led
 *   VOID: Everything else — e.g. team scored but lost/drew, or was losing/level at HT.
 *         A team can score at 10' (1-0 lead), concede 3 before HT (HT 1-3), and
 *         the 1UP is still a WIN — but HT score alone can't confirm this.
 *         VOID = not counted as loss; awaiting goal-timing API for resolution.
 *
 * TWO_UP  — "Team leads by 2+ goals at ANY POINT = WIN"
 *   WIN:  FT margin ≥ 2 (definitely had a 2-goal lead)
 *         OR HT margin ≥ 2 (were 2 up at the break)
 *   LOSS: Team scored 0 or 1 goal total — impossible to have led by 2
 *   VOID: Scored 2+ but final margin < 2 — might have led by 2 before conceding
 */
function evaluateResult(
  pick: PickType,
  pickLabel: string,
  homeTeam: string,
  awayTeam: string,
  homeGoals: number,     // FT
  awayGoals: number,     // FT
  htHome: number,        // HT
  htAway: number         // HT
): ResultType {
  const total = homeGoals + awayGoals

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

    case 'ONE_UP': {
      const forHome = pickIsForHome(pickLabel, homeTeam, awayTeam)
      const pickFT  = forHome ? homeGoals : awayGoals
      const oppFT   = forHome ? awayGoals : homeGoals
      const pickHT  = forHome ? htHome    : htAway
      const oppHT   = forHome ? htAway    : htHome

      // ✅ WIN: Team wins the match — they MUST have led at some point
      if (pickFT > oppFT) return 'WIN'

      // ✅ WIN: Team was leading at half-time — they had the lead (even if they
      //         later drew or lost in the second half)
      if (pickHT > oppHT) return 'WIN'

      // ❌ LOSS: Team never scored at all — impossible to have led
      if (pickFT === 0) return 'LOSS'

      // ⬜ VOID: Anything else — e.g. team scored but lost/drew, HT was level
      //         or team was losing at HT (could have scored first before falling
      //         behind — e.g. scored at 10', then conceded 3 before HT).
      //         Cannot confirm without goal timings. Not counted as a loss.
      return 'VOID'
    }

    case 'TWO_UP': {
      const forHome  = pickIsForHome(pickLabel, homeTeam, awayTeam)
      const pickFT   = forHome ? homeGoals : awayGoals
      const oppFT    = forHome ? awayGoals : homeGoals
      const pickHT   = forHome ? htHome    : htAway
      const oppHT    = forHome ? htAway    : htHome
      const ftMargin = pickFT - oppFT
      const htMargin = pickHT - oppHT

      // ✅ WIN: FT margin >= 2 — definitely had a 2-goal lead at some point
      if (ftMargin >= 2) return 'WIN'

      // ✅ WIN: HT margin >= 2 — were 2 up at half-time (even if they later drew/lost)
      if (htMargin >= 2) return 'WIN'

      // ❌ LOSS: Scored 0 or 1 goal total — mathematically impossible to have led by 2
      if (pickFT <= 1) return 'LOSS'

      // ⬜ VOID: Scored 2+ goals but final margin < 2 (drew or lost after conceding)
      //          e.g. went 2-0 up then conceded to end 2-2 or 2-3 — might have
      //          had the 2-goal lead. Can't confirm without goal timings.
      return 'VOID'
    }

    case 'HANDICAP_PLUS_1': {
      // Identified team gets +1 goal head start
      // WIN: win or draw  |  VOID: lose by exactly 1  |  LOSS: lose by 2+
      const forHome = pickIsForHome(pickLabel, homeTeam, awayTeam)
      const diff = forHome ? homeGoals - awayGoals : awayGoals - homeGoals
      if (diff >= 0)  return 'WIN'
      if (diff === -1) return 'VOID'
      return 'LOSS'
    }

    case 'HANDICAP_PLUS_2': {
      // WIN: win, draw, or lose by 1  |  VOID: lose by exactly 2  |  LOSS: lose by 3+
      const forHome = pickIsForHome(pickLabel, homeTeam, awayTeam)
      const diff = forHome ? homeGoals - awayGoals : awayGoals - homeGoals
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
  const key = new URL(request.url).searchParams.get('key')

  if (cronSecret && authHeader !== `Bearer ${cronSecret}` && key !== cronSecret) {
    return new Response('Unauthorized', { status: 401 })
  }

  const today = new Date().toISOString().split('T')[0]

  // Get pending predictions (no result yet)
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
      const res = await fetch(`${BASE_URL}/matches/${pred.match_id}`, {
        headers: { 'X-Auth-Token': API_KEY },
      })

      if (!res.ok) {
        skipped.push(`${pred.home_team} vs ${pred.away_team} (API ${res.status})`)
        await delay(400)
        continue
      }

      const match = await res.json()

      if (match.status !== 'FINISHED') {
        skipped.push(`${pred.home_team} vs ${pred.away_team} (${match.status})`)
        await delay(400)
        continue
      }

      const homeGoals: number = match.score?.fullTime?.home  ?? 0
      const awayGoals: number = match.score?.fullTime?.away  ?? 0
      const htHome:    number = match.score?.halfTime?.home  ?? 0
      const htAway:    number = match.score?.halfTime?.away  ?? 0

      const result = evaluateResult(
        pred.pick as PickType,
        pred.pick_label,
        pred.home_team,
        pred.away_team,
        homeGoals, awayGoals,
        htHome,    htAway
      )

      // Save to Supabase (try with HT columns first; fall back if columns don't exist yet)
      const { error: updateErr } = await supabase
        .from('predictions')
        .update({
          result,
          home_score:    homeGoals,
          away_score:    awayGoals,
          ht_home_score: htHome,
          ht_away_score: htAway,
        })
        .eq('id', pred.id)

      if (updateErr) {
        // HT columns may not exist in old schema — retry without them
        await supabase
          .from('predictions')
          .update({ result, home_score: homeGoals, away_score: awayGoals })
          .eq('id', pred.id)
      }

      const scoreStr = `FT: ${homeGoals}–${awayGoals}  HT: ${htHome}–${htAway}`
      updated.push(`${pred.home_team} vs ${pred.away_team}: ${scoreStr} → ${result} (${pred.pick_label})`)
      console.log(`[RESULTS] ✓ ${pred.home_team} vs ${pred.away_team}: ${scoreStr} → ${result}`)

    } catch (e: any) {
      skipped.push(`${pred.home_team} vs ${pred.away_team} (${e.message})`)
    }

    await delay(400)
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
