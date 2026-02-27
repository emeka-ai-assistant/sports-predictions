'use client'
import { Prediction, HistoryStats, ResultType } from './types'
import { supabase } from './supabase'

const LOCAL_KEY = 'sports_predictions_v2'

// ── Helpers ──────────────────────────────────────────────────────────────

function toRow(p: Prediction) {
  return {
    id: p.id,
    match_id: p.matchId,
    home_team: p.homeTeam,
    away_team: p.awayTeam,
    home_crest: p.homeCrest,
    away_crest: p.awayCrest,
    competition: p.competition,
    competition_code: p.competitionCode,
    competition_emblem: p.competitionEmblem,
    match_date: p.matchDate,
    kickoff: p.kickoff,
    pick: p.pick,
    pick_label: p.pickLabel,
    confidence: p.confidence,
    reasoning: p.reasoning,
    odds: p.odds ?? null,
    result: p.result ?? null,
    home_score: p.homeScore ?? null,
    away_score: p.awayScore ?? null,
    created_at: p.createdAt,
  }
}

function fromRow(row: any): Prediction {
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
    homeScore: row.home_score ?? undefined,
    awayScore: row.away_score ?? undefined,
    createdAt: row.created_at,
  }
}

// ── Local fallback ────────────────────────────────────────────────────────

function localGet(): Prediction[] {
  if (typeof window === 'undefined') return []
  try {
    return JSON.parse(localStorage.getItem(LOCAL_KEY) || '[]')
  } catch { return [] }
}

function localSet(preds: Prediction[]) {
  if (typeof window === 'undefined') return
  localStorage.setItem(LOCAL_KEY, JSON.stringify(preds))
}

// ── Public API ────────────────────────────────────────────────────────────

export async function getAllPredictions(): Promise<Prediction[]> {
  try {
    const { data, error } = await supabase
      .from('predictions')
      .select('*')
      .order('match_date', { ascending: false })
      .order('created_at', { ascending: false })

    if (error) throw error
    const preds = (data || []).map(fromRow)
    localSet(preds) // keep local in sync
    return preds
  } catch {
    return localGet()
  }
}

export async function getTodayPredictions(): Promise<Prediction[]> {
  const today = new Date().toISOString().split('T')[0]
  try {
    const { data, error } = await supabase
      .from('predictions')
      .select('*')
      .eq('match_date', today)
      .order('confidence', { ascending: false })

    if (error) throw error
    return (data || []).map(fromRow)
  } catch {
    return localGet().filter(p => p.matchDate === today)
  }
}

export async function upsertPredictions(incoming: Prediction[]): Promise<Prediction[]> {
  try {
    const rows = incoming.map(toRow)
    const { data, error } = await supabase
      .from('predictions')
      .upsert(rows, {
        onConflict: 'id',
        ignoreDuplicates: false,
      })
      .select()

    if (error) throw error
    const saved = (data || []).map(fromRow)
    // Merge into local
    const local = localGet()
    for (const p of saved) {
      const idx = local.findIndex(l => l.id === p.id)
      idx === -1 ? local.push(p) : (local[idx] = p)
    }
    localSet(local)
    return saved
  } catch {
    // Fallback to localStorage
    const local = localGet()
    for (const p of incoming) {
      const idx = local.findIndex(l => l.id === p.id)
      if (idx === -1) local.push(p)
      else local[idx] = { ...p, odds: local[idx].odds ?? p.odds, result: local[idx].result ?? p.result }
    }
    localSet(local)
    return local
  }
}

export async function setOdds(id: string, odds: number): Promise<void> {
  try {
    await supabase.from('predictions').update({ odds }).eq('id', id)
  } catch {}
  // Always update local too
  const local = localGet()
  const idx = local.findIndex(p => p.id === id)
  if (idx !== -1) { local[idx].odds = odds; localSet(local) }
}

export async function setResult(
  id: string,
  result: ResultType | undefined,
  homeScore?: number,
  awayScore?: number
): Promise<void> {
  const update: any = { result: result ?? null }
  if (homeScore !== undefined) update.home_score = homeScore
  if (awayScore !== undefined) update.away_score = awayScore

  try {
    await supabase.from('predictions').update(update).eq('id', id)
  } catch {}

  const local = localGet()
  const idx = local.findIndex(p => p.id === id)
  if (idx !== -1) {
    local[idx].result = result
    if (homeScore !== undefined) local[idx].homeScore = homeScore
    if (awayScore !== undefined) local[idx].awayScore = awayScore
    localSet(local)
  }
}

export function getStats(predictions: Prediction[]): HistoryStats {
  const settled = predictions.filter(p => p.result && p.result !== 'VOID')
  const wins = settled.filter(p => p.result === 'WIN')
  const losses = settled.filter(p => p.result === 'LOSS')

  const withOdds = settled.filter(p => p.odds)
  const totalStaked = withOdds.length
  const totalReturn = withOdds
    .filter(p => p.result === 'WIN')
    .reduce((sum, p) => sum + (p.odds! - 1), 0)
  const roi = totalStaked > 0
    ? ((totalReturn - (totalStaked - wins.length)) / totalStaked) * 100
    : 0

  return {
    total: predictions.length,
    wins: wins.length,
    losses: losses.length,
    voids: predictions.filter(p => p.result === 'VOID').length,
    pending: predictions.filter(p => !p.result).length,
    winRate: settled.length > 0 ? (wins.length / settled.length) * 100 : 0,
    roi,
  }
}
