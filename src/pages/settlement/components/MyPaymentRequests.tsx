import {useEffect,useState} from 'react'
import {useCompanyAuth} from '../../../features/auth/AuthGate'
import {campaignService} from '../../../shared/services/campaignService'
import {paymentRequestService} from '../../../shared/services/paymentRequestService'
import {settlementService} from '../../../shared/services/settlementService'
import {settlementPaymentOverview} from '../../../shared/utils/settlementPaymentOverview'
import {isOwnPaymentCampaign,unrequestedForTarget} from '../../../shared/utils/paymentRequestScope'
import type {BatchRequestTarget} from '../../../shared/services/paymentBatchRequestService'
import {formatCurrency} from '../../../shared/utils/salesData'
import {BatchPaymentRequestButton} from './BatchPaymentRequestButton'

export function MyPaymentRequests({onOpenDetail,onSaved}:{onOpenDetail:(id:string)=>void;onSaved:()=>void}) {
  const {profile}=useCompanyAuth()
  const [target,setTarget]=useState<BatchRequestTarget>('seller')
  const [selected,setSelected]=useState<string[]>([])
  const [query,setQuery]=useState('')
  const [managerId,setManagerId]=useState('')
  const [,refresh]=useState(0)
  const privileged=['ceo','admin','settlement_cs'].includes(profile.role)
  const campaigns=campaignService.getCampaigns()
  const managers=[...new Map(campaigns.map(c=>[c.managerId,{id:c.managerId,name:c.managerName}])).values()].sort((a,b)=>a.name.localeCompare(b.name,'ko'))
  const scoped=campaigns.filter(c=>privileged?(managerId?c.managerId===managerId:isOwnPaymentCampaign(profile,c)):isOwnPaymentCampaign(profile,c))
  const campaignMap=new Map(scoped.map(c=>[c.id,c]))
  const settlements=settlementService.getSettlements().filter(s=>campaignMap.has(s.campaignId))
  const overview=settlementPaymentOverview(settlements,paymentRequestService.getOperationalPaymentRequests(),campaignMap)
  const recipients=unrequestedForTarget(overview.unrequested,target)
  const items=settlements.filter(s=>recipients.some(r=>r.settlementId===s.id) && (!query || `${campaignMap.get(s.campaignId)?.campaignName} ${campaignMap.get(s.campaignId)?.sellerName}`.toLowerCase().includes(query.toLowerCase())))
  useEffect(()=>setSelected([]),[target,query,managerId])
  const all=items.length>0 && items.every(s=>selected.includes(s.id))
  const toggle=(id:string)=>setSelected(ids=>ids.includes(id)?ids.filter(x=>x!==id):[...ids,id])
  return <section className="panel">
    <div className="panel__header"><div><h2>내 정산 신청</h2><p>담당 공구의 지급 미신청 건만 표시합니다. 이미 신청했거나 지급 완료된 대상은 제외합니다.</p></div>{privileged && <label>담당자<select value={managerId} onChange={e=>setManagerId(e.target.value)}><option value="">내 담당 공구</option>{managers.map(m=><option key={m.id} value={m.id}>{m.name}</option>)}</select></label>}</div>
    <nav className="settlement-view-tabs" aria-label="내 지급신청 대상">{([['seller','셀러 입금 미신청'],['manager','본인 지급 미신청'],['both','셀러 + 매니저 동시 신청']] as const).map(([value,label])=><button key={value} type="button" aria-pressed={target===value} className={target===value?'is-active':''} onClick={()=>setTarget(value)}>{label} ({new Set(unrequestedForTarget(overview.unrequested,value).map(r=>r.settlementId)).size})</button>)}</nav>
    <label>공구·셀러 검색<input value={query} onChange={e=>setQuery(e.target.value)}/></label>
    <BatchPaymentRequestButton ids={selected} fixedTarget={target} onOpenDetail={onOpenDetail} onSaved={()=>{setSelected([]);refresh(n=>n+1);onSaved()}}/>
    <label><input type="checkbox" checked={all} disabled={!items.length} onChange={()=>setSelected(all?[]:items.map(s=>s.id))}/> 현재 목록 전체 선택</label>
    <div className="responsive-table"><table><thead><tr><th>선택</th><th>공구 / 기간</th><th>미신청 지급대상</th><th>미신청 금액</th><th>정산 확인</th></tr></thead><tbody>{items.map(s=>{const c=campaignMap.get(s.campaignId);const rows=recipients.filter(r=>r.settlementId===s.id);return <tr key={s.id}><td><input type="checkbox" checked={selected.includes(s.id)} aria-label={`${c?.campaignName} 지급신청 선택`} onChange={()=>toggle(s.id)}/></td><td>{c?.campaignName}<br/>{c?.startDate} ~ {c?.endDate}</td><td>{rows.map(r=><div key={r.ownerType}>{r.ownerType==='seller'?`셀러 ${c?.sellerName}`:`매니저 ${c?.managerName}`} · {r.rejected?'반려·재신청':'미신청'}</div>)}</td><td>{rows.map(r=><div key={r.ownerType}>{r.ownerType==='seller'?'셀러':'매니저'} {formatCurrency(r.amount)}</div>)}</td><td><button className="secondary-button" type="button" onClick={()=>onOpenDetail(s.id)}>{settlementService.isSettlementConfirmed(s)?'정산 상세':'정산 확정 필요'}</button></td></tr>})}</tbody></table></div>
    {!items.length && <p className="empty-state">선택한 대상의 지급 미신청 건이 없습니다.</p>}
  </section>
}
