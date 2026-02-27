'use client'
import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import PredictionCard from '@/components/PredictionCard'
import StatsBar from '@/components/StatsBar'
import { Prediction } from '@/lib/types'
import { getTodayPredictions, upsertPredictions, getStats, getLastAccumulatorAmount } from '@/lib/storage'

export default function HomePage() {
  const router = useRouter()
  const [predictions, setPredictions] = useState<Prediction[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [stats, setStats] = useState({ total: 0, wins: 0, losses: 0, voids: 0, pending: 0, winRate: 0, roi: 0 })
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [nextAmount, setNextAmount] = useState<number>(500)

  const loadFromStorage = useCallback(async () => {
    const stored = await getTodayPredictions()
    setPredictions(stored)
    setStats(getStats(stored))
  }, [])

  const fetchPredictions = useCallback(async (force = false) => {
    const stored = await getTodayPredictions()
    if (stored.length > 0 && !force) {
      setPredictions(stored)
      setStats(getStats(stored))
      setLoading(false)
      return
    }

    setRefreshing(true)
    setError(null)
    setMessage(null)

    try {
      const res = await fetch('/api/predictions')
      const data = await res.json()

      if (data.error) {
        setError(data.error)
      } else if (!data.predictions || data.predictions.length === 0) {
        setMessage(data.message || 'No high-confidence picks found today.')
      } else {
        await upsertPredictions(data.predictions)
        const today = new Date().toISOString().split('T')[0]
        const fresh = data.predictions.filter((p: Prediction) => p.matchDate === today)
        setPredictions(fresh)
        setStats(getStats(fresh))
      }
    } catch {
      setError('Failed to load predictions. Please try again.')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useEffect(() => {
    fetchPredictions()
    getLastAccumulatorAmount().then(amt => setNextAmount(amt))
  }, [fetchPredictions])

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const selectAll = () => setSelectedIds(new Set(predictions.map(p => p.id)))
  const clearAll = () => setSelectedIds(new Set())

  // Combined odds = product of selected picks that have odds set
  const selectedPicks = predictions.filter(p => selectedIds.has(p.id))
  const picksWithOdds = selectedPicks.filter(p => p.odds && p.odds > 1)
  const combinedOdds = picksWithOdds.reduce((acc, p) => acc * p.odds!, 1)
  const potentialReturn = combinedOdds > 1 ? (nextAmount * combinedOdds).toFixed(2) : null
  const missingOdds = selectedIds.size - picksWithOdds.length

  const today = new Date().toLocaleDateString('en-GB', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
  })

  const handleSaveToAccumulator = () => {
    if (selectedIds.size === 0) return
    const summary = picksWithOdds.map(p =>
      `${p.homeTeam} vs ${p.awayTeam} — ${p.pickLabel}${p.odds ? ` @ ${p.odds}` : ''}`
    )
    const params = new URLSearchParams({
      odds: combinedOdds.toFixed(2),
      amount: String(nextAmount),
      picks: String(selectedIds.size),
      summary: JSON.stringify(summary),
    })
    router.push(`/accumulator?${params.toString()}`)
  }

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Today's Picks ⚽</h1>
          <p className="text-sm text-gray-500 mt-0.5">{today}</p>
        </div>
        <button
          onClick={() => fetchPredictions(true)}
          disabled={refreshing}
          className="flex items-center gap-2 px-4 py-2 bg-green-500 hover:bg-green-400 disabled:opacity-50 text-black font-semibold rounded-xl text-sm transition-colors"
        >
          <span className={refreshing ? 'animate-spin inline-block' : ''}>🔄</span>
          {refreshing ? 'Loading...' : 'Refresh Picks'}
        </button>
      </div>

      <StatsBar stats={stats} />

      {loading && (
        <div className="flex flex-col items-center justify-center py-20 gap-4">
          <div className="w-10 h-10 border-4 border-green-400/30 border-t-green-400 rounded-full animate-spin" />
          <p className="text-gray-500 text-sm">Analysing today's fixtures...</p>
        </div>
      )}

      {!loading && error && (
        <div className="text-center py-16">
          <div className="text-4xl mb-3">⚠️</div>
          <p className="text-red-400 font-medium mb-4">{error}</p>
          <button onClick={() => fetchPredictions(true)}
            className="px-4 py-2 bg-white/10 hover:bg-white/20 text-white rounded-lg text-sm">
            Try Again
          </button>
        </div>
      )}

      {!loading && !error && predictions.length === 0 && (
        <div className="text-center py-16">
          <div className="text-5xl mb-4">🏟️</div>
          <h2 className="text-white font-semibold text-lg mb-2">No Picks Today</h2>
          <p className="text-gray-500 text-sm max-w-sm mx-auto">
            {message || 'No high-confidence picks found. Try refreshing or check back later.'}
          </p>
        </div>
      )}

      {!loading && predictions.length > 0 && (
        <>
          {/* Pick list header + select controls */}
          <div className="flex items-center justify-between gap-2 mb-4">
            <div className="flex items-center gap-3">
              <span className="text-xs text-gray-600">{predictions.length} pick{predictions.length !== 1 ? 's' : ''} today</span>
              {selectedIds.size > 0 && (
                <span className="text-xs text-green-400 font-medium">{selectedIds.size} selected</span>
              )}
            </div>
            <div className="flex gap-2">
              <button onClick={selectAll} className="text-xs text-gray-500 hover:text-white transition-colors px-2 py-1 rounded bg-white/5 hover:bg-white/10">
                Select All
              </button>
              {selectedIds.size > 0 && (
                <button onClick={clearAll} className="text-xs text-gray-500 hover:text-white transition-colors px-2 py-1 rounded bg-white/5 hover:bg-white/10">
                  Clear
                </button>
              )}
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            {predictions.map(p => (
              <PredictionCard
                key={p.id}
                prediction={p}
                onUpdate={loadFromStorage}
                selected={selectedIds.has(p.id)}
                onToggleSelect={toggleSelect}
              />
            ))}
          </div>

          {/* Combined Odds Bar */}
          {selectedIds.size > 0 && (
            <div className="mt-6 bg-[#0f1923] border border-green-500/30 rounded-xl p-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex flex-col gap-1">
                  <div className="text-xs text-gray-500 font-medium uppercase tracking-wide">
                    {selectedIds.size} pick{selectedIds.size !== 1 ? 's' : ''} selected
                  </div>
                  <div className="flex items-center gap-3 flex-wrap">
                    <div className="flex items-baseline gap-1.5">
                      <span className="text-xs text-gray-500">Combined odds:</span>
                      {picksWithOdds.length > 0 ? (
                        <span className="text-xl font-bold text-yellow-400">{combinedOdds.toFixed(2)}x</span>
                      ) : (
                        <span className="text-sm text-gray-600">—</span>
                      )}
                    </div>
                    {missingOdds > 0 && (
                      <span className="text-xs text-orange-400">
                        ⚠️ {missingOdds} pick{missingOdds > 1 ? 's' : ''} missing odds
                      </span>
                    )}
                  </div>
                  {potentialReturn && (
                    <div className="flex items-baseline gap-1.5">
                      <span className="text-xs text-gray-500">Stake: ₦{nextAmount.toLocaleString()}</span>
                      <span className="text-xs text-gray-600">→</span>
                      <span className="text-sm font-bold text-green-400">₦{parseFloat(potentialReturn).toLocaleString()}</span>
                      <span className="text-xs text-gray-600">if all win</span>
                    </div>
                  )}
                </div>

                <button
                  onClick={handleSaveToAccumulator}
                  disabled={picksWithOdds.length === 0}
                  className="flex items-center gap-2 px-4 py-2.5 bg-green-500 hover:bg-green-400 disabled:opacity-40 disabled:cursor-not-allowed text-black font-bold rounded-xl text-sm transition-colors whitespace-nowrap"
                >
                  💰 Save to Accumulator
                </button>
              </div>

              {/* Per-pick breakdown */}
              {picksWithOdds.length > 0 && (
                <div className="mt-3 pt-3 border-t border-white/5 flex flex-wrap gap-2">
                  {picksWithOdds.map(p => (
                    <span key={p.id} className="text-xs bg-white/5 rounded-lg px-2 py-1 text-gray-400">
                      {p.homeTeam} <span className="text-white/40">vs</span> {p.awayTeam}
                      <span className="text-yellow-400 ml-1">@ {p.odds}x</span>
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}
        </>
      )}

      <p className="text-center text-xs text-gray-700 mt-10">
        ⚠️ For entertainment only. Bet responsibly.
      </p>
    </div>
  )
}
