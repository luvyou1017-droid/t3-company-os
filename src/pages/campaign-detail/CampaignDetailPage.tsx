import { applyScheduleDisplayFields, scheduleDisplayFields, type ScheduleDisplayFields } from '../../shared/utils/campaignScheduleFields'
import { cloudSyncService } from '../../shared/services/cloudSyncService'
import { STORAGE_KEYS } from '../../shared/services/storageService'
import { useState } from 'react'
import { campaignService } from '../../shared/services/campaignService'
import { csService } from '../../shared/services/csService'
import { salesDataService } from '../../shared/services/salesDataService'
import { sampleService } from '../../shared/services/sampleService'
import { settlementService } from '../../shared/services/settlementService'
import { appUsers } from '../../shared/data/users'
import { workService } from '../../shared/services/workService'
import { getSalesChannelTypeLabel } from '../../shared/services/campaignCreationService'
import type { CampaignTab } from '../../shared/types/campaignWorkspace'
import type { CampaignSalesChannelType, LinkOwner } from '../../shared/types/campaign'
import type { WorkItem } from '../../features/myWork/types'
import { CampaignDetailTabs } from './components/CampaignDetailTabs'
import { useCompanyAuth } from '../../features/auth/AuthGate'
import { canAccessCampaignTab } from '../../features/auth/pagePermissions'
import { SupabaseCampaignRepository } from '../../shared/repositories/campaignRepository'
import { getDataProviderMode } from '../../shared/lib/dataProvider'
import {
  CampaignSettlementReference, CommunicationsTab, CsTab, FilesTab, HistoryTab, OverviewTab, SalesTab,
  SamplesTab, SettlementTab, TimelineTab, WorkTab,
} from './components/CampaignWorkspaceTabs'

