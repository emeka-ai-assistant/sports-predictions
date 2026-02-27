'use client'
import { useState } from 'react'
import Image from 'next/image'
import { Prediction, ResultType } from '@/lib/types'
import { setOdds, setResult } from '@/lib/storage'

interface Props {
  prediction: Prediction
  onUpdate: () => void
}

const PICK_COLORS: Record<string, string> = {
  HOME_WIN: 'bg-blue-500/20 text-blue-300 border-blue-500/40',
  AWAY_WIN: 'bg-purple-500/20 text-purple-300 border-purple-500/40',
  DRAW: 'bg-yellow-500/20 text-yellow-300 border-yellow-500/40',
  OVER_2_5: 'bg-orange-500/20 text-orange-300 border-orange-500/40',
  BTTS: 'bg-pink-500/20 text-pink-300 border-pink-500/40',
}

const RESULT_STYLES: Record<string, string> = {
  WIN: 'bg-green-500/20 border-green-500 text-green-400',
  LOSS: 'bg-red-500/20 border-red-500 text-red-400',
  VOID: 'bg-gray-500/20 border-gray-500 text-gray-400',
}

function ConfidenceBar({ value }: { value: number }) {
  const color = value >= 75 ? 'bg-green-400' : value >= 60 ? 'bg-yellow-400' : 'bg-orange-400'
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-white/10 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${value}%` }} />
      </div>
      <span className="text-xs font-bold text-white/70 w-8 text-right">{value}%</span>
    </div>
  )
}

export default function PredictionCard({ prediction: p, onUpdate }: Props) {
  const [oddsInput, setOddsInput] = useState(p.odds ? String(p.odds) : '')
  const [editingOdds, setEditingOdds] = useState(false)
  const [scoreInputH, setScoreInputH] = useState(p.homeScore !== undefined ? String(p.homeScore) : '')
  const [scoreInputA, setScoreInputA] = useState(p.awayScore !== undefined ? String(p.awayScore) : '')
  const [editingScore, setEditingScore] = useState(false)

  const handleSaveOdds = () => {
    const val = parseFloat(oddsInput)
    if (!isNaN(val) && val > 1) {
      setOdds(p.id, val)
      onUpdate()
    }
    setEditingOdds(false)
  }

  const handleResult = (result: ResultType) => {
    const hs = scoreInputH !== '' ? parseInt(scoreInputH) : undefined
    const as_ = scoreInputA !== '' ? parseInt(scoreInputA) : undefined
    setResult(p.id, result, hs, as_)
    onUpdate()
    setEditingScore(false)
  }

  const resultBadge = p.result ? (
    <span className={`px-3 py-1 rounded-full text-xs font-bold border ${RESULT_STYLES[p.result]}`}>
      {p.result === 'WIN' ? '✅ WIN' : p.result === 'LOSS' ? '❌ LOSS' : '⬜ VOID'}
    </span>
  ) : null

  return (
    <div className={`bg-[#0f1923] border rounded-xl overflow-hidden transition-all ${
      p.result === 'WIN' ? 'border-green-500/50' :
      p.result === 'LOSS' ? 'border-red-500/40' :
      'border-[#1e3a5f] hover:border-[#2a4f7f]'
    }`}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 bg-[#0a1628] border-b border-[#1e3a5f]">
        <div className="flex items-center gap-2">
          {p.competitionEmblem && (
            <Image src={p.competitionEmblem} alt={p.competition} width={16} height={16} className="rounded-sm" />
          )}
          <span className="text-xs text-gray-400 font-medium">{p.competition}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500">🕐 {p.kickoff}</span>
          {resultBadge}
        </div>
      </div>

      <div className="p-4">
        {/* Teams */}
        <div className="flex items-center gap-3 mb-4">
          <div className="flex-1 flex items-center gap-2">
            {p.homeCrest && (
              <Image src={p.homeCrest} alt={p.homeTeam} width={28} height={28} className="object-contain" />
            )}
            <span className="font-semibold text-white text-sm leading-tight">{p.homeTeam}</span>
          </div>
          <div className="text-center px-2">
            {p.homeScore !== undefined && p.awayScore !== undefined ? (
              <span className="font-bold text-white text-lg">{p.homeScore} – {p.awayScore}</span>
            ) : (
              <span className="text-gray-500 font-bold text-sm">vs</span>
            )}
          </div>
          <div className="flex-1 flex items-center justify-end gap-2">
            <span className="font-semibold text-white text-sm leading-tight text-right">{p.awayTeam}</span>
            {p.awayCrest && (
              <Image src={p.awayCrest} alt={p.awayTeam} width={28} height={28} className="object-contain" />
            )}
          </div>
        </div>

        {/* Pick badge */}
        <div className={`inline-block px-3 py-1 rounded-full text-xs font-bold border mb-3 ${PICK_COLORS[p.pick] || PICK_COLORS.HOME_WIN}`}>
          🎯 {p.pickLabel}
        </div>

        {/* Confidence bar */}
        <div className="mb-3">
          <div className="flex justify-between text-xs text-gray-500 mb-1">
            <span>Confidence</span>
          </div>
          <ConfidenceBar value={p.confidence} />
        </div>

        {/* Reasoning */}
        <div className="space-y-1 mb-4">
          {p.reasoning.map((r, i) => (
            <div key={i} className="text-xs text-gray-400 flex items-start gap-1.5">
              <span className="text-green-400 mt-0.5">▸</span>
              <span>{r}</span>
            </div>
          ))}
        </div>

        {/* Odds + Result section */}
        <div className="border-t border-[#1e3a5f] pt-3 flex flex-wrap items-center gap-2">
          {/* Odds */}
          {editingOdds ? (
            <div className="flex items-center gap-1">
              <input
                type="number"
                step="0.01"
                min="1.01"
                placeholder="e.g. 1.85"
                value={oddsInput}
                onChange={e => setOddsInput(e.target.value)}
                className="w-24 bg-[#1a2f4a] border border-[#2a4f7f] rounded-lg px-2 py-1 text-sm text-white focus:outline-none focus:border-green-400"
                autoFocus
              />
              <button onClick={handleSaveOdds} className="px-2 py-1 bg-green-500 hover:bg-green-400 text-black text-xs font-bold rounded-lg">Save</button>
              <button onClick={() => setEditingOdds(false)} className="px-2 py-1 bg-white/10 hover:bg-white/20 text-gray-300 text-xs rounded-lg">✕</button>
            </div>
          ) : (
            <button
              onClick={() => setEditingOdds(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-[#1a2f4a] hover:bg-[#1e3a5f] border border-[#2a4f7f] hover:border-[#3a6faf] rounded-lg text-sm transition-colors"
            >
              <span className="text-yellow-400">💰</span>
              <span className="text-white font-medium">{p.odds ? `${p.odds}x` : 'Add Odds'}</span>
            </button>
          )}

          {/* Result buttons */}
          {!p.result ? (
            <div className="flex items-center gap-1 ml-auto">
              {editingScore ? (
                <>
                  <input
                    type="number" min="0" placeholder="H"
                    value={scoreInputH}
                    onChange={e => setScoreInputH(e.target.value)}
                    className="w-12 bg-[#1a2f4a] border border-[#2a4f7f] rounded px-2 py-1 text-sm text-white text-center focus:outline-none"
                  />
                  <span className="text-gray-400">-</span>
                  <input
                    type="number" min="0" placeholder="A"
                    value={scoreInputA}
                    onChange={e => setScoreInputA(e.target.value)}
                    className="w-12 bg-[#1a2f4a] border border-[#2a4f7f] rounded px-2 py-1 text-sm text-white text-center focus:outline-none"
                  />
                  <button onClick={() => handleResult('WIN')} className="px-2 py-1 bg-green-600 hover:bg-green-500 text-white text-xs font-bold rounded-lg">✅ W</button>
                  <button onClick={() => handleResult('LOSS')} className="px-2 py-1 bg-red-600 hover:bg-red-500 text-white text-xs font-bold rounded-lg">❌ L</button>
                  <button onClick={() => setEditingScore(false)} className="px-2 py-1 bg-white/10 text-gray-400 text-xs rounded-lg">✕</button>
                </>
              ) : (
                <button
                  onClick={() => setEditingScore(true)}
                  className="px-3 py-1.5 bg-[#1a2f4a] hover:bg-[#1e3a5f] border border-[#2a4f7f] rounded-lg text-xs text-gray-300 hover:text-white transition-colors"
                >
                  Mark Result
                </button>
              )}
            </div>
          ) : (
            <button
              onClick={() => { setResult(p.id, undefined as any); onUpdate() }}
              className="ml-auto text-xs text-gray-600 hover:text-gray-400"
            >
              Reset
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
