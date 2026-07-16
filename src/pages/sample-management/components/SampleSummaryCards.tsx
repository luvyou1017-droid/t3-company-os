import type { SampleRequest } from '../../../features/samples/types'

export function SampleSummaryCards({ samples, onSelect }: { samples: SampleRequest[]; onSelect: (quick: string) => void }) {
  const cards = [
    ['신규 요청', samples.filter((s) => s.status === '요청 접수').length],
    ['발주 대기', samples.filter((s) => s.status === '발주 대기' || s.status === '승인 대기').length],
    ['배송 중', samples.filter((s) => s.status === '배송 중').length],
    ['수령 완료', samples.filter((s) => s.status === '수령 완료').length],
    ['회수 필요', samples.filter((s) => s.returnRequired && !s.returnedAt).length],
    ['정산 반영 대기', samples.filter((s) => s.status === '정산 반영 대기').length],
    ['완료', samples.filter((s) => s.status === '완료').length],
  ] as const
  return <section className="cs-summary-grid">{cards.map(([label, count]) => <button className="work-summary-card" key={label} onClick={() => onSelect(label)} type="button"><span>{label}</span><strong>{count}</strong></button>)}</section>
}
