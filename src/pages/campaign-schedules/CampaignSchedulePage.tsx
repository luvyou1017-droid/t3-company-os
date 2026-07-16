import { useMemo, useState } from 'react'
import { campaignSchedules, currentManagerName } from '../../features/campaignSchedules/mockData'
import {
  getCampaignStatus,
  getDaysBetweenCalendarDates,
  isSettlementPending,
} from '../../features/campaignSchedules/scheduleStatus'
import type {
  CampaignFilters,
  CampaignSchedule,
  CampaignViewTab,
} from '../../features/campaignSchedules/types'
import { CampaignFilters as CampaignFiltersPanel } from './components/CampaignFilters'
import { CampaignPreviewDrawer } from './components/CampaignPreviewDrawer'
import { CampaignSummary } from './components/CampaignSummary'
import { CampaignTable } from './components/CampaignTable'
import { CampaignViewTabs } from './components/CampaignViewTabs'

const initialFilters: CampaignFilters = {
  search: '',
  managerName: '',
  status: '',
  linkOwner: '',
  startDate: '',
  endDate: '',
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

type CampaignSchedulePageProps = {
  onOpenDetail: (scheduleId: string) => void
}

export function CampaignSchedulePage({ onOpenDetail }: CampaignSchedulePageProps) {
  const [activeTab, setActiveTab] = useState<CampaignViewTab>('전체')
  const [filters, setFilters] = useState<CampaignFilters>(initialFilters)
  const [selectedSchedule, setSelectedSchedule] = useState<CampaignSchedule | null>(null)
  const [notice, setNotice] = useState('')

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
    })
  }, [activeTab, filters])

  const handleCreateClick = () => {
    setNotice('새 일정 등록은 다음 단계에서 modal form으로 연결됩니다.')
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
            <p>공동구매 일정에 연결된 발주, 링크, CS, 샘플, 정산 업무를 함께 확인합니다.</p>
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
    </section>
  )
}
