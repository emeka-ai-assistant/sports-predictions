'use client'
import { useState } from 'react'
import Image from 'next/image'
import { Prediction, ResultType } from '@/lib/types'
import { setOdds, setResult } from '@/lib/storage'

interface Props {
  prediction: Prediction
  onUpdate: () => void
  selected?: boolean
  onToggleSelect?: (id: string) => void
}

const PICK_STYLES: Record<string, { bg: string; label: string; icon: string }> = {
  HOME_WIN:  { bg: 'bg-blue-500/20 text-blue-300 border-blue-500/40',      label: '🏠 Home Win',    icon: '🏠' },
  AWAY_WIN:  { bg: 'bg-purple-500/20 text-purple-300 border-purple-500/40', label: '✈️ Away Win',   icon: '✈️' },
  DRAW:      { bg: 'bg-yellow-500/20 text-yellow-300 border-yellow-500/40', label: '🤝 Draw',        icon: '🤝' },
  OVER_1_5:  { bg: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40',       label: '⚡ Over 1.5',   icon: '⚡' },
  OVER_2_5:  { bg: 'bg-orange-500/20 text-orange-300 border-orange-500/40', label: '🔥 Over 2.5',   icon: '🔥' },
  BTTS:      { bg: 'bg-pink-500/20 text-pink-300 border-pink-500/40',       label: '⚽ BTTS',        icon: '⚽' },
  ONE_UP:    { bg: 'bg-green-500/20 text-green-300 border-green-500/40',    label: '☝️ 1UP',         icon: '☝️' },
  TWO_UP:    { bg: 'bg-teal-500/20 text-teal-300 border-teal-500/40',       label: '✌️ 2UP',         icon: '✌️' },
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
        <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${value}%` }} />
      </div>
      <span className="text-xs font-bold text-white/60 w-8 text-right">{value}%</span>
    </div>
  )
}

function PickBadge({ pick, pickLabel }: { pick: string; pickLabel: string }) {
  const style = PICK_STYLES[pick] ?? PICK_STYLES.HOME_WIN
  return (
    <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold border ${style.bg}`}>
      {style.icon} {pickLabel}
    </span>
  )
}

function PickTooltip({ pick }: { pick: string }) {
  if (pick === 'ONE_UP') return (
    <span className="text-xs text-gray-500">Lead by 1+ goal at any point = WIN</span>
  )
  if (pick === 'TWO_UP') return (
    <span className="text-xs text-gray-500">Lead by 2+ goals at any point = WIN</span>
  )
  if (pick === 'OVER_1_5') return (
    <span className="text-xs text-gray-500">2+ total goals in the match</span>
  )
  if (pick === 'OVER_2_5') return (
    <span className="text-xs text-gray-500">3+ total goals in the match</span>
  )
  return null
}

