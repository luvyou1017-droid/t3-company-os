import { productService, normalizeProductIdentity } from '../productMaster/services/productService'
import { useState } from 'react'
import type { Change } from './model'
import { appUsers } from '../../shared/data/users'
import { campaignService } from '../../shared/services/campaignService'
import { sellerMasterService } from '../../shared/services/sellerMasterService'
import { notionCampaignMigrationService } from '../../shared/services/notionCampaignMigrationService'
import { SupabaseCampaignRepository } from '../../shared/repositories/campaignRepository'
import { cloudSyncService } from '../../shared/services/cloudSyncService'
import { STORAGE_KEYS } from '../../shared/services/storageService'
import { campaignReadiness, mergeNotionCampaign, scheduleRequiredErrors } from '../../shared/utils/campaignReadiness'
import { campaignProductCatalogService } from '../../shared/services/campaignProductCatalogService'
import type { Campaign } from '../../shared/types/campaign'

/** All channels use the same required-field gate; unresolved product/supplier is follow-up work. */
export function ScheduleCandidateReview({ change }: { change: Change }) {
  const [open, setOpen] = useState(false)
  const [candidate, setCandidate] = useState<Campaign | null>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [selectedId, setSelectedId] = useState(change.scheduleId ?? '')
  const [sellers, setSellers] = useState(sellerMasterService.listSellers())
  const allCampaigns = campaignService.getCampaigns()
  const matches = allCampaigns.filter(c => c.notionImportMetadata?.sourceId?.replace(/-/g, '') === change.id.replace(/-/g, ''))
  const protectedSource = matches.length > 1 || matches.some(c => c.deletedAt || c.status === 'settled')
  async function review() {
    if (protectedSource) { setMessage('중복 연결 또는 삭제/확정 일정입니다. 기존 자료를 유지합니다.'); return }
    const source = change.source
    if (!source) { setMessage('원본 일정 상세가 없는 이전 실행기록입니다. 다시 동기화해주세요.'); return }
    const linked = matches[0] ?? allCampaigns.find(c => c.id === selectedId)
    if (linked?.deletedAt || linked?.status === 'settled') { setMessage('삭제/확정 일정은 변경할 수 없습니다.'); return }
    const seller = sellers.find(s => s.id.replace(/-/g, '') === source.sellerId?.replace(/-/g, '') || s.name === source.sellerName)
    const manager = appUsers.find(u => u.id.replace(/-/g, '') === source.managerId?.replace(/-/g, '') || u.name === source.managerName)
    const original = { sourceId: change.id, title: source.title, startDate: source.startDate, endDate: source.endDate,
      sellerId: seller?.id ?? '', sellerName: seller?.name ?? source.sellerName,
      productId: '', productName: '', managerId: manager?.id ?? '', managerName: manager?.name ?? source.managerName,
      supplyAudience: source.supplyAudience }
    const draft = linked ?? notionCampaignMigrationService.preview([original])[0].campaign
    const next = { ...draft, campaignName: change.name, notionImportMetadata: { provider: 'notion' as const, sourceId: change.id, importedAt: new Date().toISOString() } }
    if (linked) next.id = linked.id
    next.startDate = source.startDate
    next.endDate = source.endDate
    // The existing server supplies date diffs for linked schedules. Never guess absent dates.
    for (const d of change.differences) if (['campaignName', 'startDate', 'endDate'].includes(d.label) && typeof d.after === 'string') Object.assign(next, { [d.label]: d.after })
    if (!linked) {
      next.productId = ''; next.brandId = ''; next.brandName = ''
      try {
        const products = await productService.listProducts()
        campaignProductCatalogService.registerProductMasters(products)
        const exact = products.filter(p => original && (p.id === original.productId || normalizeProductIdentity(p.productName) === normalizeProductIdentity(original.productName)))
        if (exact.length === 1) Object.assign(next, { productId: exact[0].id, productName: exact[0].productName, brandId: exact[0].brandId, brandName: exact[0].brandName,
          supplierId: next.supplierId || exact[0].vendorId, supplierName: next.supplierName || exact[0].vendorName })
      } catch { /* Optional matching failure must not block initial schedule registration. */ }
    }
    setCandidate(next); setOpen(true)
    try { setSellers(await sellerMasterService.loadSellers()) } catch { setMessage('셀러 DB 조회 실패: 기존 연결을 유지하며 누락된 필수정보는 확인해주세요.') }
  }
  async function apply() {
    if (!candidate || protectedSource) return
    setBusy(true); setMessage('')
    try {
      const errors = scheduleRequiredErrors(candidate)
      if (errors.length) throw new Error(errors.join(' · '))
      const result = await new SupabaseCampaignRepository().upsertNotionSnapshot([candidate])
      if (result.failed) throw new Error(result.errors.join(' · '))
      const saved = result.campaigns?.[0] ?? candidate
      const current = campaignService.getCampaigns()
      const existing = current.find(c => c.id === saved.id || c.notionImportMetadata?.sourceId?.replace(/-/g, '') === change.id.replace(/-/g, ''))
      campaignService.saveCampaigns(existing ? current.map(c => c.id === existing.id ? mergeNotionCampaign(c, saved) : c) : [...current, saved])
      await cloudSyncService.syncKeys([STORAGE_KEYS.campaigns])
      setMessage('일정 반영 완료 · 상품/공급처 미연결은 남은 업무에서 확인해주세요.'); setOpen(false)
    } catch (error) { setMessage(error instanceof Error ? error.message : '저장 실패') } finally { setBusy(false) }
  }
  const managers = [...new Map([...appUsers.map(u => ({ id: u.id, name: u.name })), ...campaignService.getCampaigns().map(c => ({ id: c.managerId, name: c.managerName }))].filter(m => m.id).map(m => [m.id, m])).values()]
  const patch = (value: Partial<Campaign>) => setCandidate(c => c ? { ...c, ...value } : c)
  return <div><button type="button" className="secondary-button" disabled={busy || protectedSource} onClick={() => void review()}>일정 확인·반영</button>
    {message && <p role="status">{message}</p>}
    {change.state === '확인필요' && !matches.length && <label>기존 일정 연결 (애매한 후보는 직접 선택) <select value={selectedId} onChange={e => setSelectedId(e.target.value)}><option value="">신규인지 직접 검토</option>{allCampaigns.filter(c => !c.deletedAt && c.status !== 'settled' && (c.campaignName.includes(change.name) || change.name.includes(c.campaignName) || c.sellerName === change.source?.sellerName)).map(c => <option key={c.id} value={c.id}>{c.campaignName} · {c.startDate}~{c.endDate}</option>)}</select></label>}
    {open && candidate && <fieldset disabled={busy}><legend>필수 일정정보 확인</legend>
      <p>원본 실행기록에 없는 필수정보는 직접 확인해주세요. 상품·공급처는 미연결 상태로 등록할 수 있습니다.</p>
      <label>일정명 <input value={candidate.campaignName} onChange={e => patch({ campaignName: e.target.value })} /></label>
      <label>셀러 <select value={candidate.sellerId} onChange={e => patch({ sellerId: e.target.value, sellerName: sellers.find(s => s.id === e.target.value)?.name ?? '' })}><option value="">미선택</option>{sellers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
      <label>요청 대상/벤더명 (셀러 미선택 시 필수) <input value={candidate.settlementVendorName ?? ''} onChange={e => patch({ settlementVendorName: e.target.value })} /></label>
      <label>시작일 <input type="date" value={candidate.startDate} onChange={e => patch({ startDate: e.target.value })} /></label>
      <label>종료일 <input type="date" value={candidate.endDate} onChange={e => patch({ endDate: e.target.value })} /></label>
      <label>담당 매니저 <select value={candidate.managerId} onChange={e => patch({ managerId: e.target.value, managerName: managers.find(m => m.id === e.target.value)?.name ?? '' })}><option value="">선택 필요</option>{managers.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}</select></label>
      <label>거래구분 <select value={candidate.supplyAudience ?? ''} onChange={e => patch({ supplyAudience: e.target.value as 'seller' | 'vendor' })}><option value="">선택 필요</option><option value="seller">셀러 직공급</option><option value="vendor">베벤더 공급</option></select></label>
      <p>{campaignReadiness(candidate, campaignProductCatalogService.getManagedProducts()).label}</p>
      <p role="status">{scheduleRequiredErrors(candidate).join(' · ')}</p>
      <button type="button" onClick={() => setOpen(false)}>취소</button> <button type="button" className="primary-button" disabled={scheduleRequiredErrors(candidate).length > 0} onClick={() => void apply()}>확인한 일정 반영</button>
    </fieldset>}
  </div>
}
