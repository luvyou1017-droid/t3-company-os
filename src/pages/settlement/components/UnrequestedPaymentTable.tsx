import { useState } from 'react'
import type { Campaign } from '../../../shared/types/campaign'
import type { Settlement } from '../../../shared/types/settlement'
import { settlementService } from '../../../shared/services/settlementService'
import { sellerMasterService } from '../../../shared/services/sellerMasterService'
import { managerPaymentService } from '../../../shared/services/managerPaymentService'
import { paymentEvidenceService } from '../../../shared/services/paymentEvidenceService'
import { formatCurrency } from '../../../shared/utils/salesData'
import { BatchPaymentRequestButton } from './BatchPaymentRequestButton'

type Recipient = { settlementId:string; ownerType:'seller'|'manager'; amount:number; rejected:boolean }
type Tab = 'seller'|'manager'|'both'
const businessLabels:Record<string,string> = { general_business:'일반과세', simplified_business:'간이과세', freelancer:'프리랜서 3.3%', tax_exempt_business:'면세사업자' }

export function UnrequestedPaymentTable({settlements,recipients,campaigns,canBatchRequest,onOpenDetail,onSaved}:{settlements:Settlement[];recipients:Recipient[];campaigns:Map<string,Campaign>;canBatchRequest:boolean;onOpenDetail:(id:string)=>void;onSaved:()=>void}) {
  const [tab,setTab]=useState<Tab>('both')
  const [selected,setSelected]=useState<string[]>([])
  const byId=new Map(settlements.map(item=>[item.id,item]))
  const rows=recipients.filter(row=>byId.has(row.settlementId) && (tab==='both' || row.ownerType===tab))
  const keys=rows.map(row=>`${row.settlementId}:${row.ownerType}`)
  const visibleSelected=selected.filter(key=>keys.includes(key))
  const toggle=(key:string)=>setSelected(current=>current.includes(key)?current.filter(item=>item!==key):[...current,key])
  return <div className="payment-recipient-view">
    <nav className="payment-recipient-tabs" aria-label="지급신청 미신청 대상">
      {([['seller','셀러 미신청'],['manager','매니저 미신청'],['both','셀러·매니저 미신청']] as const).map(([key,label])=><button type="button" key={key} className={tab===key?'is-active':''} aria-pressed={tab===key} onClick={()=>{setTab(key);setSelected([])}}>{label} ({recipients.filter(row=>byId.has(row.settlementId)&&(key==='both'||row.ownerType===key)).length})</button>)}
    </nav>
    <p className="inline-notice">정산서 확정은 공구 공통 상태입니다. 금액·사업자 유형·증빙·신청 선택은 지급 대상별로 확인하세요. 셀러 링크의 회사 수금 건은 이 목록에 포함되지 않습니다.</p>
    {canBatchRequest && <BatchPaymentRequestButton ids={[...new Set(visibleSelected.map(key=>key.split(':')[0]))]} selectedKeys={visibleSelected} onSaved={()=>{setSelected([]);onSaved()}} onOpenDetail={onOpenDetail} />}
    {!rows.length && <p className="empty-state">이 대상의 미신청 건이 없습니다.</p>}
    {!!rows.length && <div className="schedule-table-wrap payment-recipient-table"><table className="schedule-table"><thead><tr><th>{canBatchRequest && <input type="checkbox" aria-label="현재 지급 대상 전체 선택" checked={keys.length>0 && keys.every(key=>visibleSelected.includes(key))} onChange={()=>setSelected(keys.every(key=>visibleSelected.includes(key))?[]:keys)} />}</th><th>공동구매 / 지급 대상</th><th>정산서 확정 / 총매출</th><th>사업자 유형</th><th>지급 예정액</th><th>증빙 상태</th><th>신청 상태</th></tr></thead><tbody>{rows.map(row=>{
      const settlement=byId.get(row.settlementId)!
      const campaign=campaigns.get(settlement.campaignId)
      const ownerId=row.ownerType==='seller'?campaign?.sellerId:campaign?.managerId
      const profile=campaign?(row.ownerType==='seller'?sellerMasterService.getSettlementProfile(campaign.sellerId,campaign.sellerBusinessId):managerPaymentService.getProfile(campaign.managerId)):undefined
      const businessType=profile?.businessType
      const evidence=paymentEvidenceService.getEvidenceBySettlementId(settlement.id,row.ownerType).filter(item=>item.ownerId===ownerId)
      const approved=evidence.some(item=>item.reviewStatus==='approved')
      const uploaded=evidence.some(item=>['uploaded','review_pending'].includes(item.reviewStatus))
      const evidenceLabel=businessType==='freelancer'?'원천세 대상 · 상세 확인':approved?'확인 완료':uploaded?'첨부 · 검토 대기':'증빙 미첨부'
      const confirmed=settlementService.isSettlementConfirmed(settlement)
      const key=`${row.settlementId}:${row.ownerType}`
      return <tr key={key}>
        <td>{canBatchRequest && <input type="checkbox" aria-label={`${campaign?.campaignName??settlement.id} ${row.ownerType==='seller'?'셀러':'매니저'} 지급신청 선택`} checked={visibleSelected.includes(key)} onChange={()=>toggle(key)} />}</td>
        <td><button type="button" className="settlement-name-link" onClick={()=>onOpenDetail(settlement.id)}><strong>{campaign?.campaignName??settlement.campaignId}</strong><span>{row.ownerType==='seller'?'셀러':'매니저'} · {row.ownerType==='seller'?campaign?.sellerName:campaign?.managerName}</span></button></td>
        <td><strong>{confirmed?'확정 완료':'확정 필요'}</strong><br/><small>총매출 {formatCurrency(settlement.currentCalculation.grossSales)}</small></td>
        <td>{businessType?(businessLabels[businessType]??businessType):'미등록'}</td>
        <td className="amount-cell">{formatCurrency(row.amount)}</td>
        <td>{evidenceLabel}</td>
        <td>{row.rejected?'반려 · 재신청':confirmed?'지급신청 미신청':'확정 전 작성 중'}</td>
      </tr>
    })}</tbody></table></div>}
  </div>
}