export default function PredictionCard({ prediction: p, onUpdate, selected, onToggleSelect }: Props) {
  const [oddsInput, setOddsInput] = useState(p.odds ? String(p.odds) : '')
  const [editingOdds, setEditingOdds] = useState(false)
  const [scoreH, setScoreH] = useState(p.homeScore !== undefined ? String(p.homeScore) : '')
  const [scoreA, setScoreA] = useState(p.awayScore !== undefined ? String(p.awayScore) : '')
  const [editingScore, setEditingScore] = useState(false)
  const [saving, setSaving] = useState(false)

  const handleSaveOdds = async () => {
    const val = parseFloat(oddsInput)
    if (!isNaN(val) && val > 1) {
      setSaving(true)
      await setOdds(p.id, val)
      setSaving(false)
      onUpdate()
    }
    setEditingOdds(false)
  }

  const handleResult = async (result: ResultType) => {
    const hs = scoreH !== '' ? parseInt(scoreH) : undefined
    const as_ = scoreA !== '' ? parseInt(scoreA) : undefined
    setSaving(true)
    await setResult(p.id, result, hs, as_)
    setSaving(false)
    onUpdate()
    setEditingScore(false)
  }

  const handleReset = async () => {
    setSaving(true)
    await setResult(p.id, undefined)
    setSaving(false)
    onUpdate()
  }

  const isSelectable = !!onToggleSelect
  const cardBorder =
    selected ? 'border-green-400/70 ring-1 ring-green-400/30' :
    p.result === 'WIN' ? 'border-green-500/50' :
    p.result === 'LOSS' ? 'border-red-500/40' :
    'border-[#1e3a5f] hover:border-[#2a4f7f]'

  return (
    <div
      className={`bg-[#0f1923] border rounded-xl overflow-hidden transition-all ${cardBorder} ${saving ? 'opacity-70' : ''}`}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 bg-[#0a1628] border-b border-[#1e3a5f]">
        <div className="flex items-center gap-2">
          {isSelectable && (
            <button
              onClick={() => onToggleSelect!(p.id)}
              className={`w-5 h-5 rounded flex items-center justify-center border transition-colors flex-shrink-0 ${
                selected
                  ? 'bg-green-500 border-green-500 text-black'
                  : 'border-gray-600 hover:border-green-400'
              }`}
            >
              {selected && <span className="text-xs font-bold">✓</span>}
            </button>
          )}
          {p.competitionEmblem && (
            <Image src={p.competitionEmblem} alt={p.competition} width={14} height={14} className="rounded-sm opacity-80" />
          )}
          <span className="text-xs text-gray-400 font-medium truncate max-w-[140px]">{p.competition}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-600">🕐 {p.kickoff}</span>
          {p.result && (
            <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold border ${RESULT_STYLES[p.result]}`}>
              {p.result === 'WIN' ? '✅ WIN' : p.result === 'LOSS' ? '❌ LOSS' : '⬜ VOID'}
            </span>
          )}
        </div>
      </div>

      <div className={`p-4 ${isSelectable ? 'cursor-pointer' : ''}`} onClick={isSelectable ? () => onToggleSelect!(p.id) : undefined}>
        {/* Teams */}
        <div className="flex items-center gap-2 mb-3">
          <div className="flex-1 flex items-center gap-2 min-w-0">
            {p.homeCrest && (
              <Image src={p.homeCrest} alt={p.homeTeam} width={26} height={26} className="object-contain flex-shrink-0" />
            )}
            <span className="font-semibold text-white text-sm leading-tight truncate">{p.homeTeam}</span>
          </div>
          <div className="flex-shrink-0 px-1 text-center">
            {p.homeScore !== undefined && p.awayScore !== undefined ? (
              <span className="font-bold text-white">{p.homeScore}–{p.awayScore}</span>
            ) : (
              <span className="text-gray-600 text-xs font-medium">vs</span>
            )}
          </div>
          <div className="flex-1 flex items-center justify-end gap-2 min-w-0">
            <span className="font-semibold text-white text-sm leading-tight truncate text-right">{p.awayTeam}</span>
            {p.awayCrest && (
              <Image src={p.awayCrest} alt={p.awayTeam} width={26} height={26} className="object-contain flex-shrink-0" />
            )}
          </div>
        </div>

        {/* Pick + tooltip */}
        <div className="flex flex-wrap items-center gap-2 mb-3">
          <PickBadge pick={p.pick} pickLabel={p.pickLabel} />
          <PickTooltip pick={p.pick} />
        </div>

        {/* Confidence */}
        <div className="mb-3">
          <div className="text-xs text-gray-600 mb-1">Confidence</div>
          <ConfidenceBar value={p.confidence} />
        </div>

        {/* Reasoning */}
        <div className="space-y-1 mb-4">
          {p.reasoning.map((r, i) => (
            <p key={i} className="text-xs text-gray-400 flex items-start gap-1.5">
              <span className="text-green-400 mt-0.5 flex-shrink-0">▸</span>
              {r}
            </p>
          ))}
        </div>
      </div>

      {/* Odds + Result (always clickable, not part of select zone) */}
      <div className="px-4 pb-4">
        <div className="border-t border-[#1e3a5f] pt-3 flex flex-wrap items-center gap-2">
          {/* Odds input */}
          {editingOdds ? (
            <div className="flex items-center gap-1.5" onClick={e => e.stopPropagation()}>
              <input
                type="number" step="0.01" min="1.01" placeholder="e.g. 1.85"
                value={oddsInput}
                onChange={e => setOddsInput(e.target.value)}
                className="w-24 bg-[#1a2f4a] border border-[#2a4f7f] rounded-lg px-2 py-1 text-sm text-white focus:outline-none focus:border-green-400"
                autoFocus
                onKeyDown={e => e.key === 'Enter' && handleSaveOdds()}
              />
              <button onClick={handleSaveOdds} className="px-2 py-1 bg-green-500 hover:bg-green-400 text-black text-xs font-bold rounded-lg">Save</button>
              <button onClick={() => setEditingOdds(false)} className="px-2 py-1 bg-white/10 text-gray-300 text-xs rounded-lg">✕</button>
            </div>
          ) : (
            <button
              onClick={e => { e.stopPropagation(); setEditingOdds(true) }}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-[#1a2f4a] hover:bg-[#1e3a5f] border border-[#2a4f7f] rounded-lg text-sm transition-colors"
            >
              <span className="text-yellow-400">💰</span>
              <span className="text-white font-medium">{p.odds ? `${p.odds}x` : 'Add Odds'}</span>
            </button>
          )}

          {/* Result section */}
          <div className="ml-auto" onClick={e => e.stopPropagation()}>
            {!p.result ? (
              editingScore ? (
                <div className="flex items-center gap-1.5 flex-wrap">
                  <input type="number" min="0" placeholder="H" value={scoreH} onChange={e => setScoreH(e.target.value)}
                    className="w-11 bg-[#1a2f4a] border border-[#2a4f7f] rounded px-1.5 py-1 text-sm text-white text-center focus:outline-none" />
                  <span className="text-gray-500 text-sm">–</span>
                  <input type="number" min="0" placeholder="A" value={scoreA} onChange={e => setScoreA(e.target.value)}
                    className="w-11 bg-[#1a2f4a] border border-[#2a4f7f] rounded px-1.5 py-1 text-sm text-white text-center focus:outline-none" />
                  <button onClick={() => handleResult('WIN')} className="px-2.5 py-1 bg-green-600 hover:bg-green-500 text-white text-xs font-bold rounded-lg">✅</button>
                  <button onClick={() => handleResult('LOSS')} className="px-2.5 py-1 bg-red-600 hover:bg-red-500 text-white text-xs font-bold rounded-lg">❌</button>
                  <button onClick={() => handleResult('VOID')} className="px-2 py-1 bg-gray-600 hover:bg-gray-500 text-white text-xs rounded-lg">⬜</button>
                  <button onClick={() => setEditingScore(false)} className="px-2 py-1 bg-white/10 text-gray-400 text-xs rounded-lg">✕</button>
                </div>
              ) : (
                <button onClick={() => setEditingScore(true)}
                  className="px-3 py-1.5 bg-[#1a2f4a] hover:bg-[#1e3a5f] border border-[#2a4f7f] rounded-lg text-xs text-gray-300 hover:text-white transition-colors">
                  Mark Result
                </button>
              )
            ) : (
              <button onClick={handleReset} className="text-xs text-gray-700 hover:text-gray-400 transition-colors">
                Reset
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
