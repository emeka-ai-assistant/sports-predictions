'use client'
import { HistoryStats } from '@/lib/types'

export default function StatsBar({ stats }: { stats: HistoryStats }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
      <div className="bg-[#0f1923] border border-[#1e3a5f] rounded-xl p-3 text-center">
        <div className="text-2xl font-bold text-white">{stats.total}</div>
        <div className="text-xs text-gray-500 mt-0.5">Total Picks</div>
      </div>
      <div className="bg-[#0f1923] border border-green-500/30 rounded-xl p-3 text-center">
        <div className="text-2xl font-bold text-green-400">{stats.wins}</div>
        <div className="text-xs text-gray-500 mt-0.5">Wins</div>
      </div>
      <div className="bg-[#0f1923] border border-red-500/30 rounded-xl p-3 text-center">
        <div className="text-2xl font-bold text-red-400">{stats.losses}</div>
        <div className="text-xs text-gray-500 mt-0.5">Losses</div>
      </div>
      <div className="bg-[#0f1923] border border-[#1e3a5f] rounded-xl p-3 text-center">
        <div className={`text-2xl font-bold ${stats.winRate >= 55 ? 'text-green-400' : stats.winRate >= 40 ? 'text-yellow-400' : 'text-red-400'}`}>
          {stats.total > 0 ? `${stats.winRate.toFixed(0)}%` : '—'}
        </div>
        <div className="text-xs text-gray-500 mt-0.5">Win Rate</div>
      </div>
    </div>
  )
}
