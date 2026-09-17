import { cloudSyncService } from '../../shared/services/cloudSyncService'
import { STORAGE_KEYS } from '../../shared/services/storageService'
import { useState } from 'react'
import { campaignService } from '../../shared/services/campaignService'
import { csService } from '../../shared/services/csService'
import { salesDataService } from '../../shared/services/salesDataService'
import { sampleService } from '../../shared/services/sampleService'
import { settlementService } from '../../shared/services/settlementService'
import { workService } from '../../shared/services/workService'
import type { CampaignTab } from '../../shared/types/campaignWorkspace'
import type { WorkItem } from '../../features/myWork/types'
import { CampaignDetailTabs } from './components/CampaignDetailTabs'
import { useCompanyAuth } from '../../features/auth/AuthGate'
import { canAccessCampaignTab } from '../../features/auth/pagePermissions'
import { SupabaseCampaignRepository } from '../../shared/repositories/campaignRepository'
import {
  CampaignSettlementReference, CommunicationsTab, CsTab, FilesTab, HistoryTab, OverviewTab, SalesTab,
  SamplesTab, SettlementTab, TimelineTab, WorkTab,
} from './components/CampaignWorkspaceTabs'

const validTabs: CampaignTab[] = ['overview','timeline','work','files','communications','samples','cs','sales','settlement','history']
const today = () => new Date().toISOString().slice(0, 10)
const plusDays = (days: number) => { const date = new Date(); date.setUTCDate(date.getUTCDate() + days); return date.toISOString().slice(0, 10) }
const money = (value: number) => `${Math.round(value).toLocaleString('ko-KR')}원`

function getDday(startDate: string, endDate: string) {
  const now = new Date(`${today()}T00:00:00Z`).getTime()
  const start = new Date(`${startDate}T00:00:00Z`).getTime()
  const end = new Date(`${endDate}T00:00:00Z`).getTime()
  const day = 86_400_000
  if (now < start) return `D-${Math.ceil((start - now) / day)}`
  if (now <= end) return `D+${Math.floor((now - start) / day)} 진행`
  return `종료 D+${Math.floor((now - end) / day)}`
}

function getStatus(startDate: string, endDate: string, settlementStatus?: string) {
  if (settlementStatus && !['completed', 'canceled'].includes(settlementStatus)) return '정산 중'
  if (today() < startDate) return '시작 전'
  if (today() <= endDate) return '진행 중'
  return settlementStatus === 'completed' ? '최종 완료' : '판매 종료'
}

function isTodayWork(item: WorkItem) {
  return item.status !== 'completed' && (
    item.dueDate <= plusDays(3) ||
    !item.assigneeId ||
    item.workType.includes('승인') ||
    item.status === 'blocked'
  )
}

type Props = {
  scheduleId: string
  initialTab?: CampaignTab
  onBack: () => void
  onNavigateTab?: (tab: CampaignTab) => void
  onOpenRelated?: (type: string, id?: string) => void
  onDeleted?: () => void
}

