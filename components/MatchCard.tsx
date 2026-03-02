'use client'
import Image from 'next/image'
import { Prediction, PickType, MarketType } from '@/lib/types'

interface Props {
  predictions: Prediction[]   // all 4 market predictions for this match (same matchId)
}

// ──────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────

const MARKET_LABELS: Record<MarketType, string> = {
  '1X2':     '1X2',
  'GG':      'GG',
  'OVER_1_5':'Over 1.5',
  'OVER_2_5':'Over 2.5',
}

const MARKET_ORDER: MarketType[] = ['1X2', 'GG', 'OVER_1_5', 'OVER_2_5']

/** Parse the marketType out of a prediction id: "{matchId}-{date}-{marketType}" */
function getMarketType(id: string): MarketType | null {
  const parts = id.split('-')
  const mt = parts.slice(3).join('-') as MarketType
  return MARKET_ORDER.includes(mt) ? mt : null
}

/** The "actual" label shown after a match finishes */
function actualLabel(
  pick: PickType,
  predLabel: string,
  homeTeam: string,
  awayTeam: string,
  homeScore: number,
  awayScore: number
): string {
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

// ──────────────────────────────────────────────────────────────
// Match-level WON/LOST/PENDING badge
// ──────────────────────────────────────────────────────────────
function matchBadge(preds: Prediction[]) {
  const results = preds.map(p => p.result).filter(Boolean)
  if (results.length === 0) return null
  if (results.every(r => r === 'WIN' || r === 'VOID')) {
    const wins = results.filter(r => r === 'WIN').length
    if (wins === preds.filter(p => p.result !== 'VOID').length && wins > 0) {
      return { label: `✓ WON`, cls: 'bg-green-500 text-black' }
    }
  }
  if (results.some(r => r === 'LOSS')) {
    return { label: `✗ LOSS`, cls: 'bg-red-500/20 border border-red-500 text-red-400' }
  }
  if (results.length < preds.length) return null // some still pending
  return null
}

// ──────────────────────────────────────────────────────────────
// Component
// ──────────────────────────────────────────────────────────────
export default function MatchCard({ predictions }: Props) {
  if (predictions.length === 0) return null

  const base = predictions[0]
  const hasScore = base.homeScore !== undefined && base.awayScore !== undefined
  const badge = matchBadge(predictions)

  // Sort by canonical market order
  const sorted = [...predictions].sort((a, b) => {
    const ma = getMarketType(a.id)
    const mb = getMarketType(b.id)
    return (ma ? MARKET_ORDER.indexOf(ma) : 99) - (mb ? MARKET_ORDER.indexOf(mb) : 99)
  })

  return (
    <div className="bg-[#0f1923] border border-[#1e3a5f] rounded-xl overflow-hidden">

      {/* ── Card header ─────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-4 py-2.5 bg-[#0a1628] border-b border-[#1e3a5f]">
        <div className="flex items-center gap-2 min-w-0">
          {base.competitionEmblem && (
            <Image src={base.competitionEmblem} alt={base.competition} width={14} height={14} className="rounded-sm opacity-80 flex-shrink-0" />
          )}
          <span className="text-xs text-gray-400 font-medium truncate">{base.competition}</span>
          <span className="text-xs text-gray-600">·</span>
          <span className="text-xs text-gray-600">🕐 {base.kickoff}</span>
        </div>
        {badge && (
          <span className={`px-3 py-0.5 rounded text-xs font-bold flex-shrink-0 ${badge.cls}`}>
            {badge.label}
          </span>
        )}
      </div>

      {/* ── Teams + Score ────────────────────────────────────────── */}
      <div className="px-4 pt-3 pb-2">
        <div className="flex items-center gap-2">
          {/* Home */}
          <div className="flex-1 flex items-center gap-2 min-w-0">
            {base.homeCrest && (
              <Image src={base.homeCrest} alt={base.homeTeam} width={28} height={28} className="object-contain flex-shrink-0" />
            )}
            <span className="font-semibold text-white text-sm leading-tight truncate">{base.homeTeam}</span>
          </div>

          {/* Score or vs */}
          <div className="flex-shrink-0 text-center min-w-[64px]">
            {hasScore ? (
              <div className="flex flex-col items-center gap-0.5">
                <span className="font-bold text-white text-lg leading-tight">
                  {base.homeScore}–{base.awayScore}
                </span>
                {base.htHomeScore !== undefined && base.htAwayScore !== undefined && (
                  <span className="text-[10px] text-gray-500">HT {base.htHomeScore}–{base.htAwayScore}</span>
                )}
              </div>
            ) : (
              <span className="text-gray-600 text-sm font-medium">vs</span>
            )}
          </div>

          {/* Away */}
          <div className="flex-1 flex items-center justify-end gap-2 min-w-0">
            <span className="font-semibold text-white text-sm leading-tight truncate text-right">{base.awayTeam}</span>
            {base.awayCrest && (
              <Image src={base.awayCrest} alt={base.awayTeam} width={28} height={28} className="object-contain flex-shrink-0" />
            )}
          </div>
        </div>
      </div>

      {/* ── Detailed breakdown ───────────────────────────────────── */}
      <div className="px-4 pb-3">
        <div className="text-[10px] font-semibold text-gray-500 uppercase tracking-widest mb-2">
          Detailed Breakdown
        </div>

        <div className="space-y-2">
          {sorted.map(pred => {
            const mt = getMarketType(pred.id)
            const marketLabel = mt ? MARKET_LABELS[mt] : pred.pick
            const hasResult = !!pred.result
            const actual = hasScore
              ? actualLabel(pred.pick, pred.pickLabel, base.homeTeam, base.awayTeam, base.homeScore!, base.awayScore!)
              : null

            const resultIcon =
              pred.result === 'WIN'  ? '✅' :
              pred.result === 'LOSS' ? '❌' :
              pred.result === 'VOID' ? '⬜' : ''

            const predIsCorrect = pred.result === 'WIN'
            const predIsWrong   = pred.result === 'LOSS'

            return (
              <div
                key={pred.id}
                className={`flex items-center justify-between rounded-lg px-3 py-2 ${
                  predIsCorrect ? 'bg-green-500/10 border border-green-500/20' :
                  predIsWrong  ? 'bg-red-500/10 border border-red-500/20' :
                  'bg-white/[0.04] border border-transparent'
                }`}
              >
                {/* Market name */}
                <span className="text-xs text-gray-400 font-medium w-16 flex-shrink-0">{marketLabel}</span>

                {/* Prediction */}
                <div className="flex-1 flex items-center gap-1 min-w-0 px-2">
                  <span className="text-[10px] text-gray-600">Pred:</span>
                  <span className={`text-xs font-semibold truncate ${predIsCorrect ? 'text-green-400' : predIsWrong ? 'text-red-400' : 'text-white'}`}>
                    {pred.pickLabel}
                  </span>
                </div>

                {/* Actual result (after match) */}
                {hasResult && actual ? (
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    <div className="text-right">
                      <span className="text-[10px] text-gray-600">Act: </span>
                      <span className="text-xs text-gray-300">{actual}</span>
                    </div>
                    <span className="text-sm">{resultIcon}</span>
                  </div>
                ) : (
                  <div className="flex-shrink-0 text-right">
                    <span className="text-[10px] text-gray-700">Pending</span>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
