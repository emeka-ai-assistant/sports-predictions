'use client'
import Image from 'next/image'
import { Prediction, PickType, MarketType, ResultType } from '@/lib/types'

interface Props {
  predictions: Prediction[]
}

const MARKET_ORDER: MarketType[] = ['1X2', 'GG', 'OVER_1_5', 'OVER_2_5']
const MARKET_NAMES: Record<MarketType, string> = {
  '1X2': '1X2',
  'GG': 'GG',
  'OVER_1_5': 'Over 1.5',
  'OVER_2_5': 'Over 2.5',
}

function getMarketType(id: string): MarketType | null {
  const parts = id.split('-')
  const mt = parts.slice(3).join('-') as MarketType
  return MARKET_ORDER.includes(mt) ? mt : null
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr)
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

function getActualResult(pick: PickType, homeScore: number, awayScore: number): string {
  const total = homeScore + awayScore
  switch (pick) {
    case 'HOME_WIN': return homeScore > awayScore ? 'Home Win' : homeScore === awayScore ? 'Draw' : 'Away Win'
    case 'AWAY_WIN': return awayScore > homeScore ? 'Away Win' : homeScore === awayScore ? 'Draw' : 'Home Win'
    case 'DRAW': return homeScore === awayScore ? 'Draw' : homeScore > awayScore ? 'Home Win' : 'Away Win'
    case 'BTTS': return homeScore >= 1 && awayScore >= 1 ? 'Yes' : 'No'
    case 'NO_BTTS': return !(homeScore >= 1 && awayScore >= 1) ? 'No' : 'Yes'
    case 'OVER_1_5': return total >= 2 ? 'Yes' : 'No'
    case 'UNDER_1_5': return total < 2 ? 'No' : 'Yes'
    case 'OVER_2_5': return total >= 3 ? 'Over' : 'Under'
    case 'UNDER_2_5': return total < 3 ? 'Under' : 'Over'
    default: return '—'
  }
}

function ResultCircle({ result }: { result?: ResultType }) {
  if (result === 'WIN') return (
    <div className="w-6 h-6 rounded-full bg-green-500 flex items-center justify-center">
      <span className="text-white text-xs font-bold">✓</span>
    </div>
  )
  if (result === 'LOSS') return (
    <div className="w-6 h-6 rounded-full bg-red-500 flex items-center justify-center">
      <span className="text-white text-xs font-bold">✕</span>
    </div>
  )
  if (result === 'VOID') return (
    <div className="w-6 h-6 rounded-full bg-gray-500 flex items-center justify-center">
      <span className="text-white text-xs font-bold">○</span>
    </div>
  )
  return (
    <div className="w-6 h-6 rounded-full border-2 border-gray-600" />
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

  // Overall match status
  const results = predictions.map(p => p.result).filter(Boolean) as ResultType[]
  const allWon = results.length > 0 && results.every(r => r === 'WIN' || r === 'VOID')
  const anyLost = results.some(r => r === 'LOSS')

  return (
    <div className="bg-[#0f1923] border border-[#1e3a5f] rounded-xl overflow-hidden">
      {/* Header - Date & Competition */}
      <div className="px-4 py-2 bg-[#0a1628] border-b border-[#1e3a5f] flex items-center justify-between">
        <div className="flex items-center gap-2">
          {base.competitionEmblem && (
            <Image src={base.competitionEmblem} alt="" width={16} height={16} className="rounded-sm opacity-80" />
          )}
          <span className="text-xs text-gray-400">{base.competition}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500">{formatDate(base.matchDate)}</span>
          <span className="text-xs text-gray-600">·</span>
          <span className="text-xs text-gray-500">{base.kickoff}</span>
        </div>
      </div>

      {/* Match Row - Teams with Score */}
      <div className="px-4 py-4">
        <div className="flex items-center justify-between gap-4">
          {/* Home Team */}
          <div className="flex-1 flex items-center gap-3">
            {base.homeCrest && (
              <Image src={base.homeCrest} alt="" width={32} height={32} className="object-contain" />
            )}
            <span className="font-semibold text-white text-base truncate">{base.homeTeam}</span>
          </div>

          {/* Score or VS */}
          <div className="flex-shrink-0">
            {hasScore ? (
              <div className="text-center">
                <span className="text-2xl font-bold text-white">
                  {base.homeScore} – {base.awayScore}
                </span>
              </div>
            ) : (
              <span className="text-gray-600 font-medium">VS</span>
            )}
          </div>

          {/* Away Team */}
          <div className="flex-1 flex items-center justify-end gap-3">
            <span className="font-semibold text-white text-base truncate text-right">{base.awayTeam}</span>
            {base.awayCrest && (
              <Image src={base.awayCrest} alt="" width={32} height={32} className="object-contain" />
            )}
          </div>
        </div>
      </div>

      {/* Predictions Section */}
      <div className="px-4 pb-4">
        <div className="text-xs font-semibold text-gray-500 uppercase mb-3 tracking-wider">
          Prediction
        </div>

        <div className="space-y-2">
          {sorted.map(pred => {
            const mt = getMarketType(pred.id)
            const marketName = mt ? MARKET_NAMES[mt] : pred.pick
            const result = pred.result
            const hasResult = !!result
            
            let actual = null
            if (hasScore) {
              actual = getActualResult(pred.pick, base.homeScore!, base.awayScore!)
            }

            return (
              <div key={pred.id} className="flex items-center justify-between py-2 border-b border-[#1e3a5f]/50 last:border-0">
                {/* Market name */}
                <span className="text-sm text-gray-400 w-20 flex-shrink-0">{marketName}</span>

                {/* Prediction value */}
                <div className="flex-1 px-4">
                  <span className={`text-sm font-medium ${
                    hasResult && result === 'WIN' ? 'text-green-400' :
                    hasResult && result === 'LOSS' ? 'text-red-400' : 'text-white'
                  }`}>
                    {pred.pickLabel}
                  </span>
                </div>

                {/* Actual vs Result */}
                <div className="flex items-center gap-3">
                  {hasResult && actual && (
                    <span className="text-sm text-gray-500">
                      <span className="text-gray-600">Act:</span> <span className="text-gray-300">{actual}</span>
                    </span>
                  )}
                  <ResultCircle result={result} />
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Overall Status Badge */}
      {(allWon || anyLost) && (
        <div className={`px-4 py-2 text-center text-sm font-bold ${
          allWon ? 'bg-green-500/20 text-green-400 border-t border-green-500/30' : 
          'bg-red-500/20 text-red-400 border-t border-red-500/30'
        }`}>
          {allWon ? '✓ ALL PREDICTIONS WON' : '✗ PREDICTIONS FAILED'}
        </div>
      )}
    </div>
  )
}
