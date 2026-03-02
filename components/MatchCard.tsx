'use client'
import { useState } from 'react'
import Image from 'next/image'
import { Prediction, PickType, MarketType, ResultType } from '@/lib/types'

interface Props {
  predictions: Prediction[]
}

const MARKET_ORDER: MarketType[] = ['1X2', 'GG', 'OVER_1_5', 'OVER_2_5']
const MARKET_NAMES: Record<MarketType, string> = {
  '1X2':      '1X2',
  'GG':       'GG',
  'OVER_1_5': 'Over 1.5',
  'OVER_2_5': 'Over 2.5',
}

const PICK_STYLES: Record<string, { bg: string; icon: string }> = {
  HOME_WIN:  { bg: 'bg-blue-500/20 text-blue-300 border-blue-500/40',      icon: '🏠' },
  AWAY_WIN:  { bg: 'bg-purple-500/20 text-purple-300 border-purple-500/40', icon: '✈️' },
  DRAW:      { bg: 'bg-yellow-500/20 text-yellow-300 border-yellow-500/40', icon: '🤝' },
  OVER_1_5:  { bg: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40',       icon: '⚡' },
  OVER_2_5:  { bg: 'bg-orange-500/20 text-orange-300 border-orange-500/40', icon: '🔥' },
  UNDER_1_5: { bg: 'bg-slate-500/20 text-slate-300 border-slate-500/40',    icon: '🛡️' },
  UNDER_2_5: { bg: 'bg-slate-500/20 text-slate-300 border-slate-500/40',    icon: '🛡️' },
  BTTS:      { bg: 'bg-pink-500/20 text-pink-300 border-pink-500/40',       icon: '⚽' },
  NO_BTTS:   { bg: 'bg-gray-500/20 text-gray-300 border-gray-500/40',       icon: '🚫' },
}

function getMarketType(id: string): MarketType | null {
  const parts = id.split('-')
  const mt = parts.slice(3).join('-') as MarketType
  return MARKET_ORDER.includes(mt) ? mt : null
}

function getActualLabel(pick: PickType, homeScore: number, awayScore: number): string {
  const total = homeScore + awayScore
  switch (pick) {
    case 'HOME_WIN':  return homeScore > awayScore ? 'Home Win' : homeScore === awayScore ? 'Draw' : 'Away Win'
    case 'AWAY_WIN':  return awayScore > homeScore ? 'Away Win' : homeScore === awayScore ? 'Draw' : 'Home Win'
    case 'DRAW':      return homeScore === awayScore ? 'Draw' : homeScore > awayScore ? 'Home Win' : 'Away Win'
    case 'BTTS':      return homeScore >= 1 && awayScore >= 1 ? 'Yes' : 'No'
    case 'NO_BTTS':   return !(homeScore >= 1 && awayScore >= 1) ? 'No' : 'Yes'
    case 'OVER_1_5':  return total >= 2 ? 'Yes' : 'No'
    case 'UNDER_1_5': return total < 2  ? 'No'  : 'Yes'
    case 'OVER_2_5':  return total >= 3 ? 'Over' : 'Under'
    case 'UNDER_2_5': return total < 3  ? 'Under': 'Over'
    default:          return '—'
  }
}

function ConfidenceBar({ value }: { value: number }) {
  const color = value >= 78 ? 'bg-green-400' : value >= 65 ? 'bg-yellow-400' : 'bg-orange-400'
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1 bg-white/10 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${value}%` }} />
      </div>
      <span className="text-[11px] font-bold text-white/50 w-7 text-right">{value}%</span>
    </div>
  )
}

/** Parse reasoning lines into analysis bullets vs team stats vs H2H */
function parseReasoning(lines: string[]) {
  const bullets: string[] = []
  const teamStats: { name: string; meta: string; form: string; goals: string }[] = []
  let h2h: { title: string; wins: string; avg: string } | null = null

  for (const line of lines) {
    if (line.startsWith('STATS|')) {
      const [, name, meta, form, goals] = line.split('|')
      teamStats.push({ name, meta, form, goals })
    } else if (line.startsWith('H2H|')) {
      const [, title, wins, avg] = line.split('|')
      h2h = { title, wins, avg }
    } else {
      bullets.push(line)
    }
  }
  return { bullets, teamStats, h2h }
}

function MarketRow({ pred, hasScore, homeScore, awayScore }: {
  pred: Prediction
  hasScore: boolean
  homeScore?: number
  awayScore?: number
}) {
  const [open, setOpen] = useState(false)
  const mt = getMarketType(pred.id)
  const marketName = mt ? MARKET_NAMES[mt] : '—'
  const style = PICK_STYLES[pred.pick] ?? PICK_STYLES.HOME_WIN
  const result = pred.result
  const actual = hasScore ? getActualLabel(pred.pick, homeScore!, awayScore!) : null

  const resultIcon =
    result === 'WIN'  ? <span className="text-green-400 text-base">✅</span> :
    result === 'LOSS' ? <span className="text-red-400 text-base">❌</span> :
    result === 'VOID' ? <span className="text-gray-400 text-base">⬜</span> :
    <span className="w-5 h-5 rounded-full border-2 border-gray-600 inline-block align-middle" />

  const rowBg =
    result === 'WIN'  ? 'bg-green-500/10 border-green-500/20' :
    result === 'LOSS' ? 'bg-red-500/10 border-red-500/20' :
    'bg-white/[0.03] border-transparent'

  const { bullets, teamStats, h2h } = parseReasoning(pred.reasoning)

  return (
    <div className={`rounded-lg border overflow-hidden ${rowBg}`}>
      {/* Main row */}
      <div className="px-3 py-2.5">
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500 font-medium w-14 flex-shrink-0">{marketName}</span>

          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold border flex-1 min-w-0 ${style.bg}`}>
            {style.icon} <span className="truncate">{pred.pickLabel}</span>
          </span>

          {result && actual ? (
            <span className="text-[11px] text-gray-500 flex-shrink-0">
              Act: <span className="text-gray-300">{actual}</span>
            </span>
          ) : null}

          <span className="flex-shrink-0">{resultIcon}</span>

          <button
            onClick={() => setOpen(v => !v)}
            className="flex-shrink-0 flex items-center gap-1 px-2 py-0.5 rounded bg-white/10 hover:bg-white/20 text-white text-xs font-semibold transition-colors"
          >
            {open ? 'Hide' : 'Details'}
            <span className={`transition-transform duration-200 inline-block ${open ? 'rotate-180' : ''}`}>▾</span>
          </button>
        </div>

        <div className="mt-1.5 pl-[3.75rem]">
          <ConfidenceBar value={pred.confidence} />
        </div>
      </div>

      {/* Accordion */}
      {open && (
        <div className="border-t border-white/5 px-3 py-3 space-y-3">

          {/* Analysis bullets */}
          {bullets.length > 0 && (
            <div className="space-y-1">
              <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-1">Analysis</p>
              {bullets.map((r, i) => (
                <p key={i} className="text-xs text-gray-400 flex items-start gap-1.5">
                  <span className="text-green-400 mt-0.5 flex-shrink-0">▸</span>
                  {r}
                </p>
              ))}
            </div>
          )}

          {/* Both team stats */}
          {teamStats.length > 0 && (
            <div className="space-y-2">
              <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">Team Stats</p>
              <div className="grid grid-cols-2 gap-2">
                {teamStats.map((t, i) => (
                  <div key={i} className="bg-white/5 rounded-lg p-2.5 space-y-1">
                    <p className="text-xs font-bold text-white truncate">{t.name}</p>
                    <p className="text-[11px] text-gray-400">{t.meta}</p>
                    <p className="text-[11px] text-gray-400">{t.form}</p>
                    <p className="text-[11px] text-gray-400">{t.goals}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* H2H */}
          {h2h && (
            <div className="bg-white/5 rounded-lg p-2.5 space-y-1">
              <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">Head to Head</p>
              <p className="text-xs text-gray-300">{h2h.wins}</p>
              <p className="text-[11px] text-gray-500">{h2h.avg}</p>
            </div>
          )}

        </div>
      )}
    </div>
  )
}

export default function MatchCard({ predictions }: Props) {
  if (predictions.length === 0) return null

  const base = predictions[0]
  const hasScore = base.homeScore !== undefined && base.awayScore !== undefined

  const sorted = [...predictions].sort((a, b) => {
    const ma = getMarketType(a.id)
    const mb = getMarketType(b.id)
    return (ma ? MARKET_ORDER.indexOf(ma) : 99) - (mb ? MARKET_ORDER.indexOf(mb) : 99)
  })

  const results = predictions.map(p => p.result).filter(Boolean) as ResultType[]
  const allWon = results.length > 0 && results.every(r => r === 'WIN' || r === 'VOID') && results.some(r => r === 'WIN')
  const anyLost = results.some(r => r === 'LOSS')

  // Score summary: how many markets we got right
  const wins  = results.filter(r => r === 'WIN').length
  const total = results.filter(r => r !== 'VOID').length

  return (
    <div className="bg-[#0f1923] border border-[#1e3a5f] rounded-xl overflow-hidden">

      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2.5 bg-[#0a1628] border-b border-[#1e3a5f]">
        <div className="flex items-center gap-2 min-w-0">
          {base.competitionEmblem && (
            <Image src={base.competitionEmblem} alt="" width={14} height={14} className="rounded-sm opacity-80 flex-shrink-0" />
          )}
          <span className="text-xs text-gray-400 font-medium truncate">{base.competition}</span>
          <span className="text-gray-700">·</span>
          <span className="text-xs text-gray-600">🕐 {base.kickoff}</span>
        </div>
        {allWon && (
          <span className="px-2.5 py-0.5 rounded text-xs font-bold bg-green-500 text-black flex-shrink-0">✓ WON</span>
        )}
        {anyLost && (
          <span className="px-2.5 py-0.5 rounded text-xs font-bold bg-red-500/20 border border-red-500 text-red-400 flex-shrink-0">✗ LOSS</span>
        )}
      </div>

      {/* Teams + Score */}
      <div className="px-4 pt-3 pb-2">
        <div className="flex items-center gap-3">
          <div className="flex-1 flex items-center gap-2 min-w-0">
            {base.homeCrest && <Image src={base.homeCrest} alt="" width={28} height={28} className="object-contain flex-shrink-0" />}
            <span className="font-semibold text-white text-sm truncate">{base.homeTeam}</span>
          </div>

          <div className="flex-shrink-0 text-center min-w-[60px]">
            {hasScore ? (
              <div className="flex flex-col items-center">
                <span className="font-bold text-white text-xl leading-tight">{base.homeScore}–{base.awayScore}</span>
                {base.htHomeScore !== undefined && (
                  <span className="text-[10px] text-gray-500">HT {base.htHomeScore}–{base.htAwayScore}</span>
                )}
              </div>
            ) : (
              <span className="text-gray-600 text-sm">vs</span>
            )}
          </div>

          <div className="flex-1 flex items-center justify-end gap-2 min-w-0">
            <span className="font-semibold text-white text-sm truncate text-right">{base.awayTeam}</span>
            {base.awayCrest && <Image src={base.awayCrest} alt="" width={28} height={28} className="object-contain flex-shrink-0" />}
          </div>
        </div>

        {/* Final Score vs Prediction summary */}
        {hasScore && total > 0 && (
          <div className="mt-2 pt-2 border-t border-[#1e3a5f] flex items-center justify-between">
            <span className="text-xs text-gray-500">
              Final Score: <span className="text-white font-semibold">{base.homeScore}–{base.awayScore}</span>
            </span>
            <span className={`text-xs font-bold ${wins === total ? 'text-green-400' : wins > 0 ? 'text-yellow-400' : 'text-red-400'}`}>
              {wins}/{total} predictions correct
            </span>
          </div>
        )}
      </div>

      {/* Market rows */}
      <div className="px-4 pb-4 space-y-2">
        <p className="text-[10px] font-semibold text-gray-600 uppercase tracking-widest mb-1">Predictions</p>
        {sorted.map(pred => (
          <MarketRow
            key={pred.id}
            pred={pred}
            hasScore={hasScore}
            homeScore={base.homeScore}
            awayScore={base.awayScore}
          />
        ))}
      </div>
    </div>
  )
}
