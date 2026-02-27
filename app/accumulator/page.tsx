'use client'
import { useEffect, useState, useCallback, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { AccumulatorEntry } from '@/lib/types'
import {
  getAllAccumulatorEntries,
  saveAccumulatorEntry,
  updateAccumulatorEntry,
} from '@/lib/storage'

const ACCUM_START = 200

function AccumulatorContent() {
  const searchParams = useSearchParams()
  const [entries, setEntries] = useState<AccumulatorEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [showAddForm, setShowAddForm] = useState(false)

  // Pre-fill from URL params when coming from homepage
  const urlOdds = searchParams.get('odds')
  const urlAmount = searchParams.get('amount')
  const urlPicks = searchParams.get('picks')
  const urlSummary = searchParams.get('summary')

  const [formOdds, setFormOdds] = useState(urlOdds || '')
  const [formAmount, setFormAmount] = useState(urlAmount || String(ACCUM_START))
  const [formPicks, setFormPicks] = useState(urlPicks || '1')
  const [formDate, setFormDate] = useState(new Date().toISOString().split('T')[0])
  const [formSummary, setFormSummary] = useState<string[]>(() => {
    if (urlSummary) {
      try { return JSON.parse(urlSummary) } catch {}
    }
    return []
  })

  const load = useCallback(async () => {
    setLoading(true)
    const data = await getAllAccumulatorEntries()
    setEntries(data)
    setLoading(false)
  }, [])

  useEffect(() => {
    load()
    // Auto-open form if coming from homepage with data
    if (urlOdds) setShowAddForm(true)
  }, [load, urlOdds])

  const handleSaveEntry = async () => {
    const odds = parseFloat(formOdds)
    const amount = parseFloat(formAmount)
    if (isNaN(odds) || odds <= 1 || isNaN(amount) || amount <= 0) return

    setSaving(true)
    await saveAccumulatorEntry({
      date: formDate,
      amount,
      odds,
      accumulatorTotal: null,
      status: 'PENDING',
      pickCount: parseInt(formPicks) || 1,
      pickSummary: formSummary,
    })
    await load()
    setSaving(false)
    setShowAddForm(false)
    // Reset form
    setFormOdds('')
    setFormPicks('1')
    setFormSummary([])
  }

  const handleMarkResult = async (entry: AccumulatorEntry, status: 'WIN' | 'LOSS') => {
    const total = status === 'WIN'
      ? parseFloat((entry.amount * entry.odds).toFixed(2))
      : ACCUM_START
    setSaving(true)
    await updateAccumulatorEntry(entry.id, status, total)
    await load()
    setSaving(false)
  }

  // Stats summary
  const settled = entries.filter(e => e.status !== 'PENDING')
  const wins = settled.filter(e => e.status === 'WIN').length
  const losses = settled.filter(e => e.status === 'LOSS').length
  const currentTotal = (() => {
    const lastSettled = entries.find(e => e.status !== 'PENDING')
    if (!lastSettled) return ACCUM_START
    if (lastSettled.status === 'WIN' && lastSettled.accumulatorTotal) return lastSettled.accumulatorTotal
    return ACCUM_START
  })()

  // Highest ever
  const highestTotal = entries
    .filter(e => e.accumulatorTotal !== null && e.status === 'WIN')
    .reduce((max, e) => Math.max(max, e.accumulatorTotal!), ACCUM_START)

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Accumulator 💰</h1>
          <p className="text-sm text-gray-500 mt-0.5">Starting: ₦200 • On loss: reset to ₦200</p>
        </div>
        <button
          onClick={() => setShowAddForm(v => !v)}
          className="flex items-center gap-2 px-4 py-2 bg-green-500 hover:bg-green-400 text-black font-semibold rounded-xl text-sm transition-colors"
        >
          {showAddForm ? '✕ Cancel' : '+ Add Entry'}
        </button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        <div className="bg-[#0f1923] border border-[#1e3a5f] rounded-xl p-4 text-center">
          <div className="text-2xl font-bold text-white">₦{currentTotal.toLocaleString()}</div>
          <div className="text-xs text-gray-500 mt-1">Current Stack</div>
        </div>
        <div className="bg-[#0f1923] border border-green-500/30 rounded-xl p-4 text-center">
          <div className="text-2xl font-bold text-green-400">{wins}</div>
          <div className="text-xs text-gray-500 mt-1">Wins</div>
        </div>
        <div className="bg-[#0f1923] border border-red-500/30 rounded-xl p-4 text-center">
          <div className="text-2xl font-bold text-red-400">{losses}</div>
          <div className="text-xs text-gray-500 mt-1">Losses</div>
        </div>
        <div className="bg-[#0f1923] border border-yellow-500/30 rounded-xl p-4 text-center">
          <div className="text-2xl font-bold text-yellow-400">₦{highestTotal.toLocaleString()}</div>
          <div className="text-xs text-gray-500 mt-1">Peak</div>
        </div>
      </div>

      {/* Add Entry Form */}
      {showAddForm && (
        <div className="bg-[#0f1923] border border-green-500/40 rounded-xl p-5 mb-6">
          <h2 className="text-sm font-semibold text-white mb-4">📝 New Accumulator Entry</h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Date</label>
              <input
                type="date"
                value={formDate}
                onChange={e => setFormDate(e.target.value)}
                className="w-full bg-[#1a2f4a] border border-[#2a4f7f] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-green-400"
              />
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Stake (₦)</label>
              <input
                type="number"
                min="1"
                value={formAmount}
                onChange={e => setFormAmount(e.target.value)}
                className="w-full bg-[#1a2f4a] border border-[#2a4f7f] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-green-400"
              />
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Combined Odds</label>
              <input
                type="number"
                min="1.01"
                step="0.01"
                placeholder="e.g. 4.50"
                value={formOdds}
                onChange={e => setFormOdds(e.target.value)}
                className="w-full bg-[#1a2f4a] border border-[#2a4f7f] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-green-400"
              />
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">No. of Picks</label>
              <input
                type="number"
                min="1"
                max="20"
                value={formPicks}
                onChange={e => setFormPicks(e.target.value)}
                className="w-full bg-[#1a2f4a] border border-[#2a4f7f] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-green-400"
              />
            </div>
          </div>

          {/* Preview */}
          {parseFloat(formOdds) > 1 && parseFloat(formAmount) > 0 && (
            <div className="flex items-center gap-2 mb-4 text-sm">
              <span className="text-gray-500">Potential win:</span>
              <span className="font-bold text-green-400">
                ₦{(parseFloat(formAmount) * parseFloat(formOdds)).toLocaleString('en-NG', { maximumFractionDigits: 2 })}
              </span>
            </div>
          )}

          {/* Pick summary (auto-filled from URL) */}
          {formSummary.length > 0 && (
            <div className="mb-4 space-y-1">
              <div className="text-xs text-gray-500 mb-1">Picks included:</div>
              {formSummary.map((s, i) => (
                <div key={i} className="text-xs text-gray-400 flex items-start gap-1.5">
                  <span className="text-green-400">▸</span> {s}
                </div>
              ))}
            </div>
          )}

          <button
            onClick={handleSaveEntry}
            disabled={saving || !formOdds || parseFloat(formOdds) <= 1}
            className="px-5 py-2.5 bg-green-500 hover:bg-green-400 disabled:opacity-40 text-black font-bold rounded-xl text-sm transition-colors"
          >
            {saving ? 'Saving...' : '💾 Save Entry'}
          </button>
        </div>
      )}

      {/* Table */}
      {loading ? (
        <div className="flex justify-center py-16">
          <div className="w-8 h-8 border-4 border-green-400/30 border-t-green-400 rounded-full animate-spin" />
        </div>
      ) : entries.length === 0 ? (
        <div className="text-center py-16">
          <div className="text-5xl mb-4">📊</div>
          <h2 className="text-white font-semibold text-lg mb-2">No Entries Yet</h2>
          <p className="text-gray-500 text-sm">Select picks on the Today page and save them here to start tracking your accumulator.</p>
        </div>
      ) : (
        <div className="bg-[#0f1923] border border-[#1e3a5f] rounded-xl overflow-hidden">
          {/* Desktop table */}
          <div className="hidden sm:block overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-[#1e3a5f]">
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Date</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Picks</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Stake</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Odds</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Total</th>
                  <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Status</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {entries.map((e, idx) => (
                  <EntryRow key={e.id} entry={e} isLatest={idx === 0} onMark={handleMarkResult} saving={saving} />
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <div className="sm:hidden divide-y divide-[#1e3a5f]">
            {entries.map((e, idx) => (
              <EntryCard key={e.id} entry={e} isLatest={idx === 0} onMark={handleMarkResult} saving={saving} />
            ))}
          </div>
        </div>
      )}

      {/* Cumulative chart placeholder */}
      {entries.length > 1 && (
        <div className="mt-6 text-center">
          <p className="text-xs text-gray-700">
            Total runs: {entries.length} • Best streak: {getBestStreak(entries)} wins
          </p>
        </div>
      )}
    </div>
  )
}

function EntryRow({
  entry: e,
  isLatest,
  onMark,
  saving,
}: {
  entry: AccumulatorEntry
  isLatest: boolean
  onMark: (e: AccumulatorEntry, s: 'WIN' | 'LOSS') => void
  saving: boolean
}) {
  const formattedDate = new Date(e.date + 'T12:00:00').toLocaleDateString('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric'
  })
  const potential = (e.amount * e.odds).toFixed(2)

  return (
    <tr className={`border-b border-[#1e3a5f]/50 last:border-0 ${isLatest ? 'bg-white/[0.02]' : ''}`}>
      <td className="px-4 py-3">
        <span className="text-sm text-white">{formattedDate}</span>
        {isLatest && <span className="ml-2 text-xs text-green-400 bg-green-400/10 px-1.5 py-0.5 rounded">latest</span>}
      </td>
      <td className="px-4 py-3 text-right">
        <span className="text-sm text-gray-400">{e.pickCount}</span>
      </td>
      <td className="px-4 py-3 text-right">
        <span className="text-sm text-white font-medium">₦{e.amount.toLocaleString()}</span>
      </td>
      <td className="px-4 py-3 text-right">
        <span className="text-sm text-yellow-400 font-bold">{e.odds.toFixed(2)}x</span>
      </td>
      <td className="px-4 py-3 text-right">
        {e.status === 'PENDING' ? (
          <span className="text-sm text-gray-500">₦{parseFloat(potential).toLocaleString()} ?</span>
        ) : e.status === 'WIN' ? (
          <span className="text-sm font-bold text-green-400">₦{(e.accumulatorTotal ?? 0).toLocaleString()}</span>
        ) : (
          <div>
            <span className="text-sm line-through text-gray-600">₦{parseFloat(potential).toLocaleString()}</span>
            <span className="text-sm text-red-400 ml-2 font-medium">₦{ACCUM_START}</span>
          </div>
        )}
      </td>
      <td className="px-4 py-3 text-center">
        <StatusBadge status={e.status} />
      </td>
      <td className="px-4 py-3">
        {e.status === 'PENDING' && (
          <div className="flex gap-1.5 justify-end">
            <button
              onClick={() => onMark(e, 'WIN')}
              disabled={saving}
              className="px-2.5 py-1 bg-green-600 hover:bg-green-500 text-white text-xs font-bold rounded-lg disabled:opacity-50"
            >
              ✅ Win
            </button>
            <button
              onClick={() => onMark(e, 'LOSS')}
              disabled={saving}
              className="px-2.5 py-1 bg-red-600 hover:bg-red-500 text-white text-xs font-bold rounded-lg disabled:opacity-50"
            >
              ❌ Loss
            </button>
          </div>
        )}
      </td>
    </tr>
  )
}

function EntryCard({
  entry: e,
  isLatest,
  onMark,
  saving,
}: {
  entry: AccumulatorEntry
  isLatest: boolean
  onMark: (e: AccumulatorEntry, s: 'WIN' | 'LOSS') => void
  saving: boolean
}) {
  const formattedDate = new Date(e.date + 'T12:00:00').toLocaleDateString('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric'
  })
  const potential = (e.amount * e.odds).toFixed(2)

  return (
    <div className={`p-4 ${isLatest ? 'bg-white/[0.02]' : ''}`}>
      <div className="flex items-start justify-between mb-3">
        <div>
          <span className="text-sm text-white font-medium">{formattedDate}</span>
          {isLatest && <span className="ml-2 text-xs text-green-400">latest</span>}
          <div className="text-xs text-gray-500 mt-0.5">{e.pickCount} pick{e.pickCount !== 1 ? 's' : ''}</div>
        </div>
        <StatusBadge status={e.status} />
      </div>

      <div className="grid grid-cols-3 gap-3 mb-3">
        <div className="text-center">
          <div className="text-xs text-gray-500 mb-1">Stake</div>
          <div className="text-sm font-bold text-white">₦{e.amount.toLocaleString()}</div>
        </div>
        <div className="text-center">
          <div className="text-xs text-gray-500 mb-1">Odds</div>
          <div className="text-sm font-bold text-yellow-400">{e.odds.toFixed(2)}x</div>
        </div>
        <div className="text-center">
          <div className="text-xs text-gray-500 mb-1">Total</div>
          {e.status === 'PENDING' ? (
            <div className="text-sm font-bold text-gray-400">₦{parseFloat(potential).toLocaleString()}?</div>
          ) : e.status === 'WIN' ? (
            <div className="text-sm font-bold text-green-400">₦{(e.accumulatorTotal ?? 0).toLocaleString()}</div>
          ) : (
            <div className="text-sm font-bold text-red-400">₦{ACCUM_START}</div>
          )}
        </div>
      </div>

      {/* Pick details */}
      {e.pickSummary.length > 0 && (
        <div className="mb-3 space-y-0.5">
          {e.pickSummary.map((s, i) => (
            <div key={i} className="text-xs text-gray-500">▸ {s}</div>
          ))}
        </div>
      )}

      {e.status === 'PENDING' && (
        <div className="flex gap-2">
          <button
            onClick={() => onMark(e, 'WIN')}
            disabled={saving}
            className="flex-1 py-2 bg-green-600 hover:bg-green-500 text-white text-xs font-bold rounded-lg disabled:opacity-50"
          >
            ✅ Mark Win
          </button>
          <button
            onClick={() => onMark(e, 'LOSS')}
            disabled={saving}
            className="flex-1 py-2 bg-red-600 hover:bg-red-500 text-white text-xs font-bold rounded-lg disabled:opacity-50"
          >
            ❌ Mark Loss
          </button>
        </div>
      )}
    </div>
  )
}

function StatusBadge({ status }: { status: string }) {
  if (status === 'WIN') return (
    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-green-500/20 border border-green-500/50 text-green-400">
      ✅ WIN
    </span>
  )
  if (status === 'LOSS') return (
    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-red-500/20 border border-red-500/50 text-red-400">
      ❌ LOSS
    </span>
  )
  return (
    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-yellow-500/10 border border-yellow-500/30 text-yellow-400">
      🕐 PENDING
    </span>
  )
}

function getBestStreak(entries: AccumulatorEntry[]): number {
  let best = 0, current = 0
  const settled = [...entries].reverse().filter(e => e.status !== 'PENDING')
  for (const e of settled) {
    if (e.status === 'WIN') { current++; best = Math.max(best, current) }
    else current = 0
  }
  return best
}

export default function AccumulatorPage() {
  return (
    <Suspense fallback={
      <div className="flex justify-center py-20">
        <div className="w-8 h-8 border-4 border-green-400/30 border-t-green-400 rounded-full animate-spin" />
      </div>
    }>
      <AccumulatorContent />
    </Suspense>
  )
}
