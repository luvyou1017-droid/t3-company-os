import { formatWon } from '../../../features/samples/sampleUtils'
import type { SampleRequest } from '../../../features/samples/types'
import { SampleCostOwnerBadge, SampleStatusBadge } from './SampleBadges'

export function SampleTable({ samples, onSelect }: { samples: SampleRequest[]; onSelect: (sample: SampleRequest) => void }) {
  return (
    <>
      <div className="schedule-table-wrap">
        <table className="schedule-table sample-table">
          <thead><tr>{['요청일','공동구매 일정','셀러','브랜드','상품명','옵션','요청자','담당 매니저','발주 담당자','발주 방식','유상·무상','비용 부담자','샘플 금액','수량','배송 상태','회수 여부','정산 반영','현재 상태'].map((h) => <th key={h}>{h}</th>)}</tr></thead>
          <tbody>{samples.map((s) => <tr key={s.id} onClick={() => onSelect(s)}>
            <td>{s.requestedAt}</td><td>{s.campaignName}</td><td>{s.sellerName}</td><td>{s.brandName}</td><td>{s.productName}</td><td>{s.optionName}</td><td>{s.requestedBy}</td><td>{s.managerName}</td><td>{s.orderManagerName}</td><td>{s.orderMethod}</td><td>{s.paymentType}</td><td><SampleCostOwnerBadge owner={s.costOwner} /></td><td>{formatWon(s.sampleCost)}</td><td>{s.quantity}</td><td>{s.deliveryStatus}</td><td>{s.returnRequired ? s.returnedAt ? '회수 완료' : '회수 필요' : '불필요'}</td><td>{s.settlementReflected ? '반영 완료' : '대기'}</td><td><SampleStatusBadge status={s.status} /></td>
          </tr>)}</tbody>
        </table>
      </div>
      <div className="schedule-mobile-list">{samples.map((s) => <button className="schedule-mobile-card" key={s.id} onClick={() => onSelect(s)} type="button"><div className="schedule-mobile-card__top"><strong>{s.productName}</strong><span>{s.requestedAt}</span></div><SampleStatusBadge status={s.status} /><dl><div><dt>공동구매</dt><dd>{s.campaignName}</dd></div><div><dt>비용</dt><dd>{s.paymentType} / {s.costOwner}</dd></div></dl></button>)}</div>
    </>
  )
}
