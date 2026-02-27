'use client'
import { Prediction, HistoryStats, ResultType } from './types'

const STORAGE_KEY = 'sports_predictions'

export function getAllPredictions(): Prediction[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

export function savePredictions(predictions: Prediction[]): void {
  if (typeof window === 'undefined') return
  localStorage.setItem(STORAGE_KEY, JSON.stringify(predictions))
}

export function getTodayPredictions(): Prediction[] {
  const all = getAllPredictions()
  const today = new Date().toISOString().split('T')[0]
  return all.filter(p => p.matchDate === today)
}

export function upsertPredictions(incoming: Prediction[]): Prediction[] {
  const all = getAllPredictions()
  const updated = [...all]

  for (const pred of incoming) {
    const idx = updated.findIndex(p => p.id === pred.id)
    if (idx === -1) {
      updated.push(pred)
    } else {
      // Preserve user-set odds and result
      updated[idx] = {
        ...pred,
        odds: updated[idx].odds ?? pred.odds,
        result: updated[idx].result ?? pred.result,
        homeScore: updated[idx].homeScore ?? pred.homeScore,
        awayScore: updated[idx].awayScore ?? pred.awayScore,
      }
    }
  }

  savePredictions(updated)
  return updated
}

export function setOdds(id: string, odds: number): void {
  const all = getAllPredictions()
  const idx = all.findIndex(p => p.id === id)
  if (idx !== -1) {
    all[idx].odds = odds
    savePredictions(all)
  }
}

export function setResult(
  id: string,
  result: ResultType,
  homeScore?: number,
  awayScore?: number
): void {
  const all = getAllPredictions()
  const idx = all.findIndex(p => p.id === id)
  if (idx !== -1) {
    all[idx].result = result
    if (homeScore !== undefined) all[idx].homeScore = homeScore
    if (awayScore !== undefined) all[idx].awayScore = awayScore
    savePredictions(all)
  }
}

export function getStats(): HistoryStats {
  const all = getAllPredictions()
  const settled = all.filter(p => p.result && p.result !== 'VOID')
  const wins = settled.filter(p => p.result === 'WIN')
  const losses = settled.filter(p => p.result === 'LOSS')
  const pending = all.filter(p => !p.result)

  // ROI calculation (only for picks with odds)
  const withOdds = settled.filter(p => p.odds)
  const totalStaked = withOdds.length
  const totalReturn = withOdds
    .filter(p => p.result === 'WIN')
    .reduce((sum, p) => sum + (p.odds! - 1), 0)
  const roi = totalStaked > 0
    ? ((totalReturn - (totalStaked - wins.length)) / totalStaked) * 100
    : 0

  return {
    total: all.length,
    wins: wins.length,
    losses: losses.length,
    voids: all.filter(p => p.result === 'VOID').length,
    pending: pending.length,
    winRate: settled.length > 0 ? (wins.length / settled.length) * 100 : 0,
    roi,
  }
}
