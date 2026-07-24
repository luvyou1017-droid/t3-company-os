import { useEffect, useState } from 'react'
import { AppLayout } from './app/layouts/AppLayout'
import { CampaignDetailPage } from './pages/campaign-detail/CampaignDetailPage'
import { CampaignSchedulePage } from './pages/campaign-schedules/CampaignSchedulePage'
import { CsManagementPage } from './pages/cs-management/CsManagementPage'
import { DashboardPage } from './pages/dashboard/DashboardPage'
import { MyWorkPage } from './pages/my-work/MyWorkPage'
import { PublicCsIntakePage } from './pages/public-cs-intake/PublicCsIntakePage'
import { SampleManagementPage } from './pages/sample-management/SampleManagementPage'
import { SalesDataPage } from './pages/sales-data/SalesDataPage'
import { SettlementPage } from './pages/settlement/SettlementPage'
import './App.css'
import type { CampaignTab } from './shared/types/campaignWorkspace'
import { csService } from './shared/services/csService'
import { sampleService } from './shared/services/sampleService'
import { salesDataService } from './shared/services/salesDataService'
import { settlementService } from './shared/services/settlementService'

export type AppPage = 'Dashboard' | 'My Work' | '공동구매 일정' | 'CS 관리' | '샘플 관리' | '판매 데이터' | '정산 관리'

function App() {
  const isPublicCsIntake = window.location.hash === '#public-cs-intake'
  const route = parseCampaignRoute()
  const [activePage, setActivePage] = useState<AppPage>(route ? '공동구매 일정' : 'Dashboard')
  const [selectedScheduleId, setSelectedScheduleId] = useState<string | null>(route?.campaignId ?? null)
  const [campaignTab, setCampaignTab] = useState<CampaignTab>(route?.tab ?? 'overview')
  const [selectedCsCaseId, setSelectedCsCaseId] = useState<string | null>(null)
  const [selectedSampleId, setSelectedSampleId] = useState<string | null>(null)
  const [selectedSalesDataImportId, setSelectedSalesDataImportId] = useState<string | null>(null)
  const [selectedSettlementId, setSelectedSettlementId] = useState<string | null>(null)

  const handleNavigate = (page: AppPage) => {
    if (window.location.pathname.startsWith('/campaigns/')) window.history.pushState({}, '', '/')
    setActivePage(page)
    setSelectedScheduleId(null)
    setSelectedCsCaseId(null)
    setSelectedSampleId(null)
    setSelectedSalesDataImportId(null)
    setSelectedSettlementId(null)
  }

  useEffect(() => {
    const handlePopState = () => {
      const nextRoute = parseCampaignRoute()
      setActivePage('공동구매 일정')
      setSelectedScheduleId(nextRoute?.campaignId ?? null)
      setCampaignTab(nextRoute?.tab ?? 'overview')
    }
    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [])

  const openCampaign = (campaignId: string, tab: CampaignTab = 'overview') => {
    window.history.pushState({}, '', `/campaigns/${encodeURIComponent(campaignId)}?tab=${tab}`)
    setActivePage('공동구매 일정')
    setSelectedScheduleId(campaignId)
    setCampaignTab(tab)
  }

  const openRelated = (targetId: string) => {
    const cs = csService.getCsCases().find((item) => item.id === targetId || item.caseNumber === targetId)
    if (cs) return openCampaign(cs.campaignId, 'cs')
    const sample = sampleService.getSamples().find((item) => item.id === targetId)
    if (sample) return openCampaign(sample.campaignId, 'samples')
    const sales = salesDataService.getSalesDataImportById(targetId)
    if (sales) return openCampaign(sales.campaignId, 'sales')
    const settlement = settlementService.getSettlementById(targetId)
    if (settlement) return openCampaign(settlement.campaignId, 'settlement')
    openCampaign(targetId, 'overview')
  }

  if (isPublicCsIntake) {
    return <PublicCsIntakePage />
  }

  return (
    <AppLayout activePage={activePage} onNavigate={handleNavigate} onOpenRelated={openRelated}>
      {activePage === 'Dashboard' && <DashboardPage />}
      {activePage === 'My Work' && <MyWorkPage />}
      {activePage === 'CS 관리' && <CsManagementPage initialCaseId={selectedCsCaseId} />}
      {activePage === '샘플 관리' && <SampleManagementPage initialSampleId={selectedSampleId} />}
      {activePage === '판매 데이터' && <SalesDataPage initialImportId={selectedSalesDataImportId} />}
      {activePage === '정산 관리' && <SettlementPage initialSettlementId={selectedSettlementId} />}
      {activePage === '공동구매 일정' && !selectedScheduleId && (
        <CampaignSchedulePage onOpenDetail={(id) => openCampaign(id)} />
      )}
      {activePage === '공동구매 일정' && selectedScheduleId && (
        <CampaignDetailPage
          initialTab={campaignTab}
          onBack={() => {
            if (window.history.state) window.history.back()
            else {
              window.history.pushState({}, '', '/')
              setSelectedScheduleId(null)
            }
          }}
          onNavigateTab={(tab) => {
            window.history.replaceState({}, '', `/campaigns/${encodeURIComponent(selectedScheduleId)}?tab=${tab}`)
            setCampaignTab(tab)
          }}
          onOpenRelated={(type, id) => {
            if (type === 'cs') { setActivePage('CS 관리'); setSelectedCsCaseId(id ?? null) }
            if (type === 'samples') { setActivePage('샘플 관리'); setSelectedSampleId(id ?? null) }
            if (type === 'sales') { setActivePage('판매 데이터'); setSelectedSalesDataImportId(id ?? null) }
            if (type === 'settlement') { setActivePage('정산 관리'); setSelectedSettlementId(id ?? null) }
          }}
          scheduleId={selectedScheduleId}
        />
      )}
    </AppLayout>
  )
}

function parseCampaignRoute(): { campaignId: string; tab: CampaignTab } | null {
  const match = window.location.pathname.match(/^\/campaigns\/([^/]+)/)
  if (!match) return null
  const requested = new URLSearchParams(window.location.search).get('tab') as CampaignTab | null
  const tabs: CampaignTab[] = ['overview','timeline','work','files','communications','samples','cs','sales','settlement','history']
  return { campaignId: decodeURIComponent(match[1]), tab: requested && tabs.includes(requested) ? requested : 'overview' }
}

export default App