const validTabs: CampaignTab[] = ['overview','timeline','work','files','communications','samples','cs','sales','settlement','history']
const today = () => new Date().toISOString().slice(0, 10)
const plusDays = (days: number) => { const date = new Date(); date.setUTCDate(date.getUTCDate() + days); return date.toISOString().slice(0, 10) }
const money = (value: number) => `${Math.round(value).toLocaleString('ko-KR')}원`
const linkOwnerByChannel: Record<CampaignSalesChannelType, LinkOwner> = { supplier_link: '브랜드사', wise_shop_link: '자사', seller_checkout: '셀러' }
const activePaymentRequestStatuses = ['evidence_pending', 'request_ready', 'approval_pending', 'approved', 'sent', 'on_hold']

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
  const [editingSchedule, setEditingSchedule] = useState(false)
  const [managerId, setManagerId] = useState('')
  const [settlementDueDate, setSettlementDueDate] = useState('')
  const [displayFields, setDisplayFields] = useState<ScheduleDisplayFields>({ linkOpenTime: '', linkCloseTime: '', winnerAnnouncementDate: '' })
  const [memo, setMemo] = useState('')
  const [campaignName, setCampaignName] = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [salesChannelType, setSalesChannelType] = useState<CampaignSalesChannelType>('supplier_link')
  const [vendorSupply, setVendorSupply] = useState(false)
  const [vendorName, setVendorName] = useState('')
  const [scheduleError, setScheduleError] = useState('')
  const [scheduleNotice, setScheduleNotice] = useState('')
  const [savingSchedule, setSavingSchedule] = useState(false)
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
  const managers = [...new Map([...appUsers.filter((user) => ['대표', '팀장', '매니저'].includes(user.role)), { id: campaign.managerId, name: campaign.managerName }].map((user) => [user.id, user])).values()]

  const openScheduleEditor = () => {
    setDisplayFields(scheduleDisplayFields(campaign))
    setManagerId(campaign.managerId)
    setSettlementDueDate(campaign.settlementDueDate)
    setMemo(campaign.memo ?? '')
    setCampaignName(campaign.campaignName)
    setStartDate(campaign.startDate)
    setEndDate(campaign.endDate)
    setSalesChannelType(campaign.salesChannelType ?? (campaign.linkOwner === '셀러' ? 'seller_checkout' : campaign.linkOwner === '자사' ? 'wise_shop_link' : 'supplier_link'))
    setVendorSupply(campaign.supplyAudience === 'vendor')
    setVendorName(campaign.settlementVendorName ?? '')
    setScheduleError('')
    setScheduleNotice('')
    setEditingSchedule(true)
  }

  const saveSchedule = async () => {
    if (!startDate || !endDate) { setScheduleError('판매 시작일과 종료일을 입력해주세요.'); return }
    if (startDate > endDate) { setScheduleError('판매 종료일은 시작일보다 빠를 수 없습니다.'); return }
    if (vendorSupply && !vendorName.trim()) { setScheduleError('벤더 공급인 경우 정산 벤더명을 입력해주세요.'); return }
    const channelChanged = salesChannelType !== (campaign.salesChannelType ?? (campaign.linkOwner === '셀러' ? 'seller_checkout' : campaign.linkOwner === '자사' ? 'wise_shop_link' : 'supplier_link'))
    const financialIdentityChanged = channelChanged || vendorSupply !== (campaign.supplyAudience === 'vendor') || vendorName.trim() !== (campaign.settlementVendorName ?? '')
    if (financialIdentityChanged && data.settlement && (settlementService.isSettlementConfirmed(data.settlement) || [data.settlement.sellerPaymentRequestStatus, data.settlement.managerPaymentRequestStatus].some(value => value && activePaymentRequestStatuses.includes(value)))) {
      setScheduleError('확정 또는 지급요청 중인 정산의 링크·공급 대상은 변경할 수 없습니다. 담당자와 일정은 수정할 수 있습니다.'); return
    }

    setSavingSchedule(true)
    setScheduleError('')
    setScheduleNotice('')
    try {
      const supplyAudience = vendorSupply ? 'vendor' as const : 'seller' as const
      const settlementVendorName = vendorSupply ? vendorName.trim() : undefined
      const linkOwner = linkOwnerByChannel[salesChannelType]
      const updatedAt = new Date().toISOString()
      const updatedCampaign = { ...applyScheduleDisplayFields(campaign, displayFields), campaignName: campaignName.trim() || campaign.campaignName, managerId, managerName: managers.find(item => item.id === managerId)?.name ?? campaign.managerName, startDate, endDate, settlementDueDate, settlementDueDateOverridden: settlementDueDate !== campaign.settlementDueDate || campaign.settlementDueDateOverridden, memo, linkOwner, ...(channelChanged ? { landingPageType: salesChannelType, salesChannelType, salesChannelSource: 'manual' as const, salesChannelManuallyOverridden: true } : {}), supplyAudience, settlementVendorName, updatedAt }
      if (getDataProviderMode() === 'supabase') await new SupabaseCampaignRepository().upsert(updatedCampaign)
      campaignService.saveCampaigns(campaignService.getCampaigns().map((item) => item.id === campaign.id ? updatedCampaign : item))
      await cloudSyncService.syncKeys([STORAGE_KEYS.campaigns])
      setEditingSchedule(false)
      setScheduleNotice('일정이 저장되었습니다. 기존 제안서와 정산 조건·금액은 변경하지 않았습니다.')
      refresh()
    } catch (error) {
      setScheduleError(error instanceof Error ? error.message : '저장하지 못했습니다. 다시 시도해주세요.')
    } finally {
      setSavingSchedule(false)
    }
  }

  const deleteCampaign = async () => {
    if (!window.confirm(`“${campaign.campaignName}” 일정을 휴지통으로 이동할까요? 기존 연결 자료는 유지되며 복구할 수 있습니다.`)) return
    setDeleting(true)
    setDeleteError('')
    try {
      const archived = { ...campaign, deletedAt: new Date().toISOString(), deletedBy: profile.id, updatedAt: new Date().toISOString() }
      if (getDataProviderMode() === 'supabase') await new SupabaseCampaignRepository().upsert(archived)
      campaignService.saveCampaigns(campaignService.getCampaigns().map(item => item.id === campaign.id ? archived : item))
      await cloudSyncService.syncKeys([STORAGE_KEYS.campaigns])
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
      {editingSchedule && <section className="workspace-card"><h3>일정 수정</h3><div className="inline-form"><label>공구명<input value={campaignName} onChange={event => setCampaignName(event.target.value)} /></label><label>담당 매니저<select value={managerId} onChange={event => setManagerId(event.target.value)}>{managers.map(user => <option key={user.id} value={user.id}>{user.name}</option>)}</select></label><label>정산 예정일<input type="date" value={settlementDueDate} onChange={event => setSettlementDueDate(event.target.value)} /></label><label>링크 오픈 시간<input type="time" value={displayFields.linkOpenTime} onChange={event => setDisplayFields({ ...displayFields, linkOpenTime: event.target.value })} /></label><label>링크 마감 시간<input type="time" value={displayFields.linkCloseTime} onChange={event => setDisplayFields({ ...displayFields, linkCloseTime: event.target.value })} /></label><label>당첨자 발표일<input type="date" value={displayFields.winnerAnnouncementDate} onChange={event => setDisplayFields({ ...displayFields, winnerAnnouncementDate: event.target.value })} /></label><label>메모<input value={memo} onChange={event => setMemo(event.target.value)} /></label><label>판매 시작일<input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} /></label><label>판매 종료일<input type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} /></label><label>판매 링크 유형<select value={salesChannelType} onChange={(event) => setSalesChannelType(event.target.value as CampaignSalesChannelType)}><option value="supplier_link">{getSalesChannelTypeLabel('supplier_link')} · 링크 주체 브랜드사</option><option value="wise_shop_link">{getSalesChannelTypeLabel('wise_shop_link')} · 링크 주체 자사</option><option value="seller_checkout">{getSalesChannelTypeLabel('seller_checkout')} · 링크 주체 셀러</option></select></label><label>공급 대상<select value={vendorSupply ? 'vendor' : 'seller'} onChange={(event) => setVendorSupply(event.target.value === 'vendor')}><option value="seller">셀러 직공급</option><option value="vendor">벤더 공급</option></select></label>{vendorSupply && <label>정산 벤더명<input value={vendorName} onChange={(event) => setVendorName(event.target.value)} placeholder="예: 소셜라운지" /></label>}</div><p>일정 정보만 수정합니다. 기존 제안서 Snapshot과 정산 금액·조건은 그대로 유지됩니다.</p>{scheduleError && <p className="campaign-delete-error" role="alert">{scheduleError}</p>}<div className="button-row"><button className="primary-button" type="button" disabled={savingSchedule} onClick={() => void saveSchedule()}>{savingSchedule ? '저장 중…' : '저장'}</button><button type="button" disabled={savingSchedule} onClick={() => setEditingSchedule(false)}>닫기</button></div></section>}
      <div className="workspace-title-row"><div><div className="title-with-status"><h1>{campaign.campaignName || '이름 없는 Campaign'}</h1><span className={`status-badge ${status === '최종 완료' ? 'done' : status === '정산 중' ? 'settlement' : status === '진행 중' ? 'progress' : 'waiting'}`}>{status}</span></div><p>{campaign.sellerName || '-'} · {campaign.brandName || '-'} · {campaign.productName || '-'}</p></div><div className="hero-actions">{canDelete && <button className="danger-button" disabled={deleting} onClick={() => void deleteCampaign()} type="button">{deleting ? '삭제 중…' : '일정 삭제'}</button>}{canDelete && <button className="secondary-button" onClick={openScheduleEditor} type="button">일정 수정</button>}<button className="secondary-button" disabled={!campaign.contact?.startsWith('http')} onClick={() => campaign.contact && window.open(campaign.contact, '_blank', 'noopener,noreferrer')} type="button">관련 링크 열기</button><button className="primary-action" onClick={openPrimaryAction} type="button">{primary}</button></div></div>
      {scheduleNotice && <p className="success-text" role="status">{scheduleNotice}</p>}
      {deleteError && <p className="campaign-delete-error" role="alert">{deleteError}</p>}
      <dl className="hero-meta"><div><dt>담당 매니저</dt><dd>{campaign.managerName || '-'}</dd></div><div><dt>MD</dt><dd>{campaign.mdName || '-'}</dd></div><div><dt>판매 기간</dt><dd>{campaign.startDate || '-'} ~ {campaign.endDate || '-'}</dd></div><div><dt>링크 주체</dt><dd>{campaign.linkOwner || '-'}</dd></div><div><dt>사업자 유형</dt><dd>{campaign.businessType || '-'}</dd></div><div><dt>정산 예정일</dt><dd>{campaign.settlementDueDate || '미등록'}</dd></div><div><dt>링크 오픈 시간</dt><dd>{campaign.linkOpenTime || '미등록'}</dd></div><div><dt>링크 마감 시간</dt><dd>{campaign.linkCloseTime || '미등록'}</dd></div><div><dt>당첨자 발표일</dt><dd>{campaign.winnerAnnouncementDate || '미등록'}</dd></div><div><dt>메모</dt><dd>{campaign.memo || '-'}</dd></div><div><dt>마지막 수정</dt><dd>{campaign.updatedAt?.slice(0, 10) || '-'}</dd></div></dl>
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
