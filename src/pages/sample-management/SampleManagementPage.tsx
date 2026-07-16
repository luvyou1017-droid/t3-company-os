import { useEffect, useMemo, useState } from 'react'
import { sampleService } from '../../features/samples/services/sampleService'
import type { SampleFilter, SampleRequest } from '../../features/samples/types'
import { CreateSampleModal } from './components/CreateSampleModal'
import { SampleDetailDrawer } from './components/SampleDetailDrawer'
import { SampleFilters } from './components/SampleFilters'
import { SampleSummaryCards } from './components/SampleSummaryCards'
import { SampleTable } from './components/SampleTable'

const initialFilter: SampleFilter = { quick: '전체', search: '', managerName: '', orderManagerName: '', paymentType: '', costOwner: '', startDate: '', endDate: '' }

function matchesQuick(sample: SampleRequest, quick: string) {
  if (quick === '전체') return true
  if (quick === '신규 요청') return sample.status === '요청 접수'
  if (quick === '발주 대기') return sample.status === '발주 대기' || sample.status === '승인 대기'
  if (quick === '배송 중') return sample.status === '배송 중'
  if (quick === '회수 필요') return sample.returnRequired && !sample.returnedAt
  if (quick === '정산 반영 대기') return sample.status === '정산 반영 대기'
  if (quick === '완료') return sample.status === '완료'
  return true
}

export function SampleManagementPage({ initialSampleId }: { initialSampleId?: string | null }) {
  const [samples, setSamples] = useState<SampleRequest[]>(() => sampleService.listSamples())
  const [filter, setFilter] = useState<SampleFilter>(initialFilter)
  const [selectedSample, setSelectedSample] = useState<SampleRequest | null>(null)
  const [creating, setCreating] = useState(false)

  useEffect(() => {
    const next = sampleService.listSamples()
    setSamples(next)
    if (initialSampleId) setSelectedSample(next.find((sample) => sample.id === initialSampleId) ?? null)
  }, [initialSampleId])

  const filtered = useMemo(() => {
    const search = filter.search.trim().toLowerCase()
    return samples.filter((s) => {
      const searchMatch = !search || [s.campaignName, s.sellerName, s.brandName, s.productName, s.requestedBy, s.managerName, s.orderManagerName].some((v) => v.toLowerCase().includes(search))
      return searchMatch && matchesQuick(s, filter.quick) && (!filter.managerName || s.managerName === filter.managerName) && (!filter.orderManagerName || s.orderManagerName === filter.orderManagerName) && (!filter.paymentType || s.paymentType === filter.paymentType) && (!filter.costOwner || s.costOwner === filter.costOwner)
    })
  }, [samples, filter])

  const updateSample = (sample: SampleRequest) => {
    sampleService.updateSample(sample)
    const next = sampleService.listSamples()
    setSamples(next)
    setSelectedSample(next.find((item) => item.id === sample.id) ?? sample)
  }

  const createSample = (sample: SampleRequest) => {
    sampleService.createSample(sample)
    setSamples(sampleService.listSamples())
    setCreating(false)
  }

  return (
    <section className="campaign-schedule-page">
      <section className="schedule-summary">
        <div className="schedule-summary__title"><div><p className="page-eyebrow">Sample Operations</p><h2>샘플 관리</h2></div><button className="primary-button" onClick={() => setCreating(true)} type="button">새 샘플 요청</button></div>
        <SampleSummaryCards samples={samples} onSelect={(quick) => setFilter({ ...filter, quick })} />
      </section>
      <section className="panel">
        <div className="panel__header"><div><h2>샘플 목록</h2><p>공동구매 일정에 연결된 샘플 요청, 발주, 배송, 회수, 비용 반영 상태를 관리합니다.</p></div><strong className="result-count">{filtered.length}건</strong></div>
        <div className="schedule-panel__body"><SampleFilters filter={filter} onChange={setFilter} samples={samples} /><SampleTable onSelect={setSelectedSample} samples={filtered} /></div>
      </section>
      <SampleDetailDrawer onClose={() => setSelectedSample(null)} onUpdate={updateSample} sample={selectedSample} />
      {creating && <CreateSampleModal onClose={() => setCreating(false)} onCreate={createSample} />}
    </section>
  )
}
