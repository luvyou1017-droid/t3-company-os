import { settlementService } from '../../shared/services/settlementService'
import { salesDataService } from '../../shared/services/salesDataService'
import { campaignSettlementStage } from '../../shared/utils/campaignSettlementStage'
import { campaignDeletionService } from '../../shared/services/campaignDeletionService'
import { useEffect, useMemo, useState } from 'react'
import { currentManagerName } from '../../features/campaignSchedules/mockData'
import {
  getCampaignStatus,
  compareCampaignSchedules,
  getDaysBetweenCalendarDates,
  isSettlementPending,
} from '../../features/campaignSchedules/scheduleStatus'
import { campaignService } from '../../shared/services/campaignService'
import { getDataProviderMode } from '../../shared/lib/dataProvider'
import { SupabaseCampaignRepository } from '../../shared/repositories/campaignRepository'
import { STORAGE_KEYS, storageService } from '../../shared/services/storageService'
import type { Campaign } from '../../shared/types/campaign'
import type {
  CampaignFilters,
  CampaignSchedule,
  CampaignViewTab,
} from '../../features/campaignSchedules/types'
import { CampaignFilters as CampaignFiltersPanel } from './components/CampaignFilters'
import { CampaignPreviewDrawer } from './components/CampaignPreviewDrawer'
import { CreateCampaignModal } from './components/CreateCampaignModal'
import { CampaignSummary } from './components/CampaignSummary'
import { CampaignTable } from './components/CampaignTable'
import { CampaignViewTabs } from './components/CampaignViewTabs'
import { useCompanyAuth } from '../../features/auth/AuthGate'
import { cloudSyncService } from '../../shared/services/cloudSyncService'
import { getCampaignSalesChannel } from '../../shared/utils/campaignSalesChannel'


const initialFilters: CampaignFilters = {
  search: '',
  managerName: '',
  status: '',
  linkOwner: '',
  startDate: '',
  endDate: '',
}

type CampaignListState = {
  activeTab: CampaignViewTab
  filters: CampaignFilters
  scrollY: number
}

function matchesViewTab(schedule: CampaignSchedule, activeTab: CampaignViewTab) {
  if (activeTab === '전체') {
    return true
  }

  if (activeTab === '내 일정') {
    return schedule.managerName === currentManagerName
  }

  if (activeTab === '발주·링크') {
    return schedule.linkReviewPending || schedule.orderPending || !schedule.landingPageCompleted
  }

  if (activeTab === 'CS') {
    return schedule.pendingCsCount > 0
  }

  if (activeTab === '샘플') {
    return schedule.pendingSampleCount > 0
  }

  if (activeTab === '정산') {
    return isSettlementPending(schedule)
  }

  return getCampaignStatus(schedule).includes('최종 완료')
}

function matchesDateRange(schedule: CampaignSchedule, filters: CampaignFilters) {
  if (filters.startDate && (!schedule.endDate || getDaysBetweenCalendarDates(filters.startDate, schedule.endDate) < 0)) {
    return false
  }

  if (filters.endDate && (!schedule.startDate || getDaysBetweenCalendarDates(schedule.startDate, filters.endDate) < 0)) {
    return false
  }

  return true
}

function toSchedule(
  campaign: Campaign,
  settlement?: ReturnType<typeof settlementService.getSettlements>[number],
  sales?: ReturnType<typeof salesDataService.getSalesDataImports>[number],
): CampaignSchedule {
  return {
    settlementStage: campaignSettlementStage(campaign, settlement, sales),
    id: campaign.id,
    campaignName: campaign.campaignName,
    sellerName: campaign.sellerName,
    brandName: campaign.brandName,
    productName: campaign.productName,
    managerName: campaign.managerName,
    mdName: campaign.mdName,
    startDate: campaign.startDate || undefined,
    endDate: campaign.endDate || undefined,
    linkOwner: campaign.linkOwner,
    landingPageType: getCampaignSalesChannel(campaign),
    landingPageCompleted: Boolean(campaign.landingPageCompleted),
    sellerBusinessType: campaign.businessType,
    pendingTaskCount: campaign.pendingTaskCount ?? 0,
    pendingCsCount: campaign.pendingCsCount ?? 0,
    pendingSampleCount: campaign.pendingSampleCount ?? 0,
    linkReviewPending: Boolean(campaign.linkReviewPending),
    orderPending: Boolean(campaign.orderPending),
    vendorSettlementCompleted: Boolean(campaign.vendorSettlementCompleted),
    settlementDocumentCompleted: Boolean(campaign.settlementDocumentCompleted),
    sellerPaymentCompleted: Boolean(campaign.sellerPaymentCompleted),
    managerPaymentCompleted: Boolean(campaign.managerPaymentCompleted),
    todayTask: campaign.todayTask ?? '',
  }
}

