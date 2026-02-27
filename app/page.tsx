'use client'
import { useEffect, useState, useCallback } from 'react'
import PredictionCard from '@/components/PredictionCard'
import StatsBar from '@/components/StatsBar'
import { Prediction } from '@/lib/types'
import { getTodayPredictions, upsertPredictions, getStats } from '@/lib/storage'

export default function HomePage() {
  const [predictions, setPredictions] = useState<Prediction[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [stats, setStats] = useState(getStats())

  const loadFromStorage = useCallback(() => {
    const stored = getTodayPredictions()
    setPredictions(stored)
    setStats(getStats())
  }, [])

  const fetchPredictions = useCallback(async (force = false) => {
    const stored = getTodayPredictions()
    if (stored.length > 0 && !force) {
      setPredictions(stored)
      setStats(getStats())
      setLoading(false)
      return
    }

    setRefreshing(true)
    setError(null)

    try {
      const res = await fetch('/api/predictions')
      const data = await res.json()

      if (data.error) {
        setError(data.error)
      } else if (data.predictions?.length === 0) {
        setMessage(data.message || 'No high-confidence picks found for today.')
      } else {
        const updated = upsertPredictions(data.predictions)
        const todayOnly = updated.filter(p => p.matchDate === new Date().toISOString().split('T')[0])
        setPredictions(todayOnly)
        setStats(getStats())
      }
    } catch (e: any) {
      setError('Failed to load predictions. Please try again.')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useEffect(() => {
    fetchPredictions()
  }, [fetchPredictions])

  const today = new Date().toLocaleDateString('en-GB', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
  })

  return (
    <div>
      {/* Header */}
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
          {refreshing ? (
            <span className="animate-spin">⟳</span>
          ) : (
            <span>🔄</span>
          )}
          {refreshing ? 'Loading...' : 'Refresh Picks'}
        </button>
      </div>

      {/* Stats bar */}
      <StatsBar stats={stats} />

      {/* States */}
      {loading && (
        <div className="flex flex-col items-center justify-center py-20 gap-4">
          <div className="w-10 h-10 border-4 border-green-400/30 border-t-green-400 rounded-full animate-spin" />
          <p className="text-gray-500 text-sm">Analysing today's fixtures...</p>
        </div>
      )}

      {!loading && error && (
        <div className="text-center py-16">
          <div className="text-4xl mb-3">⚠️</div>
          <p className="text-red-400 font-medium">{error}</p>
          <button
            onClick={() => fetchPredictions(true)}
            className="mt-4 px-4 py-2 bg-white/10 hover:bg-white/20 text-white rounded-lg text-sm"
          >
            Try Again
          </button>
        </div>
      )}

      {!loading && !error && predictions.length === 0 && (
        <div className="text-center py-16">
          <div className="text-5xl mb-4">🏟️</div>
          <h2 className="text-white font-semibold text-lg mb-2">No Picks Today</h2>
          <p className="text-gray-500 text-sm max-w-sm mx-auto">
            {message || 'No high-confidence picks found today. Check back later or try refreshing.'}
          </p>
        </div>
      )}

      {!loading && predictions.length > 0 && (
        <>
          <p className="text-xs text-gray-600 mb-4">
            {predictions.length} high-confidence pick{predictions.length !== 1 ? 's' : ''} · Tap a card to add odds & mark results
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            {predictions.map(p => (
              <PredictionCard
                key={p.id}
                prediction={p}
                onUpdate={loadFromStorage}
              />
            ))}
          </div>
        </>
      )}

      <p className="text-center text-xs text-gray-700 mt-10">
        ⚠️ For entertainment only. Always bet responsibly.
      </p>
    </div>
  )
}
