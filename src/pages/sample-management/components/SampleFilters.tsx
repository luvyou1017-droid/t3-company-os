import type { SampleFilter, SampleRequest } from '../../../features/samples/types'

export function SampleFilters({ samples, filter, onChange }: { samples: SampleRequest[]; filter: SampleFilter; onChange: (filter: SampleFilter) => void }) {
  const update = (key: keyof SampleFilter, value: string) => onChange({ ...filter, [key]: value })
  return (
    <section className="work-filters">
      <label><span>검색</span><input value={filter.search} onChange={(e) => update('search', e.target.value)} placeholder="공동구매명, 셀러명, 브랜드명, 상품명, 요청자, 담당자" /></label>
      <label><span>상태</span><select value={filter.quick} onChange={(e) => update('quick', e.target.value)}>{['전체','신규 요청','발주 대기','배송 중','회수 필요','정산 반영 대기','완료'].map((v) => <option key={v}>{v}</option>)}</select></label>
      <label><span>담당 매니저</span><select value={filter.managerName} onChange={(e) => update('managerName', e.target.value)}><option value="">전체</option>{Array.from(new Set(samples.map((s) => s.managerName))).map((v) => <option key={v}>{v}</option>)}</select></label>
      <label><span>발주 담당자</span><select value={filter.orderManagerName} onChange={(e) => update('orderManagerName', e.target.value)}><option value="">전체</option>{Array.from(new Set(samples.map((s) => s.orderManagerName))).map((v) => <option key={v}>{v}</option>)}</select></label>
      <label><span>유상·무상</span><select value={filter.paymentType} onChange={(e) => update('paymentType', e.target.value)}><option value="">전체</option><option>유상</option><option>무상</option></select></label>
      <label><span>비용 부담자</span><select value={filter.costOwner} onChange={(e) => update('costOwner', e.target.value)}><option value="">전체</option>{['회사','셀러','브랜드사','매니저','미정'].map((v) => <option key={v}>{v}</option>)}</select></label>
    </section>
  )
}
