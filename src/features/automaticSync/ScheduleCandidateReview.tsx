import { useState } from 'react'
import type { Change } from './model'
import { candidateContext, prepareCandidate, saveCandidate, type CandidateContext } from './candidateOperations'
import { campaignReadiness, scheduleRequiredErrors } from '../../shared/utils/campaignReadiness'
import { campaignProductCatalogService } from '../../shared/services/campaignProductCatalogService'
import { campaignService } from '../../shared/services/campaignService'
import type { Campaign } from '../../shared/types/campaign'

export function ScheduleCandidateReview({ change }: { change: Change }) {
  const [open, setOpen] = useState(false)
  const [candidate, setCandidate] = useState<Campaign | null>(null)
  const [context, setContext] = useState<CandidateContext | null>(null)
  const [resolved, setResolved] = useState({ seller: false, manager: false, product: false, dates: false, audience: false })
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [selectedId, setSelectedId] = useState(change.scheduleId ?? '')
  const allCampaigns = campaignService.getCampaigns()
  async function review() {
    setBusy(true); setMessage('')
    try {
      const data = await candidateContext()
      const result = prepareCandidate(change, data, selectedId)
      setContext(data); setCandidate(result.candidate); setResolved(result.resolved); setOpen(true)
    } catch (error) { setMessage(error instanceof Error ? error.message : '후보 조회 실패') }
    finally { setBusy(false) }
  }
  async function apply() {
    if (!candidate) return
    setBusy(true); setMessage('')
    try { await saveCandidate(change, candidate); setMessage('일정 반영 완료'); setOpen(false) }
    catch (error) { setMessage(error instanceof Error ? error.message : '저장 실패') }
    finally { setBusy(false) }
  }
  const patch = (value: Partial<Campaign>) => setCandidate(c => c ? { ...c, ...value } : c)
  return <div><button type="button" className="secondary-button" disabled={busy} onClick={() => void review()}>{busy ? '확인 중…' : '일정 확인·반영'}</button>
    {message && <p role="status">{message}</p>}
    {change.state === '확인필요' && <label>기존 일정 연결 <select value={selectedId} onChange={e => setSelectedId(e.target.value)}><option value="">신규인지 검토</option>{allCampaigns.filter(c => !c.deletedAt && c.status !== 'settled' && (c.campaignName.includes(change.name) || change.name.includes(c.campaignName) || c.sellerName === change.source?.sellerName)).map(c => <option key={c.id} value={c.id}>{c.campaignName} · {c.startDate}~{c.endDate}</option>)}</select></label>}
    {open && candidate && context && <fieldset disabled={busy}><legend>필수 일정정보 확인</legend>
      <p>자동매칭된 정보는 읽기 전용입니다. 미연결 상품·SKU는 후속 업무로 확인할 수 있습니다.</p>
      <p>일정명 ✅ {candidate.campaignName}</p>
      {resolved.seller ? <p>셀러 ✅ {candidate.sellerName}</p> : <label>셀러 연결 필요 <select value={candidate.sellerId} onChange={e => patch({ sellerId: e.target.value, sellerName: context.sellers.find(s => s.id === e.target.value)?.name ?? '' })}><option value="">선택 필요</option>{context.sellers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label>}
      {!candidate.sellerId && <label>요청 대상/벤더명 <input value={candidate.settlementVendorName ?? ''} onChange={e => patch({ settlementVendorName: e.target.value })} /></label>}
      {resolved.dates ? <p>일정 ✅ {candidate.startDate} ~ {candidate.endDate}</p> : <><label>시작일 <input type="date" value={candidate.startDate} onChange={e => patch({ startDate: e.target.value })} /></label><label>종료일 <input type="date" value={candidate.endDate} onChange={e => patch({ endDate: e.target.value })} /></label></>}
      {resolved.manager ? <p>담당매니저 ✅ {candidate.managerName}</p> : <label>담당 매니저 확인 필요 <select value={candidate.managerId} onChange={e => patch({ managerId: e.target.value, managerName: context.managers.find(m => m.id === e.target.value)?.name ?? '' })}><option value="">선택 필요</option>{context.managers.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}</select></label>}
      {resolved.audience ? <p>거래구분 ✅ {candidate.supplyAudience === 'vendor' ? '베벤더 공급' : '셀러 직공급'}</p> : <label>거래구분 확인 필요 <select value={candidate.supplyAudience ?? ''} onChange={e => patch({ supplyAudience: e.target.value as 'seller' | 'vendor' })}><option value="">선택 필요</option><option value="seller">셀러 직공급</option><option value="vendor">베벤더 공급</option></select></label>}
      <p>{resolved.product ? `상품 ✅ ${candidate.productName}` : candidate.productId ? 'SKU 확인 필요' : '상품 연결 필요'} · {campaignReadiness(candidate, campaignProductCatalogService.getManagedProducts()).label}</p>
      <p role="status">{scheduleRequiredErrors(candidate).join(' · ')}</p>
      <button type="button" onClick={() => setOpen(false)}>취소</button> <button type="button" className="primary-button" disabled={scheduleRequiredErrors(candidate).length > 0} onClick={() => void apply()}>확인한 일정 반영</button>
    </fieldset>}
  </div>
}
