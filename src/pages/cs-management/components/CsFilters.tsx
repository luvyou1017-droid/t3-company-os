import type { CsCase } from '../../../features/cs/types'

export type CsFilter = {
  quick: string
  csType: string
  assigneeName: string
  campaignName: string
  linkOwner: string
  receivedDate: string
  search: string
}

type CsFiltersProps = {
  cases: CsCase[]
  filter: CsFilter
  onChange: (filter: CsFilter) => void
}

export function CsFilters({ cases, filter, onChange }: CsFiltersProps) {
  const update = (key: keyof CsFilter, value: string) => onChange({ ...filter, [key]: value })
  return (
    <section className="work-filters">
      <label><span>검색</span><input value={filter.search} onChange={(event) => update('search', event.target.value)} placeholder="접수번호, 고객명, 연락처, 공동구매명, 상품명" /></label>
      <label><span>상태</span><select value={filter.quick} onChange={(event) => update('quick', event.target.value)}>{['전체','신규','첨부 확인 필요','브랜드 답변 대기','고객 답변 대기','처리 중','완료','보류'].map((item) => <option key={item}>{item}</option>)}</select></label>
      <label><span>문의 유형</span><select value={filter.csType} onChange={(event) => update('csType', event.target.value)}><option value="">전체</option>{Array.from(new Set(cases.map((item) => item.csType))).map((item) => <option key={item}>{item}</option>)}</select></label>
      <label><span>담당자</span><select value={filter.assigneeName} onChange={(event) => update('assigneeName', event.target.value)}><option value="">전체</option>{Array.from(new Set(cases.map((item) => item.assigneeName))).map((item) => <option key={item}>{item}</option>)}</select></label>
      <label><span>공동구매</span><select value={filter.campaignName} onChange={(event) => update('campaignName', event.target.value)}><option value="">전체</option>{Array.from(new Set(cases.map((item) => item.campaignName))).map((item) => <option key={item}>{item}</option>)}</select></label>
      <label><span>접수 날짜</span><input type="date" value={filter.receivedDate} onChange={(event) => update('receivedDate', event.target.value)} /></label>
    </section>
  )
}
