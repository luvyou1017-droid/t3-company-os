import type { WorkFilter } from '../../../features/myWork/types'

type Summary = Record<'오늘 업무' | '긴급 업무' | '지연 업무' | '오늘 마감' | '승인 대기' | '이번 주 예정', number>

type WorkSummaryCardsProps = {
  summary: Summary
  activeQuick: WorkFilter['quick']
  onSelect: (quick: WorkFilter['quick']) => void
}

const quickMap: Record<keyof Summary, WorkFilter['quick']> = {
  '오늘 업무': '오늘',
  '긴급 업무': '긴급',
  '지연 업무': '지연',
  '오늘 마감': '오늘',
  '승인 대기': '승인 대기',
  '이번 주 예정': '이번 주',
}

export function WorkSummaryCards({ summary, activeQuick, onSelect }: WorkSummaryCardsProps) {
  return (
    <section className="work-summary-grid">
      {Object.entries(summary).map(([label, value]) => {
        const quick = quickMap[label as keyof Summary]
        return (
          <button
            className={activeQuick === quick ? 'work-summary-card is-active' : 'work-summary-card'}
            key={label}
            onClick={() => onSelect(quick)}
            type="button"
          >
            <span>{label}</span>
            <strong>{value}</strong>
          </button>
        )
      })}
    </section>
  )
}
