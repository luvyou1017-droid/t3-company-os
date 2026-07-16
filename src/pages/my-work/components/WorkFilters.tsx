import type { WorkFilter, WorkItem } from '../../../features/myWork/types'

type WorkFiltersProps = {
  filter: WorkFilter
  items: WorkItem[]
  onChange: (filter: WorkFilter) => void
}

export function WorkFilters({ filter, items, onChange }: WorkFiltersProps) {
  const workTypes = Array.from(new Set(items.map((item) => item.workType)))
  const campaigns = Array.from(new Set(items.map((item) => item.campaignName)))
  const assignees = Array.from(new Set(items.map((item) => item.assigneeName)))
  const update = (key: keyof WorkFilter, value: string) => onChange({ ...filter, [key]: value })

  return (
    <section className="work-filters">
      <label>
        <span>검색</span>
        <input value={filter.search} onChange={(event) => update('search', event.target.value)} placeholder="업무명, 공동구매명, 셀러명" />
      </label>
      <label>
        <span>상태</span>
        <select value={filter.quick} onChange={(event) => update('quick', event.target.value)}>
          {['전체', '긴급', '오늘', '지연', '완료', '승인 대기', '이번 주'].map((value) => <option key={value}>{value}</option>)}
        </select>
      </label>
      <label>
        <span>업무 유형</span>
        <select value={filter.workType} onChange={(event) => update('workType', event.target.value)}>
          <option value="">전체</option>
          {workTypes.map((value) => <option key={value}>{value}</option>)}
        </select>
      </label>
      <label>
        <span>공동구매</span>
        <select value={filter.campaignName} onChange={(event) => update('campaignName', event.target.value)}>
          <option value="">전체</option>
          {campaigns.map((value) => <option key={value}>{value}</option>)}
        </select>
      </label>
      <label>
        <span>담당자</span>
        <select value={filter.assigneeName} onChange={(event) => update('assigneeName', event.target.value)}>
          <option value="">전체</option>
          {assignees.map((value) => <option key={value}>{value}</option>)}
        </select>
      </label>
      <label>
        <span>날짜</span>
        <input type="date" value={filter.date} onChange={(event) => update('date', event.target.value)} />
      </label>
    </section>
  )
}
