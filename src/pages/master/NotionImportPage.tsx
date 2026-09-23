import { cloudSyncService } from '../../shared/services/cloudSyncService'
import { STORAGE_KEYS } from '../../shared/services/storageService'
import { productService, normalizeProductIdentity } from '../../features/productMaster/services/productService'
import type { ProductMaster } from '../../features/productMaster/types'
import { campaignReadiness } from '../../shared/utils/campaignReadiness'
import { AutomaticSyncPanel } from '../../features/automaticSync/AutomaticSyncPanel'
import { useEffect, useMemo, useState } from 'react'
import { notionRecentCampaigns, notionRecentSellers } from '../../shared/data/notionPilot10'
import { SupabaseCampaignRepository } from '../../shared/repositories/campaignRepository'
import { campaignService } from '../../shared/services/campaignService'
import { notionCampaignMigrationService } from '../../shared/services/notionCampaignMigrationService'
import { WorkspaceDataSyncPanel } from './WorkspaceDataSyncPanel'

type ImportState = 'idle' | 'saving' | 'done' | 'error'

export function NotionImportPage() {
  const [products, setProducts] = useState<ProductMaster[]>([])
  const [audiences, setAudiences] = useState<Record<string, 'seller' | 'vendor' | ''>>({})
  const [bulkAudience, setBulkAudience] = useState<'seller' | 'vendor' | ''>('')
  useEffect(() => { void productService.listProducts().then(setProducts).catch(() => setMessage('상품 조회 실패: 일정 등록은 가능하며 상품 연결은 후속 확인이 필요합니다.')) }, [])
  const previews = useMemo(() => notionCampaignMigrationService.preview(notionRecentCampaigns.map(record => {
    const existing = campaignService.getCampaigns().find(c => c.notionImportMetadata?.sourceId?.replace(/-/g, '') === record.sourceId.replace(/-/g, ''))
    const exact = products.filter(p => p.id === record.productId || normalizeProductIdentity(p.productName) === normalizeProductIdentity(record.productName))
    const product = exact.length === 1 ? exact[0] : undefined
    return { ...record, supplyAudience: audiences[record.sourceId] || existing?.supplyAudience || bulkAudience || undefined,
      productId: existing?.productId || product?.id || '', supplierId: existing?.supplierId || record.supplierId || product?.vendorId,
      supplierName: existing?.supplierName || record.supplierName || product?.vendorName }
  })), [products, audiences, bulkAudience])
  const eligible = previews.filter(item => !item.blockingErrors.length)
  const [state, setState] = useState<ImportState>('idle')
  const [message, setMessage] = useState('')

  const importRecentCampaigns = async () => {
    setState('saving')
    setMessage('')
    try {
      const validationErrors = notionCampaignMigrationService.validate(eligible.map(item => item.source))
      if (validationErrors.length) throw new Error(validationErrors.join(', '))
      if (!eligible.length) throw new Error('필수 일정정보를 확인해주세요.')
      const result = await new SupabaseCampaignRepository().upsertNotionSnapshot(eligible.map((item) => item.campaign))
      if (result.failed) throw new Error(result.errors.join(', ') || `${result.failed}건 저장 실패`)
      campaignService.saveCampaigns(notionCampaignMigrationService.mergeCampaigns(campaignService.getCampaigns(), eligible.map(item => ({ ...item, campaign: result.campaigns?.find(c => c.notionImportMetadata?.sourceId === item.source.sourceId) ?? item.campaign }))))
      await cloudSyncService.syncKeys([STORAGE_KEYS.campaigns])
      setState('done')
      setMessage(`공동구매 일정 ${result.succeeded}건을 저장했습니다. 이제 공동구매 일정에서 확인할 수 있습니다.`)
    } catch (error) {
      setState('error')
      setMessage(error instanceof Error ? error.message : '가져오기에 실패했습니다.')
    }
  }

  return <section className="master-page notion-import-page">
    <AutomaticSyncPanel />
    <WorkspaceDataSyncPanel />
    <div className="master-page__heading"><div><p className="page-eyebrow">NOTION ACTUAL DATA IMPORT</p><h1>노션 실제 일정 가져오기</h1><p>노션 ❤️‍🔥 통합 List에서 2026년 8월 11일~9월 1일과 겹치는 실제 공구를 가져옵니다.</p></div></div>
    <div className="notion-import-summary">
      <div><span>공동구매 일정</span><strong>{previews.length}건</strong></div>
      <div><span>연결 셀러</span><strong>{notionRecentSellers.length}명</strong></div>
      <div><span>민감정보</span><strong>제외됨</strong></div>
    </div>
    <div className="notion-import-notice"><strong>안전하게 가져오는 범위</strong><p>취소된 일정 1건과 전화번호·주소·계좌번호·주민등록번호·사업자등록번호는 제외했습니다. 기존 일정과 같은 노션 ID는 새로 만들지 않고 최신 내용으로 갱신합니다.</p></div>
    <div className="notion-import-notice"><strong>일정 등록과 정산 준비는 별도입니다.</strong><p>상품·공급처 미연결은 남은 업무로 저장됩니다. 필수정보 누락은 제외됩니다. 기존 확정/삭제 일정은 유지합니다.</p><label>미등록 거래구분 일괄 확인 <select value={bulkAudience} onChange={e => setBulkAudience(e.target.value as typeof bulkAudience)}><option value="">선택 필요</option><option value="seller">셀러 직공급</option><option value="vendor">베벤더 공급</option></select></label><p>등록 가능 {eligible.length}건 / 필수정보 확인 필요 {previews.length - eligible.length}건</p></div>
    <div className="responsive-table notion-import-table"><table><thead><tr><th>No.</th><th>공동구매명</th><th>셀러</th><th>제품 / 공급처</th><th>담당</th><th>일정</th><th>거래구분 / 등록 여부 / 남은 업무</th></tr></thead><tbody>
      {previews.map((item, index) => <tr key={item.source.sourceId}><td>{index + 1}</td><td><strong>{item.source.title}</strong></td><td>{item.source.sellerName}</td><td>{item.source.productName}<small>{item.source.supplierName ?? '공급처 미연결'}</small></td><td>{item.source.managerName}</td><td>{item.source.startDate} ~ {item.source.endDate}</td><td><select aria-label={`${item.source.title} 거래구분`} value={item.campaign.supplyAudience ?? ''} onChange={e => setAudiences(current => ({ ...current, [item.source.sourceId]: e.target.value as 'seller' | 'vendor' | '' }))}><option value="">확인 필요</option><option value="seller">셀러 직공급</option><option value="vendor">베벤더 공급</option></select>{item.blockingErrors.length ? <div className="import-warning">등록 차단: {item.blockingErrors.join(', ')}</div> : <div className="import-ready">일정 등록 가능</div>}<small>{campaignReadiness(item.campaign, products).label}</small></td></tr>)}
    </tbody></table></div>
    <div className="notion-import-actions"><div>{message && <p className={`import-message is-${state}`}>{message}</p>}<small>버튼을 누르면 필수정보가 확인된 항목만 회사 Supabase에 저장됩니다. 다시 눌러도 중복 생성되지 않습니다.</small></div><button className="primary-action" disabled={state === 'saving' || state === 'done' || !eligible.length} onClick={importRecentCampaigns} type="button">{state === 'saving' ? '저장 중…' : state === 'done' ? `${eligible.length}건 저장 완료` : `${eligible.length}건 Supabase에 저장`}</button></div>
  </section>
}
