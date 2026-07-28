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
import { PaymentRequestPage } from './pages/payment-request/PaymentRequestPage'
import './App.css'
import type { CampaignTab } from './shared/types/campaignWorkspace'
import { csService } from './shared/services/csService'
import { sampleService } from './shared/services/sampleService'
import { salesDataService } from './shared/services/salesDataService'
import { settlementService } from './shared/services/settlementService'
import { paymentEvidenceService } from './shared/services/paymentEvidenceService'
import { openEvidenceReviewDetail } from './shared/utils/paymentNavigation'
import { OperationalScenariosPage } from './pages/dev-tools/OperationalScenariosPage'
import { SupabasePilotPage } from './pages/dev-tools/SupabasePilotPage'
import { PreparingMasterPage } from './pages/master/PreparingMasterPage'
import { ProductFormPage } from './pages/master/products/ProductFormPage'
import { ProductListPage } from './pages/master/products/ProductListPage'
import { getCurrentProductMasterPermission } from './features/productMaster/permissions'

export type AppPage = 'Dashboard' | 'My Work' | '공동구매 일정' | 'CS 관리' | '샘플 관리' | '판매 데이터' | '정산 관리' | '지급 승인' | '셀러 마스터' | '브랜드 마스터' | '상품 마스터' | '벤더 마스터' | '가져오기/내보내기' | '운영 시나리오 테스트' | 'Supabase 파일럿 테스트'

function App() {
  const productMasterPermission = getCurrentProductMasterPermission()
  const isPublicCsIntake = window.location.hash === '#public-cs-intake'
  const route = parseCampaignRoute()
  const isPaymentRoute = window.location.pathname.startsWith('/payments')
  const masterRoute = parseMasterRoute()
  const [activePage, setActivePage] = useState<AppPage>(route || window.location.pathname === '/campaigns/new' ? '공동구매 일정' : isPaymentRoute ? '지급 승인' : masterRoute?.page ?? 'Dashboard')
  const [productId, setProductId] = useState<string | undefined>(masterRoute?.productId)
  const [paymentRouteKey, setPaymentRouteKey] = useState(0)
  const [selectedScheduleId, setSelectedScheduleId] = useState<string | null>(route?.campaignId ?? null)
  const [campaignTab, setCampaignTab] = useState<CampaignTab>(route?.tab ?? 'overview')
  const [selectedCsCaseId, setSelectedCsCaseId] = useState<string | null>(null)
  const [selectedSampleId, setSelectedSampleId] = useState<string | null>(null)
  const [selectedSalesDataImportId, setSelectedSalesDataImportId] = useState<string | null>(null)
  const [selectedSettlementId, setSelectedSettlementId] = useState<string | null>(null)

  const handleNavigate = (page: AppPage) => {
    if (window.location.pathname.startsWith('/campaigns/') || window.location.pathname.startsWith('/payments') || window.location.pathname.startsWith('/master/')) window.history.pushState({}, '', '/')
    setActivePage(page)
    setProductId(undefined)
    setSelectedScheduleId(null)
    setSelectedCsCaseId(null)
    setSelectedSampleId(null)
    setSelectedSalesDataImportId(null)
    setSelectedSettlementId(null)
    if (page === '지급 승인') window.history.pushState({ from: '/', label: '지급 요청 목록' }, '', '/payments?tab=requests')
    const masterPaths: Partial<Record<AppPage, string>> = { '셀러 마스터': '/master/sellers', '브랜드 마스터': '/master/brands', '상품 마스터': '/master/products', '벤더 마스터': '/master/vendors', '가져오기/내보내기': '/master/import-export' }
    if (masterPaths[page]) window.history.pushState({}, '', masterPaths[page])
  }

  useEffect(() => {
    const handlePopState = () => {
      const nextRoute = parseCampaignRoute()
      if (window.location.pathname.startsWith('/payments')) {
        setActivePage('지급 승인')
        setPaymentRouteKey((value) => value + 1)
      } else if (parseMasterRoute()) {
        const master = parseMasterRoute()!
        setActivePage(master.page)
        setProductId(master.productId)
      } else {
        setActivePage(nextRoute || window.location.pathname === '/campaigns/new' ? '공동구매 일정' : 'Dashboard')
        setSelectedScheduleId(nextRoute?.campaignId ?? null)
        setCampaignTab(nextRoute?.tab ?? 'overview')
      }
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
    const evidence = paymentEvidenceService.getAllEvidence().find((item) => item.id === targetId)
    if (evidence) return openEvidenceReviewDetail(evidence.id)
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
      {activePage === '지급 승인' && <PaymentRequestPage key={paymentRouteKey} />}
      {activePage === '상품 마스터' && !productId && <ProductListPage permission={productMasterPermission} onOpen={(id) => {
        const path = id ? `/master/products/${encodeURIComponent(id)}` : '/master/products/new'
        window.history.pushState({}, '', path)
        setProductId(id ?? 'new')
      }} />}
      {activePage === '상품 마스터' && productId && <ProductFormPage permission={productMasterPermission} productId={productId === 'new' ? undefined : productId} onBack={() => {
        window.history.pushState({}, '', '/master/products')
        setProductId(undefined)
      }} />}
      {activePage === '셀러 마스터' && <PreparingMasterPage title="셀러" />}
      {activePage === '브랜드 마스터' && <PreparingMasterPage title="브랜드" />}
      {activePage === '벤더 마스터' && <PreparingMasterPage title="벤더" />}
      {activePage === '가져오기/내보내기' && <PreparingMasterPage title="가져오기/내보내기" />}
      {import.meta.env.DEV && activePage === '운영 시나리오 테스트' && <OperationalScenariosPage />}
      {import.meta.env.DEV && activePage === 'Supabase 파일럿 테스트' && <SupabasePilotPage />}
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

function parseMasterRoute(): { page: AppPage; productId?: string } | null {
  const path = window.location.pathname
  if (path === '/master/products') return { page: '상품 마스터' }
  const product = path.match(/^\/master\/products\/([^/]+)$/)
  if (product) return { page: '상품 마스터', productId: decodeURIComponent(product[1]) }
  if (path === '/master/sellers') return { page: '셀러 마스터' }
  if (path === '/master/brands') return { page: '브랜드 마스터' }
  if (path === '/master/vendors') return { page: '벤더 마스터' }
  if (path === '/master/import-export') return { page: '가져오기/내보내기' }
  return null
}

function parseCampaignRoute(): { campaignId: string; tab: CampaignTab } | null {
  if (window.location.pathname === '/campaigns/new') return null
  const match = window.location.pathname.match(/^\/campaigns\/([^/]+)/)
  if (!match) return null
  const requested = new URLSearchParams(window.location.search).get('tab') as CampaignTab | null
  const tabs: CampaignTab[] = ['overview','timeline','work','files','communications','samples','cs','sales','settlement','history']
  return { campaignId: decodeURIComponent(match[1]), tab: requested && tabs.includes(requested) ? requested : 'overview' }
}

export default App
