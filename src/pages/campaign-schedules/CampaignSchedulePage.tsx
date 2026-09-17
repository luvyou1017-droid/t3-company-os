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
import { salesDataService } from '../../shared/services/salesDataService'
import { cloudSyncService } from '../../shared/services/cloudSyncService'

const CAMPAIGN_RETENTION_START = '2026-08-01'

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

function toSchedule(campaign: Campaign): CampaignSchedule {
  return {
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
    landingPageType: campaign.landingPageType ?? campaign.salesChannelType,
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
  const [campaigns, setCampaigns] = useState<Campaign[]>(() => campaignService.getCampaigns())

  const campaignSchedules = useMemo(() => campaigns.map(toSchedule), [campaigns])

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
        const obsolete = items.filter((item) => item.startDate && item.startDate < CAMPAIGN_RETENTION_START)
        const canApplyRetention = profile.role === 'ceo' || profile.role === 'admin'
        if (obsolete.length && canApplyRetention) {
          await repository.deleteBeforeStartDate(CAMPAIGN_RETENTION_START)
          if (!active) return
          const obsoleteIds = new Set(obsolete.map((item) => item.id))
          campaignService.saveCampaigns(campaignService.getCampaigns().filter((item) => !obsoleteIds.has(item.id)))
          const removedSalesSlots = salesDataService.removeEmptyCampaignImportsMany(obsoleteIds)
          await cloudSyncService.syncKeys([STORAGE_KEYS.campaigns, STORAGE_KEYS.salesDataImports, STORAGE_KEYS.salesDataRows])
          if (!active) return
          setNotice(`8월 이전 공구 일정 ${obsolete.length}건과 연결된 빈 판매 데이터 ${removedSalesSlots}건을 공용 DB에서 정리했습니다.`)
        }
        const sharedCampaigns = items
          .filter((item) => !item.startDate || item.startDate >= CAMPAIGN_RETENTION_START)
          .sort((a, b) => b.startDate.localeCompare(a.startDate))
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
  }, [activeTab, filters])

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
            <p>8월 1일 이후 전체 일정을 표시합니다. 오늘 시작 → 진행 중 → 진행 예정 → 종료 순서이며 D-day는 시작일 기준입니다.</p>
          </div>
          <strong className="result-count">{filteredSchedules.length}건</strong>
        </div>

        <div className="schedule-panel__body">
          <CampaignViewTabs activeTab={activeTab} onChange={setActiveTab} />
          <CampaignFiltersPanel filters={filters} onChange={setFilters} schedules={campaignSchedules} />
          <CampaignTable onSelect={(schedule) => onOpenDetail(schedule.id)} schedules={filteredSchedules} />
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
