'use client'
import { useEffect, useState, useCallback } from 'react'
import Image from 'next/image'
import { NBAPrediction } from '@/lib/nba-types'

const PICK_STYLES: Record<string, { bg: string; icon: string }> = {
  HOME_WIN: { bg: 'bg-blue-500/20 text-blue-300 border-blue-500/40',     icon: '🏠' },
  AWAY_WIN: { bg: 'bg-purple-500/20 text-purple-300 border-purple-500/40', icon: '✈️' },
  OVER:     { bg: 'bg-orange-500/20 text-orange-300 border-orange-500/40', icon: '📈' },
  UNDER:    { bg: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40',       icon: '📉' },
}

const RESULT_STYLES: Record<string, string> = {
  WIN:  'bg-green-500/20 border-green-500 text-green-400',
  LOSS: 'bg-red-500/20 border-red-500 text-red-400',
  VOID: 'bg-gray-500/20 border-gray-500 text-gray-400',
}

function ConfidenceBar({ value }: { value: number }) {
  const color = value >= 80 ? 'bg-green-400' : value >= 65 ? 'bg-yellow-400' : 'bg-orange-400'
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-white/10 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${value}%` }} />
      </div>
      <span className="text-xs font-bold text-white/60 w-8 text-right">{value}%</span>
    </div>
  )
}

function NBACard({ p, onUpdate }: { p: NBAPrediction; onUpdate: () => void }) {
  const [saving, setSaving]   = useState(false)
  const [editScore, setEdit]  = useState(false)
  const [sh, setSh] = useState(p.homeScore !== undefined ? String(p.homeScore) : '')
  const [sa, setSa] = useState(p.awayScore !== undefined ? String(p.awayScore) : '')
  const style = PICK_STYLES[p.pick] ?? PICK_STYLES.HOME_WIN

  const handleResult = async (result: 'WIN' | 'LOSS' | 'VOID') => {
    setSaving(true)
    await fetch('/api/nba-predictions', { method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: p.id, result, homeScore: sh !== '' ? +sh : undefined, awayScore: sa !== '' ? +sa : undefined }) })
    setSaving(false)
    setEdit(false)
    onUpdate()
  }

  const handleReset = async () => {
    setSaving(true)
    await fetch('/api/nba-predictions', { method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: p.id, result: null }) })
    setSaving(false)
    onUpdate()
  }

  const border = p.result === 'WIN' ? 'border-green-500/50' : p.result === 'LOSS' ? 'border-red-500/40' : 'border-[#1e3a5f]'

  return (
    <div className={`bg-[#0f1923] border rounded-xl overflow-hidden ${border} ${saving ? 'opacity-70' : ''}`}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 bg-[#0a1628] border-b border-[#1e3a5f]">
        <div className="flex items-center gap-2">
          <span className="text-xs">🏀</span>
          <span className="text-xs text-gray-400 font-medium">NBA</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-600">🕐 {p.kickoff} WAT</span>
          {p.result && (
            <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold border ${RESULT_STYLES[p.result]}`}>
              {p.result === 'WIN' ? '✅ WIN' : p.result === 'LOSS' ? '❌ LOSS' : '⬜ VOID'}
            </span>
          )}
        </div>
      </div>

      <div className="p-4">
        {/* Teams + Score */}
        <div className="flex items-center gap-2 mb-3">
          <div className="flex-1 flex items-center gap-2 min-w-0">
            {p.homeLogo && (
              <Image src={p.homeLogo} alt={p.homeTeam} width={28} height={28} className="object-contain flex-shrink-0" />
            )}
            <span className="font-semibold text-white text-sm truncate">{p.homeTeam}</span>
          </div>
          <div className="flex-shrink-0 text-center min-w-[60px]">
            {p.homeScore !== undefined && p.awayScore !== undefined ? (
              <span className="font-bold text-white text-base">{p.homeScore}–{p.awayScore}</span>
            ) : (
              <span className="text-gray-600 text-xs">vs</span>
            )}
          </div>
          <div className="flex-1 flex items-center justify-end gap-2 min-w-0">
            <span className="font-semibold text-white text-sm truncate text-right">{p.awayTeam}</span>
            {p.awayLogo && (
              <Image src={p.awayLogo} alt={p.awayTeam} width={28} height={28} className="object-contain flex-shrink-0" />
            )}
          </div>
        </div>

        {/* Pick badge */}
        <div className="mb-3">
          <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold border ${style.bg}`}>
            {style.icon} {p.pickLabel}
          </span>
          {(p.pick === 'OVER' || p.pick === 'UNDER') && p.line && (
            <span className="ml-2 text-xs text-gray-500">total points line</span>
          )}
        </div>

        {/* Confidence */}
        <div className="mb-3">
          <div className="text-xs text-gray-600 mb-1">Confidence</div>
          <ConfidenceBar value={p.confidence} />
        </div>

        {/* Reasoning */}
        <div className="space-y-1">
          {p.reasoning.map((r, i) => (
            <p key={i} className="text-xs text-gray-400 flex items-start gap-1.5">
              <span className="text-orange-400 mt-0.5 flex-shrink-0">▸</span>
              {r}
            </p>
          ))}
        </div>
      </div>

      {/* Result section */}
      <div className="px-4 pb-4 pt-1" onClick={e => e.stopPropagation()}>
        <div className="border-t border-[#1e3a5f] pt-3 flex justify-end">
          {!p.result ? (
            editScore ? (
              <div className="flex items-center gap-1.5 flex-wrap justify-end">
                <input type="number" min="0" placeholder="H" value={sh} onChange={e => setSh(e.target.value)}
                  className="w-14 bg-[#1a2f4a] border border-[#2a4f7f] rounded px-1.5 py-1 text-sm text-white text-center focus:outline-none" />
                <span className="text-gray-500">–</span>
                <input type="number" min="0" placeholder="A" value={sa} onChange={e => setSa(e.target.value)}
                  className="w-14 bg-[#1a2f4a] border border-[#2a4f7f] rounded px-1.5 py-1 text-sm text-white text-center focus:outline-none" />
                <button onClick={() => handleResult('WIN')} className="px-2.5 py-1 bg-green-600 hover:bg-green-500 text-white text-xs font-bold rounded-lg">✅</button>
                <button onClick={() => handleResult('LOSS')} className="px-2.5 py-1 bg-red-600 hover:bg-red-500 text-white text-xs font-bold rounded-lg">❌</button>
                <button onClick={() => handleResult('VOID')} className="px-2 py-1 bg-gray-600 text-white text-xs rounded-lg">⬜</button>
                <button onClick={() => setEdit(false)} className="px-2 py-1 bg-white/10 text-gray-400 text-xs rounded-lg">✕</button>
              </div>
            ) : (
              <button onClick={() => setEdit(true)}
                className="px-3 py-1.5 bg-[#1a2f4a] hover:bg-[#1e3a5f] border border-[#2a4f7f] rounded-lg text-xs text-gray-300 hover:text-white transition-colors">
                Mark Result
              </button>
            )
          ) : (
            <button onClick={handleReset} className="text-xs text-gray-700 hover:text-gray-400 transition-colors">Reset</button>
          )}
        </div>
      </div>
    </div>
  )
}

export default function BasketballPage() {
  const [picks, setPicks]     = useState<NBAPrediction[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRef]  = useState(false)
  const [message, setMsg]     = useState<string | null>(null)

  const today = new Date().toLocaleDateString('en-GB', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
  })

  const load = useCallback(async (force = false) => {
    if (force) setRef(true)
    try {
      const res  = await fetch(force ? '/api/nba-predictions?force=true' : '/api/nba-predictions')
      const data = await res.json()
      if (data.predictions?.length) {
        setPicks(data.predictions)
        setMsg(null)
      } else {
        setPicks([])
        setMsg(data.message || 'No NBA picks today.')
      }
    } catch {
      setMsg('Failed to load NBA picks.')
    } finally {
      setLoading(false)
      setRef(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const stats = {
    wins:   picks.filter(p => p.result === 'WIN').length,
    losses: picks.filter(p => p.result === 'LOSS').length,
    pending: picks.filter(p => !p.result).length,
  }

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">NBA Picks 🏀</h1>
          <p className="text-sm text-gray-500 mt-0.5">{today}</p>
        </div>
        <button onClick={() => load(true)} disabled={refreshing}
          className="flex items-center gap-2 px-4 py-2 bg-orange-500 hover:bg-orange-400 disabled:opacity-50 text-black font-semibold rounded-xl text-sm transition-colors">
          <span className={refreshing ? 'animate-spin inline-block' : ''}>🔄</span>
          {refreshing ? 'Loading...' : 'Refresh Picks'}
        </button>
      </div>

      {/* Stats bar */}
      {picks.length > 0 && (
        <div className="grid grid-cols-3 gap-3 mb-6">
          {[
            { label: 'Wins',    value: stats.wins,    color: 'text-green-400' },
            { label: 'Losses',  value: stats.losses,  color: 'text-red-400'   },
            { label: 'Pending', value: stats.pending, color: 'text-gray-400'  },
          ].map(s => (
            <div key={s.label} className="bg-[#0f1923] border border-[#1e3a5f] rounded-xl p-3 text-center">
              <div className={`text-xl font-bold ${s.color}`}>{s.value}</div>
              <div className="text-xs text-gray-600 mt-0.5">{s.label}</div>
            </div>
          ))}
        </div>
      )}

      {loading && (
        <div className="flex flex-col items-center justify-center py-20 gap-4">
          <div className="w-10 h-10 border-4 border-orange-400/30 border-t-orange-400 rounded-full animate-spin" />
          <p className="text-gray-500 text-sm">Analysing tonight's NBA games...</p>
        </div>
      )}

      {!loading && picks.length === 0 && (
        <div className="text-center py-16">
          <div className="text-5xl mb-4">🏀</div>
          <h2 className="text-white font-semibold text-lg mb-2">No NBA Picks Today</h2>
          <p className="text-gray-500 text-sm max-w-sm mx-auto">{message}</p>
        </div>
      )}

      {!loading && picks.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2">
          {picks.map(p => (
            <NBACard key={p.id} p={p} onUpdate={() => load()} />
          ))}
        </div>
      )}

      <p className="text-center text-xs text-gray-700 mt-10">
        ⚠️ For entertainment only. Bet responsibly.
      </p>
    </div>
  )
}
