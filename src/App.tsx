import { useState } from 'react'
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

export type AppPage = 'Dashboard' | 'My Work' | '공동구매 일정' | 'CS 관리' | '샘플 관리' | '판매 데이터' | '정산 관리'

function App() {
  const isPublicCsIntake = window.location.hash === '#public-cs-intake'
  const [activePage, setActivePage] = useState<AppPage>('Dashboard')
  const [selectedScheduleId, setSelectedScheduleId] = useState<string | null>(null)
  const [selectedCsCaseId, setSelectedCsCaseId] = useState<string | null>(null)
  const [selectedSampleId, setSelectedSampleId] = useState<string | null>(null)
  const [selectedSalesDataImportId, setSelectedSalesDataImportId] = useState<string | null>(null)
  const [selectedSettlementId, setSelectedSettlementId] = useState<string | null>(null)

  const handleNavigate = (page: AppPage) => {
    setActivePage(page)
    setSelectedScheduleId(null)
    setSelectedCsCaseId(null)
    setSelectedSampleId(null)
    setSelectedSalesDataImportId(null)
    setSelectedSettlementId(null)
  }

  if (isPublicCsIntake) {
    return <PublicCsIntakePage />
  }

  return (
    <AppLayout activePage={activePage} onNavigate={handleNavigate} onOpenRelated={(targetId) => {
      if (targetId.startsWith('s-') || targetId.includes('sample')) {
        setActivePage('샘플 관리')
        setSelectedSampleId(targetId)
        return
      }
      if (targetId.startsWith('sales-')) {
        setActivePage('판매 데이터')
        setSelectedSalesDataImportId(targetId)
        return
      }
      if (targetId.startsWith('settlement-')) {
        setActivePage('정산 관리')
        setSelectedSettlementId(targetId)
        return
      }
      setActivePage('CS 관리')
      setSelectedCsCaseId(targetId)
    }}>
      {activePage === 'Dashboard' && <DashboardPage />}
      {activePage === 'My Work' && <MyWorkPage />}
      {activePage === 'CS 관리' && <CsManagementPage initialCaseId={selectedCsCaseId} />}
      {activePage === '샘플 관리' && <SampleManagementPage initialSampleId={selectedSampleId} />}
      {activePage === '판매 데이터' && <SalesDataPage initialImportId={selectedSalesDataImportId} />}
      {activePage === '정산 관리' && <SettlementPage initialSettlementId={selectedSettlementId} />}
      {activePage === '공동구매 일정' && !selectedScheduleId && (
        <CampaignSchedulePage onOpenDetail={setSelectedScheduleId} />
      )}
      {activePage === '공동구매 일정' && selectedScheduleId && (
        <CampaignDetailPage
          onBack={() => setSelectedScheduleId(null)}
          onOpenSalesData={(salesDataImportId) => {
            setActivePage('판매 데이터')
            setSelectedScheduleId(null)
            setSelectedSalesDataImportId(salesDataImportId)
          }}
          onOpenSettlement={(settlementId) => {
            setActivePage('정산 관리')
            setSelectedScheduleId(null)
            setSelectedSettlementId(settlementId)
          }}
          scheduleId={selectedScheduleId}
        />
      )}
    </AppLayout>
  )
}

export default App
