import type { CampaignFilters as CampaignFiltersValue, CampaignSchedule } from '../../../features/campaignSchedules/types'
import { getCampaignStatus } from '../../../features/campaignSchedules/scheduleStatus'

type CampaignFiltersProps = {
  filters: CampaignFiltersValue
  schedules: CampaignSchedule[]
  onChange: (filters: CampaignFiltersValue) => void
}

export function CampaignFilters({ filters, schedules, onChange }: CampaignFiltersProps) {
  const managerNames = Array.from(new Set(schedules.map((schedule) => schedule.managerName)))
  const statuses = Array.from(new Set(schedules.map((schedule) => getCampaignStatus(schedule))))
  const linkOwners = Array.from(new Set(schedules.map((schedule) => schedule.linkOwner)))

  const updateFilter = (key: keyof CampaignFiltersValue, value: string) => {
    onChange({ ...filters, [key]: value })
  }

  return (
    <section className="schedule-filters" aria-label="Campaign schedule filters">
      <label>
        <span>검색</span>
        <input
          onChange={(event) => updateFilter('search', event.target.value)}
          placeholder="일정명 또는 셀러명"
          type="search"
          value={filters.search}
        />
      </label>

      <label>
        <span>담당 매니저</span>
        <select onChange={(event) => updateFilter('managerName', event.target.value)} value={filters.managerName}>
          <option value="">전체</option>
          {managerNames.map((managerName) => (
            <option key={managerName} value={managerName}>
              {managerName}
            </option>
          ))}
        </select>
      </label>

      <label>
        <span>진행 상태</span>
        <select onChange={(event) => updateFilter('status', event.target.value)} value={filters.status}>
          <option value="">전체</option>
          {statuses.map((status) => (
            <option key={status} value={status}>
              {status}
            </option>
          ))}
        </select>
      </label>

      <label>
        <span>링크 주체</span>
        <select onChange={(event) => updateFilter('linkOwner', event.target.value)} value={filters.linkOwner}>
          <option value="">전체</option>
          {linkOwners.map((linkOwner) => (
            <option key={linkOwner} value={linkOwner}>
              {linkOwner}
            </option>
          ))}
        </select>
      </label>

      <label>
        <span>시작일</span>
        <input
          onChange={(event) => updateFilter('startDate', event.target.value)}
          type="date"
          value={filters.startDate}
        />
      </label>

      <label>
        <span>종료일</span>
        <input onChange={(event) => updateFilter('endDate', event.target.value)} type="date" value={filters.endDate} />
      </label>
    </section>
  )
}
