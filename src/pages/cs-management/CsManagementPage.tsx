import { useEffect, useMemo, useState } from 'react'
import { csService } from '../../features/cs/services/csService'
import { notificationService } from '../../features/cs/services/notificationService'
import { workService } from '../../features/cs/services/workService'
import type { CsCase } from '../../features/cs/types'
import { CsDetailDrawer } from './components/CsDetailDrawer'
import { type CsFilter, CsFilters } from './components/CsFilters'
import { CsSummaryCards } from './components/CsSummaryCards'
import { CsTable } from './components/CsTable'

const initialFilter: CsFilter = { quick: '전체', csType: '', assigneeName: '', campaignName: '', linkOwner: '', receivedDate: '', search: '' }

type CsManagementPageProps = {
  initialCaseId?: string | null
}

export function CsManagementPage({ initialCaseId }: CsManagementPageProps) {
  const [cases, setCases] = useState<CsCase[]>(() => csService.listCases())
  const [filter, setFilter] = useState<CsFilter>(initialFilter)
  const [selectedCase, setSelectedCase] = useState<CsCase | null>(null)

  useEffect(() => {
    const nextCases = csService.listCases()
    setCases(nextCases)
    if (initialCaseId) setSelectedCase(nextCases.find((item) => item.id === initialCaseId) ?? null)
  }, [initialCaseId])

  const filteredCases = useMemo(() => {
    const search = filter.search.trim().toLowerCase()
    return cases.filter((csCase) => {
      const matchesSearch = !search || [csCase.caseNumber, csCase.customerName, csCase.customerPhone, csCase.campaignName, csCase.productName].some((value) => value.toLowerCase().includes(search))
      const quickMatch =
        filter.quick === '전체' ||
        (filter.quick === '완료' ? csCase.status === '처리 완료' : filter.quick === '첨부 확인 필요' ? csCase.attachments.some((item) => !item.verifiedAt) : filter.quick === '보류' ? csCase.status === '보류' : csCase.status === filter.quick)
      return matchesSearch && quickMatch && (!filter.csType || csCase.csType === filter.csType) && (!filter.assigneeName || csCase.assigneeName === filter.assigneeName) && (!filter.campaignName || csCase.campaignName === filter.campaignName)
    })
  }, [cases, filter])

  const updateCase = (nextCase: CsCase) => {
    csService.updateCase(nextCase)
    if (nextCase.status === '처리 완료') {
      workService.completeByCsCase(nextCase)
      notificationService.markRead(notificationService.list().find((item) => item.csCaseId === nextCase.id)?.id ?? '')
    }
    setCases(csService.listCases())
    setSelectedCase(nextCase)
  }

  return (
    <section className="campaign-schedule-page">
      <section className="schedule-summary">
        <div className="schedule-summary__title">
          <div><p className="page-eyebrow">Customer Support</p><h2>CS 관리</h2></div>
        </div>
        <CsSummaryCards cases={cases} onSelect={(quick) => setFilter({ ...filter, quick })} />
      </section>
      <section className="panel">
        <div className="panel__header"><div><h2>CS 접수 목록</h2><p>외부 고객 접수폼으로 들어온 CS를 처리합니다.</p></div><strong className="result-count">{filteredCases.length}건</strong></div>
        <div className="schedule-panel__body">
          <CsFilters cases={cases} filter={filter} onChange={setFilter} />
          <CsTable cases={filteredCases} onSelect={setSelectedCase} />
        </div>
      </section>
      <CsDetailDrawer csCase={selectedCase} onClose={() => setSelectedCase(null)} onUpdate={updateCase} />
    </section>
  )
}
