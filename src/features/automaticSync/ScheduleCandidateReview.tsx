import { useState } from 'react'
import type { Change } from './model'
import { candidateContext, prepareCandidate, saveCandidate, type CandidateContext } from './candidateOperations'
import { campaignReadiness, scheduleRequiredErrors } from '../../shared/utils/campaignReadiness'
import { campaignProductCatalogService } from '../../shared/services/campaignProductCatalogService'
import { campaignService } from '../../shared/services/campaignService'
import type { Campaign } from '../../shared/types/campaign'

export function ScheduleCandidateReview({ change, onApplied }: { change: Change; onApplied?: (id: string) => void }) {
  const [open, setOpen] = useState(false)
  const [candidate, setCandidate] = useState<Campaign | null>(null)
  const [context, setContext] = useState<CandidateContext | null>(null)
  const [resolved, setResolved] = useState({ seller: false, manager: false, product: false, dates: false, audience: false })
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [selectedId, setSelectedId] = useState(change.scheduleId ?? '')
  const [previousManager, setPreviousManager] = useState('')
  const [separate, setSeparate] = useState(false)
  const allCampaigns = campaignService.getCampaigns()
  async function review(asNew = false) {
    setBusy(true); setMessage('')
    try {
      const data = await candidateContext()
      const result = prepareCandidate(change, data, selectedId, asNew)
      setSeparate(asNew)
      setContext(data); setCandidate(result.candidate); setResolved(result.resolved); setPreviousManager(result.linked?.managerName ?? ''); setOpen(true)
    } catch (error) { setMessage(error instanceof Error ? error.message : '후보 조회 실패') }
    finally { setBusy(false) }
  }
  async function apply() {
    if (!candidate) return
    setBusy(true); setMessage('')
    try { await saveCandidate(change, candidate); onApplied?.(change.id); setMessage('일정 반영 완료 · 운영 DB에 저장됐습니다.'); setOpen(false) }
    catch (error) { setMessage(error instanceof Error ? error.message : '저장 실패') }
    finally { setBusy(false) }
  }
  const patch = (value: Partial<Campaign>) => setCandidate(c => c ? { ...c, ...value } : c)
  return <div><button type="button" className="secondary-button" disabled={busy} onClick={() => void review()}>{busy ? '확인 중…' : '일정 확인·반영'}</button>{change.state === '확인필요' && !change.source?.cancelled && <button type="button" className="secondary-button" disabled={busy} onClick={() => void review(true)}>별도 신규 일정 등록</button>}
    {message && <p role="status">{message}</p>}
    {change.state === '확인필요' && <label>기존 일정 연결 <select value={selectedId} onChange={e => setSelectedId(e.target.value)}><option value="">신규인지 검토</option>{allCampaigns.filter(c => !c.deletedAt && c.status !== 'settled' && (c.campaignName.includes(change.name) || change.name.includes(c.campaignName) || c.sellerName === change.source?.sellerName)).map(c => <option key={c.id} value={c.id}>{c.campaignName} · {c.startDate}~{c.endDate}</option>)}</select></label>}
    {open && candidate && context && <fieldset disabled={busy}><legend>필수 일정정보 확인</legend>
      {separate && <p>기존 일정과 다른 공구로 새 ID를 생성합니다. 기존 삭제·확정 이력과 정산 Snapshot은 유지됩니다. 아래 일정명과 판매기간이 맞는지 확인해주세요.</p>}
      <p>자동매칭된 정보는 읽기 전용입니다. 미연결 상품·SKU는 후속 업무로 확인할 수 있습니다.</p>
      <p>일정명 ✅ {candidate.campaignName}</p>
      {candidate.sellerLinkPending ? <div><label>셀러명 (Master 연결은 나중에) <input value={candidate.sellerName} onChange={e => patch({ sellerName: e.target.value })} /></label><p><strong>셀러 연결 필요</strong> · 일정부터 저장합니다. 셀러 Master는 생성하지 않으며, 공구 일정 상세에서 나중에 연결할 수 있습니다.</p></div> : resolved.seller ? <p>{candidate.sellerId ? `셀러 ✅ ${candidate.sellerName}` : `요청 대상 ✅ ${candidate.settlementVendorName}`}</p> : <label>셀러 연결 필요 <select value={candidate.sellerId} onChange={e => patch({ sellerId: e.target.value, sellerName: context.sellers.find(s => s.id === e.target.value)?.name ?? '' })}><option value="">선택 필요</option>{context.sellers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label>}
      {!candidate.sellerId && !resolved.seller && !candidate.sellerLinkPending && <label>요청 대상/벤더명 <input value={candidate.settlementVendorName ?? ''} onChange={e => patch({ settlementVendorName: e.target.value })} /></label>}
      {resolved.dates ? <p>일정 ✅ {candidate.startDate} ~ {candidate.endDate}</p> : <><label>시작일 <input type="date" value={candidate.startDate} onChange={e => patch({ startDate: e.target.value })} /></label><label>종료일 <input type="date" value={candidate.endDate} onChange={e => patch({ endDate: e.target.value })} /></label></>}
      {resolved.manager ? <p>담당매니저 ✅ {candidate.managerName}</p> : <label>담당 매니저 변경 확인{previousManager && change.source?.managerName && previousManager !== change.source.managerName ? ` · 현재 ${previousManager} → Notion ${change.source.managerName}` : ''} <select value={candidate.managerId} onChange={e => { const manager = context.managers.find(m => m.id === e.target.value); patch({ managerId: e.target.value, managerName: manager?.name ?? '' }); setResolved(current => ({ ...current, manager: Boolean(manager) })) }}><option value="">선택 필요</option>{context.managers.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}</select></label>}
      {resolved.audience ? <p>거래구분 ✅ {candidate.supplyAudience === 'vendor' ? '베벤더 공급' : '셀러 직공급'}</p> : <label>거래구분 확인 필요 <select value={candidate.supplyAudience ?? ''} onChange={e => patch({ supplyAudience: e.target.value as 'seller' | 'vendor' })}><option value="">선택 필요</option><option value="seller">셀러 직공급</option><option value="vendor">베벤더 공급</option></select></label>}
      <p>{resolved.product ? `상품 ✅ ${candidate.productName}` : candidate.productId ? 'SKU 확인 필요' : '상품 연결 필요'} · {campaignReadiness(candidate, campaignProductCatalogService.getManagedProducts()).label}</p>
      <p role="status">{scheduleRequiredErrors(candidate).join(' · ')}</p>
      <button type="button" onClick={() => setOpen(false)}>취소</button> <button type="button" className="primary-button" disabled={!resolved.manager || scheduleRequiredErrors(candidate).length > 0} onClick={() => void apply()}>{separate ? '별개 공구 확인 · 신규 등록' : candidate.sellerLinkPending ? '일정 먼저 등록 · 셀러 나중에 연결' : '확인한 일정 반영'}</button>
    </fieldset>}
  </div>
}
