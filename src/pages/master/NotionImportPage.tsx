import { useMemo, useState } from 'react'
import { notionRecentCampaigns, notionRecentSellers } from '../../shared/data/notionPilot10'
import { SupabaseCampaignRepository } from '../../shared/repositories/campaignRepository'
import { campaignService } from '../../shared/services/campaignService'
import { notionCampaignMigrationService } from '../../shared/services/notionCampaignMigrationService'
import { sellerMasterService } from '../../shared/services/sellerMasterService'
import { WorkspaceDataSyncPanel } from './WorkspaceDataSyncPanel'

type ImportState = 'idle' | 'saving' | 'done' | 'error'

export function NotionImportPage() {
  const previews = useMemo(() => notionCampaignMigrationService.preview(notionRecentCampaigns, { today: '2026-09-01' }), [])
  const [state, setState] = useState<ImportState>('idle')
  const [message, setMessage] = useState('')

  const importRecentCampaigns = async () => {
    setState('saving')
    setMessage('')
    try {
      const validationErrors = notionCampaignMigrationService.validate(notionRecentCampaigns)
      if (validationErrors.length) throw new Error(validationErrors.join(', '))
      for (const seller of notionRecentSellers) await sellerMasterService.saveSellerProfile(seller)
      const result = await new SupabaseCampaignRepository().upsertNotionSnapshot(previews.map((item) => item.campaign))
      if (result.failed) throw new Error(result.errors.join(', ') || `${result.failed}건 저장 실패`)
      campaignService.saveCampaigns(notionCampaignMigrationService.mergeCampaigns(campaignService.getCampaigns(), previews))
      setState('done')
      setMessage(`셀러 ${notionRecentSellers.length}명과 실제 공동구매 일정 ${result.succeeded}건을 저장했습니다. 이제 공동구매 일정에서 확인할 수 있습니다.`)
    } catch (error) {
      setState('error')
      setMessage(error instanceof Error ? error.message : '가져오기에 실패했습니다.')
    }
  }

  return <section className="master-page notion-import-page">
    <WorkspaceDataSyncPanel />
    <div className="master-page__heading"><div><p className="page-eyebrow">NOTION ACTUAL DATA IMPORT</p><h1>노션 실제 일정 가져오기</h1><p>노션 ❤️‍🔥 통합 List에서 2026년 8월 11일~9월 1일과 겹치는 실제 공구를 가져옵니다.</p></div></div>
    <div className="notion-import-summary">
      <div><span>공동구매 일정</span><strong>{previews.length}건</strong></div>
      <div><span>연결 셀러</span><strong>{notionRecentSellers.length}명</strong></div>
      <div><span>민감정보</span><strong>제외됨</strong></div>
    </div>
    <div className="notion-import-notice"><strong>안전하게 가져오는 범위</strong><p>취소된 일정 1건과 전화번호·주소·계좌번호·주민등록번호·사업자등록번호는 제외했습니다. 기존 일정과 같은 노션 ID는 새로 만들지 않고 최신 내용으로 갱신합니다.</p></div>
    <div className="responsive-table notion-import-table"><table><thead><tr><th>No.</th><th>공동구매명</th><th>셀러</th><th>제품 / 공급처</th><th>담당</th><th>일정</th><th>확인</th></tr></thead><tbody>
      {previews.map((item, index) => <tr key={item.source.sourceId}><td>{index + 1}</td><td><strong>{item.source.title}</strong></td><td>{item.source.sellerName}</td><td>{item.source.productName}<small>{item.source.supplierName ?? '공급처 확인 필요'}</small></td><td>{item.source.managerName}</td><td>{item.source.startDate} ~ {item.source.endDate}</td><td>{item.warnings.length ? <span className="import-warning">{item.warnings.join(', ')}</span> : <span className="import-ready">준비 완료</span>}</td></tr>)}
    </tbody></table></div>
    <div className="notion-import-actions"><div>{message && <p className={`import-message is-${state}`}>{message}</p>}<small>버튼을 누르면 위 항목이 회사 Supabase에 저장됩니다. 다시 눌러도 중복 생성되지 않습니다.</small></div><button className="primary-action" disabled={state === 'saving' || state === 'done'} onClick={importRecentCampaigns} type="button">{state === 'saving' ? '저장 중…' : state === 'done' ? `${previews.length}건 저장 완료` : `${previews.length}건 Supabase에 저장`}</button></div>
  </section>
}
