import type { CsCase } from '../../../features/cs/types'

type CsSummaryCardsProps = {
  cases: CsCase[]
  onSelect: (filter: string) => void
}

export function CsSummaryCards({ cases, onSelect }: CsSummaryCardsProps) {
  const cards = [
    ['신규', cases.filter((item) => item.status === '신규').length],
    ['오늘 접수', cases.length],
    ['첨부 확인 필요', cases.filter((item) => item.attachments.some((attachment) => !attachment.verifiedAt)).length],
    ['브랜드 답변 대기', cases.filter((item) => item.status === '브랜드 답변 대기').length],
    ['24시간 이상 미처리', cases.filter((item) => item.receivedAt.includes('10:20') && item.status !== '처리 완료').length],
    ['처리 중', cases.filter((item) => item.status === '처리 중').length],
    ['처리 완료', cases.filter((item) => item.status === '처리 완료').length],
  ] as const

  return (
    <section className="cs-summary-grid">
      {cards.map(([label, count]) => (
        <button className="work-summary-card" key={label} onClick={() => onSelect(label)} type="button">
          <span>{label}</span>
          <strong>{count}</strong>
        </button>
      ))}
    </section>
  )
}
