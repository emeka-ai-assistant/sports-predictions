'use client'
import { useEffect, useState } from 'react'
import PredictionCard from '@/components/PredictionCard'
import StatsBar from '@/components/StatsBar'
import { Prediction } from '@/lib/types'
import { getAllPredictions, getStats } from '@/lib/storage'

type Filter = 'ALL' | 'WIN' | 'LOSS' | 'PENDING'

export default function HistoryPage() {
  const [predictions, setPredictions] = useState<Prediction[]>([])
  const [filter, setFilter] = useState<Filter>('ALL')
  const [loading, setLoading] = useState(true)
  const [stats, setStats] = useState({ total: 0, wins: 0, losses: 0, voids: 0, pending: 0, winRate: 0, roi: 0 })

  const load = async () => {
    setLoading(true)
    const all = await getAllPredictions()
    setPredictions(all)
    setStats(getStats(all))
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const filtered = predictions.filter(p => {
    if (filter === 'WIN') return p.result === 'WIN'
    if (filter === 'LOSS') return p.result === 'LOSS'
    if (filter === 'PENDING') return !p.result
    return true
  })

  const grouped = filtered.reduce<Record<string, Prediction[]>>((acc, p) => {
    if (!acc[p.matchDate]) acc[p.matchDate] = []
    acc[p.matchDate].push(p)
    return acc
  }, {})

  const sortedDates = Object.keys(grouped).sort((a, b) => b.localeCompare(a))

  const FILTERS: { label: string; value: Filter; cls: string }[] = [
    { label: 'All', value: 'ALL', cls: 'bg-white/10 text-white' },
    { label: '✅ Wins', value: 'WIN', cls: 'bg-green-500/20 text-green-400 border-green-500/30' },
    { label: '❌ Losses', value: 'LOSS', cls: 'bg-red-500/20 text-red-400 border-red-500/30' },
    { label: '⏳ Pending', value: 'PENDING', cls: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30' },
  ]

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">History & Stats 📊</h1>
        <p className="text-sm text-gray-500 mt-0.5">Your complete prediction record</p>
      </div>

      <StatsBar stats={stats} />

      {stats.total > 0 && (
        <div className="bg-[#0f1923] border border-[#1e3a5f] rounded-xl p-4 mb-6 flex gap-6">
          <div>
            <div className="text-xs text-gray-500 mb-1">ROI</div>
            <div className={`text-2xl font-bold ${stats.roi >= 0 ? 'text-green-400' : 'text-red-400'}`}>
              {stats.roi >= 0 ? '+' : ''}{stats.roi.toFixed(1)}%
            </div>
          </div>
          <div>
            <div className="text-xs text-gray-500 mb-1">Pending</div>
            <div className="text-2xl font-bold text-yellow-400">{stats.pending}</div>
          </div>
          <div>
            <div className="text-xs text-gray-500 mb-1">Voided</div>
            <div className="text-2xl font-bold text-gray-400">{stats.voids}</div>
          </div>
        </div>
      )}

      <div className="flex gap-2 flex-wrap mb-5">
        {FILTERS.map(f => (
          <button key={f.value} onClick={() => setFilter(f.value)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-all ${
              filter === f.value ? `${f.cls} border-current` : 'text-gray-500 border-[#1e3a5f] hover:border-[#2a4f7f]'
            }`}>
            {f.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-20">
          <div className="w-8 h-8 border-4 border-green-400/30 border-t-green-400 rounded-full animate-spin" />
        </div>
      ) : predictions.length === 0 ? (
        <div className="text-center py-20">
          <div className="text-5xl mb-4">📭</div>
          <h2 className="text-white font-semibold text-lg mb-2">No History Yet</h2>
          <p className="text-gray-500 text-sm">Your predictions will appear here once you start tracking.</p>
        </div>
      ) : sortedDates.length === 0 ? (
        <div className="text-center py-16 text-gray-500 text-sm">No predictions match this filter.</div>
      ) : (
        <div className="space-y-8">
          {sortedDates.map(date => {
            const dayPreds = grouped[date]
            const label = new Date(date + 'T12:00:00').toLocaleDateString('en-GB', {
              weekday: 'long', day: 'numeric', month: 'long'
            })
            const w = dayPreds.filter(p => p.result === 'WIN').length
            const l = dayPreds.filter(p => p.result === 'LOSS').length
            return (
              <div key={date}>
                <div className="flex items-center gap-3 mb-3">
                  <h2 className="text-sm font-semibold text-gray-400">{label}</h2>
                  <div className="flex-1 h-px bg-[#1e3a5f]" />
                  {w > 0 && <span className="text-xs text-green-400 font-bold">{w}W</span>}
                  {l > 0 && <span className="text-xs text-red-400 font-bold">{l}L</span>}
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  {dayPreds.map(p => <PredictionCard key={p.id} prediction={p} onUpdate={load} />)}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