export function CampaignDetailPage({ scheduleId, initialTab = 'overview', onBack, onNavigateTab, onOpenRelated = () => undefined, onDeleted = onBack }: Props) {
  const { profile } = useCompanyAuth()
  const initialAllowedTab = validTabs.includes(initialTab) && canAccessCampaignTab(profile.role, initialTab) ? initialTab : 'overview'
  const [activeTab, setActiveTab] = useState<CampaignTab>(initialAllowedTab)
  const [, setNonce] = useState(0)
  const [editingSupply, setEditingSupply] = useState(false)
  const [vendorSupply, setVendorSupply] = useState(false)
  const [vendorName, setVendorName] = useState('')
  const [supplyError, setSupplyError] = useState('')
  const [savingSupply, setSavingSupply] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState('')
  const campaign = campaignService.getCampaignById(scheduleId)
  const refresh = () => setNonce((value) => value + 1)
  const selectTab = (tab: CampaignTab) => {
    const nextTab = canAccessCampaignTab(profile.role, tab) ? tab : 'overview'
    setActiveTab(nextTab)
    onNavigateTab?.(nextTab)
  }

  const data = (() => {
    if (!campaign) return undefined
    const works = workService.getWorkItems().filter((item) => item.campaignId === campaign.id)
    const samples = sampleService.getSamplesByCampaignId(campaign.id)
    const cs = csService.getCsCasesByCampaignId(campaign.id)
    const sales = salesDataService.getSalesDataByCampaignId(campaign.id)
    const settlement = settlementService.getSettlementByCampaignId(campaign.id)[0]
    return { works, samples, cs, sales, settlement }
  })()

  if (!campaign || !data) {
    return <section className="campaign-workspace"><div className="workspace-card workspace-empty"><h2>Campaign을 찾을 수 없습니다.</h2><p>기존 목록에서 다시 선택해주세요.</p><button className="secondary-button" onClick={onBack} type="button">목록으로</button></div></section>
  }

  const status = getStatus(campaign.startDate, campaign.endDate, data.settlement?.status)
  const completed = data.works.filter((item) => item.status === 'completed').length
  const overdue = data.works.filter((item) => item.status !== 'completed' && item.dueDate < today()).length
  const unresolvedCs = data.cs.filter((item) => item.status !== '처리 완료').length
  const salesImport = data.settlement
    ? data.sales.imports.find((item) => item.id === data.settlement?.salesDataImportId) ?? data.sales.imports[0]
    : data.sales.imports[0]
  // Once settlement has been created, its calculation snapshot is the reviewed source of truth.
  // The upload header can include a stale or supplier-side amount that should not replace it.
  const grossSales = data.settlement?.currentCalculation.grossSales ?? salesImport?.totalSalesAmount ?? 0
  const upcoming = data.works.filter((item) => item.status !== 'completed').sort((a, b) => a.dueDate.localeCompare(b.dueDate))[0]
  const todayWorks = data.works.filter(isTodayWork).sort((a, b) => a.dueDate.localeCompare(b.dueDate))
  const primary = status === '시작 전' ? '일정 준비 확인' : status === '진행 중' ? '오늘 업무 보기' : status === '정산 중' ? '정산 상세 보기' : profile.role === 'md' ? '일정 요약 보기' : '판매 데이터 확인'
  const primaryTab: CampaignTab = status === '정산 중' ? 'settlement' : status === '진행 중' || status === '시작 전' ? 'work' : profile.role === 'md' ? 'overview' : 'sales'
  const openPrimaryAction = () => {
    if (status === '정산 중' && data.settlement) {
      onOpenRelated('settlement', data.settlement.id)
      return
    }
    selectTab(primaryTab)
  }
  const canDelete = profile.role === 'ceo' || profile.role === 'admin'
  const hasOperationalData = data.samples.length > 0 || data.cs.length > 0 || data.sales.rows.length > 0 || Boolean(data.settlement)

  const deleteCampaign = async () => {
    if (hasOperationalData) {
      setDeleteError('샘플·CS·판매 내역 또는 정산이 연결된 일정은 안전을 위해 삭제할 수 없습니다. 연결 자료를 먼저 확인해주세요.')
      return
    }
    if (!window.confirm(`“${campaign.campaignName}” 일정을 삭제할까요?\n\n공용 DB에서 삭제되어 모든 직원 화면에서 사라지며, 되돌릴 수 없습니다.`)) return
    setDeleting(true)
    setDeleteError('')
    try {
      await new SupabaseCampaignRepository().deleteById(campaign.id)
      campaignService.saveCampaigns(campaignService.getCampaigns().filter((item) => item.id !== campaign.id))
      salesDataService.removeEmptyCampaignImports(campaign.id)
      workService.saveWorkItems(workService.getWorkItems().filter((item) => item.campaignId !== campaign.id))
      campaignService.saveChecklistItems(campaignService.getChecklistItems().filter((item) => item.campaignId !== campaign.id))
      onDeleted()
    } catch (error) {
      setDeleteError(`일정을 삭제하지 못했습니다. ${error instanceof Error ? error.message : ''}`.trim())
      setDeleting(false)
    }
  }

  const renderTab = () => {
    if (activeTab === 'overview') return <OverviewTab campaign={campaign} onTab={selectTab} />
    if (activeTab === 'timeline') return <TimelineTab campaign={campaign} />
    if (activeTab === 'work') return <WorkTab campaign={campaign} onChanged={refresh} />
    if (activeTab === 'files') return <FilesTab campaign={campaign} onChanged={refresh} />
    if (activeTab === 'communications') return <CommunicationsTab campaign={campaign} onChanged={refresh} />
    if (activeTab === 'samples') return <SamplesTab campaign={campaign} onExternal={onOpenRelated} />
    if (activeTab === 'cs') return <CsTab campaign={campaign} onExternal={onOpenRelated} />
    if (activeTab === 'sales') return <SalesTab campaign={campaign} onChanged={refresh} onExternal={onOpenRelated} />
    if (activeTab === 'settlement') return <div className="workspace-section-stack"><CampaignSettlementReference campaign={campaign} /><SettlementTab campaign={campaign} onExternal={onOpenRelated} /></div>
    return <HistoryTab campaign={campaign} />
  }

  return <section className="campaign-workspace">
    <header className="workspace-hero">
      <div className="workspace-breadcrumb"><button onClick={onBack} type="button">← 목록으로</button><span>{campaign.campaignCode || campaign.id}</span></div>
      {editingSupply && <section className="workspace-card"><h3>공급 대상 수정</h3><label style={{ display: 'flex', alignItems: 'center', gap: 8 }}><input type="checkbox" style={{ width: 18, height: 18, minHeight: 18 }} checked={vendorSupply} onChange={(event) => setVendorSupply(event.target.checked)} />벤더 공급</label>{vendorSupply && <label>정산 벤더명<input value={vendorName} onChange={(event) => setVendorName(event.target.value)} placeholder="예: 소셜라운지" /></label>}<p>기본은 셀러 직공급입니다. 판매 데이터나 정산이 작성된 건은 이 화면에서 공급 대상을 변경할 수 없습니다.</p>{supplyError && <p role="alert">{supplyError}</p>}<button type="button" disabled={savingSupply} onClick={async () => {
        if (vendorSupply && !vendorName.trim()) { setSupplyError('정산 벤더명을 입력해주세요.'); return }
        if (data.settlement || data.sales.rows.length || data.sales.imports.some((item) => item.reviewStatus !== '업로드 대기')) { setSupplyError('판매 데이터 또는 정산이 이미 작성되어 있습니다. 기존 정산 조건을 먼저 확인해주세요.'); return }
        setSavingSupply(true)
        try {
          const supplyAudience = vendorSupply ? 'vendor' as const : 'seller' as const
          const settlementVendorName = vendorSupply ? vendorName.trim() : undefined
          campaignService.saveCampaigns(campaignService.getCampaigns().map((item) => item.id === campaign.id ? { ...item, supplyAudience, settlementVendorName } : item))
          data.sales.imports.forEach((item) => salesDataService.updateSalesDataImport({ ...item, supplyAudience, settlementVendorName }))
          await cloudSyncService.syncKeys([STORAGE_KEYS.campaigns, STORAGE_KEYS.salesDataImports])
          setEditingSupply(false); refresh()
        } catch (error) { setSupplyError(error instanceof Error ? error.message : '저장하지 못했습니다. 다시 시도해주세요.') } finally { setSavingSupply(false) }
      }}>{savingSupply ? '저장 중…' : '저장'}</button><button type="button" disabled={savingSupply} onClick={() => setEditingSupply(false)}>닫기</button></section>}
      <div className="workspace-title-row"><div><div className="title-with-status"><h1>{campaign.campaignName || '이름 없는 Campaign'}</h1><span className={`status-badge ${status === '최종 완료' ? 'done' : status === '정산 중' ? 'settlement' : status === '진행 중' ? 'progress' : 'waiting'}`}>{status}</span></div><p>{campaign.sellerName || '-'} · {campaign.brandName || '-'} · {campaign.productName || '-'}</p></div><div className="hero-actions">{canDelete && <button className="danger-button" disabled={deleting} onClick={() => void deleteCampaign()} type="button">{deleting ? '삭제 중…' : '일정 삭제'}</button>}{canDelete && <button className="secondary-button" onClick={() => { setVendorSupply(campaign.supplyAudience === 'vendor'); setVendorName(campaign.settlementVendorName ?? ''); setSupplyError(''); setEditingSupply(true) }} type="button">공급 대상 수정</button>}<button className="secondary-button" disabled={!campaign.contact?.startsWith('http')} onClick={() => campaign.contact && window.open(campaign.contact, '_blank', 'noopener,noreferrer')} type="button">관련 링크 열기</button><button className="primary-action" onClick={openPrimaryAction} type="button">{primary}</button></div></div>
      {deleteError && <p className="campaign-delete-error" role="alert">{deleteError}</p>}
      <dl className="hero-meta"><div><dt>담당 매니저</dt><dd>{campaign.managerName || '-'}</dd></div><div><dt>MD</dt><dd>{campaign.mdName || '-'}</dd></div><div><dt>판매 기간</dt><dd>{campaign.startDate || '-'} ~ {campaign.endDate || '-'}</dd></div><div><dt>링크 주체</dt><dd>{campaign.linkOwner || '-'}</dd></div><div><dt>사업자 유형</dt><dd>{campaign.businessType || '-'}</dd></div><div><dt>마지막 수정</dt><dd>{campaign.updatedAt?.slice(0, 10) || '-'}</dd></div></dl>
    </header>

    <section aria-label="Campaign 핵심 요약" className="workspace-kpi-grid">
      <div className="workspace-kpi"><span>D-Day</span><strong>{getDday(campaign.startDate, campaign.endDate)}</strong><small>{status}</small></div>
      <div className="workspace-kpi"><span>업무 진행</span><strong>{completed} / {data.works.length}</strong><small className={overdue ? 'danger-text' : ''}>지연 {overdue}건</small></div>
      <div className="workspace-kpi"><span>CS · 샘플</span><strong>{unresolvedCs}건 · {data.samples.length}건</strong><small>{data.samples[0]?.status ?? '샘플 미등록'}</small></div>
      <div className="workspace-kpi"><span>판매 데이터</span><strong>{salesImport?.reviewStatus ?? '업로드 대기'}</strong><small>{data.settlement?.status ?? '정산 시작 전'}</small></div>
      <div className="workspace-kpi money-kpi"><span>누적 매출</span><strong>{money(grossSales)}</strong><small>부가세 포함</small></div>
      <div className="workspace-kpi next-deadline"><span>다음 마감 업무</span><strong>{upcoming?.title ?? '예정 업무 없음'}</strong><small>{upcoming ? `${upcoming.assigneeName} · ${upcoming.dueDate}` : '모든 업무를 완료했습니다.'}</small></div>
    </section>

    <section className="workspace-card today-work">
      <div className="section-heading"><div><span className="eyebrow">WORK FIRST</span><h2>이 Campaign의 오늘 해야 할 일</h2><p>오늘 마감, 기한 초과, 3일 이내, 긴급, 승인 대기 업무를 우선 표시합니다.</p></div><button className="secondary-button" onClick={() => selectTab('work')} type="button">전체 업무 보기</button></div>
      {todayWorks.length ? <div className="today-work-list">{todayWorks.slice(0, 6).map((item) => <article key={item.id}><div><span className={`status-badge ${item.dueDate < today() ? 'error' : 'progress'}`}>{item.dueDate < today() ? '기한 초과' : item.workType.includes('승인') ? '승인 대기' : '처리 필요'}</span><h3>{item.title}</h3><p>{item.assigneeName || '담당자 미배정'} · {item.dueDate} · {item.relatedMenu}</p></div><div className="button-row"><button className="text-button" onClick={() => selectTab('work')} type="button">관련 화면</button><button className="secondary-button" onClick={() => { workService.completeWorkItem(item.id, new Date().toISOString()); refresh() }} type="button">완료</button></div></article>)}</div> : <div className="workspace-empty compact"><strong>지금 바로 처리할 긴급 업무가 없습니다.</strong><p>전체 업무에서 다음 예정 업무를 확인할 수 있습니다.</p></div>}
    </section>

    <section className="workspace-tabs-shell"><CampaignDetailTabs activeTab={activeTab} onChange={selectTab} /><div className="workspace-tab-body">{renderTab()}</div></section>
  </section>
}
