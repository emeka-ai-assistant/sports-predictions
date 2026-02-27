import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

// POST — manually add a prediction
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { predictions } = body

    if (!predictions || !Array.isArray(predictions)) {
      return NextResponse.json({ error: 'predictions array required' }, { status: 400 })
    }

    const rows = predictions.map((p: any) => ({
      id: p.id,
      match_id: p.matchId,
      home_team: p.homeTeam,
      away_team: p.awayTeam,
      home_crest: p.homeCrest ?? '',
      away_crest: p.awayCrest ?? '',
      competition: p.competition,
      competition_code: p.competitionCode ?? '',
      competition_emblem: p.competitionEmblem ?? '',
      match_date: p.matchDate,
      kickoff: p.kickoff,
      pick: p.pick,
      pick_label: p.pickLabel,
      confidence: p.confidence,
      reasoning: p.reasoning ?? [],
      odds: p.odds ?? null,
      result: p.result ?? null,
    }))

    const { data, error } = await supabase
      .from('predictions')
      .upsert(rows, { onConflict: 'id' })
      .select()

    if (error) throw error
    return NextResponse.json({ ok: true, saved: data?.length ?? 0 })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// GET — fetch predictions with optional date filter
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const date = searchParams.get('date')

  try {
    let query = supabase
      .from('predictions')
      .select('*')
      .order('match_date', { ascending: false })
      .order('confidence', { ascending: false })

    if (date) query = query.eq('match_date', date)

    const { data, error } = await query
    if (error) throw error
    return NextResponse.json({ predictions: data || [] })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// PATCH — update odds or result
export async function PATCH(request: NextRequest) {
  try {
    const { id, odds, result, homeScore, awayScore } = await request.json()
    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

    const update: any = {}
    if (odds !== undefined) update.odds = odds
    if (result !== undefined) update.result = result
    if (homeScore !== undefined) update.home_score = homeScore
    if (awayScore !== undefined) update.away_score = awayScore

    const { data, error } = await supabase
      .from('predictions')
      .update(update)
      .eq('id', id)
      .select()
      .single()

    if (error) throw error
    return NextResponse.json({ ok: true, prediction: data })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
