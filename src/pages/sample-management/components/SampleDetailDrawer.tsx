import type { SampleRequest, SampleStatus } from '../../../features/samples/types'
import { formatWon } from '../../../features/samples/sampleUtils'
import { SampleCostOwnerBadge, SampleStatusBadge } from './SampleBadges'
import { SampleSettlementPreview } from './SampleSettlementPreview'
import { openCampaignDetail } from '../../../shared/utils/campaignNavigation'

export function SampleDetailDrawer({ sample, onClose, onUpdate }: { sample: SampleRequest | null; onClose: () => void; onUpdate: (sample: SampleRequest) => void }) {
  if (!sample) return null
  const updateStatus = (status: SampleStatus, action: string) => onUpdate({ ...sample, status, deliveryStatus: status === '배송 중' ? '배송 중' : status === '수령 완료' ? '수령 완료' : sample.deliveryStatus, returnedAt: status === '회수 완료' ? '2026-07-15' : sample.returnedAt, settlementReflected: status === '완료' || status === '정산 반영 대기' ? true : sample.settlementReflected, activityLogs: [...sample.activityLogs, { id: crypto.randomUUID(), at: '2026.07.15 14:30', actor: '허수정', action, before: sample.status, after: status }] })
  return (
    <div className="drawer-backdrop" onClick={onClose}>
      <aside className="preview-drawer" onClick={(e) => e.stopPropagation()}>
        <div className="preview-drawer__header"><div><p className="page-eyebrow">{sample.id}</p><h2>{sample.productName}</h2></div><button className="icon-button" onClick={onClose} type="button">×</button></div>
        <div className="action-row"><SampleStatusBadge status={sample.status} /><SampleCostOwnerBadge owner={sample.costOwner} /></div>
        <dl className="preview-list">{[
          ['공동구매 일정', sample.campaignName],['셀러', sample.sellerName],['브랜드', sample.brandName],['상품과 옵션', `${sample.productName} / ${sample.optionName}`],['수량', String(sample.quantity)],['요청일', sample.requestedAt],['요청자', sample.requestedBy],['담당 매니저', sample.managerName],['발주 담당자', sample.orderManagerName],['발주 방식', sample.orderMethod],['유상·무상', sample.paymentType],['비용 부담자', sample.costOwner],['샘플 금액', formatWon(sample.sampleCost)],['배송비', formatWon(sample.shippingCost)],['송장번호', sample.trackingNumber || '-'],['발송일', sample.shippedAt || '-'],['수령일', sample.receivedAt || '-'],['회수 필요 여부', sample.returnRequired ? '필요' : '불필요'],['회수 예정일', sample.returnDueDate || '-'],['회수 완료일', sample.returnedAt || '-'],['정산 반영 여부', sample.settlementReflected ? '완료' : '대기'],['정산 반영 금액', formatWon(sample.settlementAmount)],['메모', sample.memo || '-'],['첨부', '파일 첨부 placeholder'],
        ].map(([k,v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>
        <SampleSettlementPreview sample={sample} />
        <div className="action-row">
          <button className="secondary-button" onClick={() => updateStatus('승인 대기','요청 승인')} type="button">요청 승인</button>
          <button className="secondary-button" onClick={() => updateStatus('발주 완료','발주 완료')} type="button">발주 완료</button>
          <button className="secondary-button" onClick={() => updateStatus('배송 중','배송 시작')} type="button">배송 중</button>
          <button className="secondary-button" onClick={() => updateStatus('수령 완료','수령 완료')} type="button">수령 완료</button>
          <button className="secondary-button" onClick={() => updateStatus('회수 완료','회수 완료')} type="button">회수 완료</button>
          <button className="primary-button" onClick={() => updateStatus('완료','정산 반영 완료')} type="button">정산 반영 완료</button>
          <button className="secondary-button" onClick={() => onUpdate({ ...sample, orderManagerName: '허수정', activityLogs: [...sample.activityLogs, { id: crypto.randomUUID(), at: '2026.07.15 14:30', actor: '허수정', action: '담당자 변경', before: sample.orderManagerName, after: '허수정' }] })} type="button">담당자 변경</button>
          <button className="secondary-button" onClick={() => openCampaignDetail(sample.campaignId, 'samples')} type="button">공동구매 상세 보기</button>
          <button className="secondary-button" onClick={() => updateStatus('취소','취소')} type="button">취소</button>
        </div>
        <section className="activity-log"><h3>활동 이력</h3>{sample.activityLogs.map((log) => <p key={log.id}>{log.at} · {log.actor} · {log.action} {log.before ? `${log.before} → ${log.after}` : ''}</p>)}</section>
      </aside>
    </div>
  )
}