type CampaignSchedulePageProps = {
  onOpenDetail: (scheduleId: string) => void
}

export function CampaignSchedulePage({ onOpenDetail }: CampaignSchedulePageProps) {
  const { profile } = useCompanyAuth()
  const savedState = storageService.getItem<CampaignListState>(STORAGE_KEYS.campaignListState, { activeTab: '전체', filters: initialFilters, scrollY: 0 })
  const [activeTab, setActiveTab] = useState<CampaignViewTab>(savedState.activeTab)
  const [filters, setFilters] = useState<CampaignFilters>(savedState.filters)
  const [selectedSchedule, setSelectedSchedule] = useState<CampaignSchedule | null>(null)
  const [creating, setCreating] = useState(() => window.location.pathname === '/campaigns/new')
  const [notice, setNotice] = useState('')
  const [showTrash, setShowTrash] = useState(false)
  const [restoring, setRestoring] = useState('')
  const permanentlyDelete = async (campaign: Campaign) => {
    if (restoring || !['ceo', 'admin'].includes(profile.role)) return
    if (!window.confirm(`“${campaign.campaignName}” 일정을 완전삭제할까요? 연결 자료가 있으면 삭제되지 않습니다. 삭제 후에는 복구할 수 없습니다.`)) return
    setRestoring(campaign.id)
    try {
      await campaignDeletionService.remove(campaign.id, campaign.updatedAt)
      campaignService.saveCampaigns(campaignService.getCampaigns().filter(item => item.id !== campaign.id))
      setCampaigns(campaignService.getCampaigns())
      await cloudSyncService.syncKeys([STORAGE_KEYS.campaigns])
      setNotice('연결 없는 일정 1건을 완전삭제했습니다. 휴지통에서 복구할 수 없습니다.')
    } catch (error) { setNotice(error instanceof Error ? error.message : '연결 검사에 실패해 삭제하지 않았습니다.') }
    finally { setRestoring('') }
  }
  const restore = async (campaign: Campaign) => {
    if (restoring) return
    setRestoring(campaign.id)
    try {
      const restored = { ...campaign, deletedAt: undefined, deletedBy: undefined, updatedAt: new Date().toISOString() }
      if (getDataProviderMode() === 'supabase') await new SupabaseCampaignRepository().upsert(restored)
      campaignService.saveCampaigns(campaignService.getCampaigns().map(item => item.id === campaign.id ? restored : item))
      await cloudSyncService.syncKeys([STORAGE_KEYS.campaigns])
      setCampaigns(campaignService.getCampaigns())
      setNotice('동일한 일정 ID로 복구했습니다. 연결 자료는 유지됩니다.')
    } catch (error) { setNotice(error instanceof Error ? error.message : '복구하지 못했습니다.') }
    finally { setRestoring('') }
  }
  const [campaigns, setCampaigns] = useState<Campaign[]>(() => campaignService.getCampaigns())

  const campaignSchedules = useMemo(() => {
    const visible = campaigns.filter(item => !item.deletedAt)
    if (!visible.length) return []
    const settlements = new Map<string, ReturnType<typeof settlementService.getSettlements>[number]>()
    for (const item of settlementService.getSettlements()) {
      if (item.status !== 'canceled' && !settlements.has(item.campaignId)) settlements.set(item.campaignId, item)
    }
    const sales = new Map<string, ReturnType<typeof salesDataService.getSalesDataImports>[number]>()
    for (const item of salesDataService.getSalesDataImports()) {
      if (!sales.has(item.campaignId)) sales.set(item.campaignId, item)
    }
    return visible.map(campaign => toSchedule(campaign, settlements.get(campaign.id), sales.get(campaign.id)))
  }, [campaigns])

  useEffect(() => {
    requestAnimationFrame(() => window.scrollTo({ top: savedState.scrollY }))
  }, [])

  useEffect(() => {
    if (getDataProviderMode() !== 'supabase') return
    let active = true
    const repository = new SupabaseCampaignRepository()
    repository.list()
      .then(async (items) => {
        if (!active) return
        const sharedCampaigns = items.sort((a, b) => b.startDate.localeCompare(a.startDate))
        campaignService.saveCampaigns(sharedCampaigns)
        setCampaigns(sharedCampaigns)
      })
      .catch(() => {
        if (active) setNotice('데이터베이스 일정을 불러오지 못했습니다. 잠시 후 다시 열어주세요.')
      })
    return () => { active = false }
  }, [profile.role])

  useEffect(() => {
    const save = () => storageService.setItem(STORAGE_KEYS.campaignListState, { activeTab, filters, scrollY: window.scrollY })
    window.addEventListener('scroll', save, { passive: true })
    return () => {
      window.removeEventListener('scroll', save)
      save()
    }
  }, [activeTab, filters])

  const filteredSchedules = useMemo(() => {
    const normalizedSearch = filters.search.trim().toLowerCase()

    return campaignSchedules.filter((schedule) => {
      const status = getCampaignStatus(schedule)
      const matchesSearch =
        normalizedSearch.length === 0 ||
        schedule.campaignName.toLowerCase().includes(normalizedSearch) ||
        schedule.sellerName.toLowerCase().includes(normalizedSearch)

      return (
        matchesViewTab(schedule, activeTab) &&
        matchesSearch &&
        (!filters.managerName || schedule.managerName === filters.managerName) &&
        (!filters.status || status === filters.status) &&
        (!filters.linkOwner || schedule.linkOwner === filters.linkOwner) &&
        matchesDateRange(schedule, filters)
      )
    }).sort(compareCampaignSchedules)
  }, [activeTab, filters, campaignSchedules])

  const handleCreateClick = () => {
    setNotice('')
    window.history.pushState({}, '', '/campaigns/new')
    setCreating(true)
  }

  const handleCreated = (campaign: Campaign) => {
    setCampaigns(campaignService.getCampaigns())
    setCreating(false)
    setNotice('새 공동구매 일정이 등록되었습니다.')
    onOpenDetail(campaign.id)
  }

  return (
    <section className="campaign-schedule-page">
      <CampaignSummary schedules={campaignSchedules} onCreateClick={handleCreateClick} />

      {notice && (
        <div className="inline-notice" role="status">
          <span>{notice}</span>
          <button onClick={() => setNotice('')} type="button">
            닫기
          </button>
        </div>
      )}

      <section className="panel schedule-panel">
        <div className="panel__header">
          <div>
            <h2>일정 목록</h2>
            <p>삭제되지 않은 전체 일정을 표시합니다. 오늘 시작 → 진행 중 → 진행 예정 → 종료 순서이며 D-day는 시작일 기준입니다.</p>
          </div>
          <strong className="result-count">{filteredSchedules.length}건</strong>
        </div>

        <div className="schedule-panel__body">
          <div className="button-row"><button className={!showTrash ? 'primary-button' : 'secondary-button'} type="button" onClick={() => setShowTrash(false)}>일정 목록</button><button className={showTrash ? 'primary-button' : 'secondary-button'} type="button" onClick={() => setShowTrash(true)}>삭제된 일정 ({campaigns.filter(item => item.deletedAt).length})</button></div>
          {showTrash ? <div className="comparison-table-wrap"><p>복구 시 기존 ID와 이력을 유지합니다. 완전삭제는 운영 DB의 정산·상품·샘플·공용 이력 연결 검사 후에만 진행하며, 연결되었거나 확인할 수 없는 일정은 삭제하지 않습니다.</p><table className="comparison-table"><thead><tr><th>공구명</th><th>담당자</th><th>삭제일</th><th>복구</th></tr></thead><tbody>{campaigns.filter(item => item.deletedAt).map(item => <tr key={item.id}><td>{item.campaignName}</td><td>{item.managerName}</td><td>{item.deletedAt?.slice(0, 10)}</td><td><button type="button" className="secondary-button" disabled={Boolean(restoring) || !['ceo', 'admin'].includes(profile.role)} onClick={() => void restore(item)}>복구</button><button type="button" className="danger-button" disabled={Boolean(restoring) || !['ceo', 'admin'].includes(profile.role)} onClick={() => void permanentlyDelete(item)}>{restoring === item.id ? '확인 중…' : '완전삭제'}</button></td></tr>)}</tbody></table></div> : <>
          <CampaignViewTabs activeTab={activeTab} onChange={setActiveTab} />
          <CampaignFiltersPanel filters={filters} onChange={setFilters} schedules={campaignSchedules} />
          <CampaignTable onSelect={(schedule) => onOpenDetail(schedule.id)} schedules={filteredSchedules} /></>}
        </div>
      </section>

      <CampaignPreviewDrawer
        onClose={() => setSelectedSchedule(null)}
        onOpenDetail={(scheduleId) => {
          setSelectedSchedule(null)
          onOpenDetail(scheduleId)
        }}
        schedule={selectedSchedule}
      />

      {creating && (
        <CreateCampaignModal
          onClose={() => setCreating(false)}
          onCreated={handleCreated}
        />
      )}
    </section>
  )
}
