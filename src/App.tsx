import { lazy, Suspense, useEffect, useState } from 'react'
import { AppLayout } from './app/layouts/AppLayout'










import './App.css'
import type { CampaignTab } from './shared/types/campaignWorkspace'
import { csService } from './shared/services/csService'
import { sampleService } from './shared/services/sampleService'
import { salesDataService } from './shared/services/salesDataService'
import { settlementService } from './shared/services/settlementService'
import { paymentEvidenceService } from './shared/services/paymentEvidenceService'
import { openEvidenceReviewDetail } from './shared/utils/paymentNavigation'





import { getCurrentProductMasterPermission } from './features/productMaster/permissions'
import { canAccessInternalProductMaster, enterSellerPortal, leaveSellerPortal } from './features/productMaster/access'




import { getCurrentProposalPermission } from './features/proposalMaster/permissions'
import { AuthGate } from './features/auth/AuthGate'




import { useCompanyAuth } from './features/auth/AuthGate'
import { canAccessPage } from './features/auth/pagePermissions'


const CampaignDetailPage = lazy(() => import('./pages/campaign-detail/CampaignDetailPage').then((module) => ({ default: module.CampaignDetailPage })))
const CampaignSchedulePage = lazy(() => import('./pages/campaign-schedules/CampaignSchedulePage').then((module) => ({ default: module.CampaignSchedulePage })))
const CsManagementPage = lazy(() => import('./pages/cs-management/CsManagementPage').then((module) => ({ default: module.CsManagementPage })))
const DashboardPage = lazy(() => import('./pages/dashboard/DashboardPage').then((module) => ({ default: module.DashboardPage })))
const MyWorkPage = lazy(() => import('./pages/my-work/MyWorkPage').then((module) => ({ default: module.MyWorkPage })))
const PublicCsIntakePage = lazy(() => import('./pages/public-cs-intake/PublicCsIntakePage').then((module) => ({ default: module.PublicCsIntakePage })))
const SampleManagementPage = lazy(() => import('./pages/sample-management/SampleManagementPage').then((module) => ({ default: module.SampleManagementPage })))
const SalesDataPage = lazy(() => import('./pages/sales-data/SalesDataPage').then((module) => ({ default: module.SalesDataPage })))
const SettlementDetailPage = lazy(() => import('./pages/settlement/SettlementPage').then((module) => ({ default: module.SettlementDetailPage })))
const SettlementPage = lazy(() => import('./pages/settlement/SettlementPage').then((module) => ({ default: module.SettlementPage })))
const PaymentRequestPage = lazy(() => import('./pages/payment-request/PaymentRequestPage').then((module) => ({ default: module.PaymentRequestPage })))
const OperationalScenariosPage = lazy(() => import('./pages/dev-tools/OperationalScenariosPage').then((module) => ({ default: module.OperationalScenariosPage })))
const SupabasePilotPage = lazy(() => import('./pages/dev-tools/SupabasePilotPage').then((module) => ({ default: module.SupabasePilotPage })))
const PreparingMasterPage = lazy(() => import('./pages/master/PreparingMasterPage').then((module) => ({ default: module.PreparingMasterPage })))
const ProductFormPage = lazy(() => import('./pages/master/products/ProductFormPage').then((module) => ({ default: module.ProductFormPage })))
const ProductListPage = lazy(() => import('./pages/master/products/ProductListPage').then((module) => ({ default: module.ProductListPage })))
const SellerCatalogPage = lazy(() => import('./pages/seller-catalog/SellerCatalogPage').then((module) => ({ default: module.SellerCatalogPage })))
const ProposalListPage = lazy(() => import('./pages/master/proposals/ProposalListPage').then((module) => ({ default: module.ProposalListPage })))
const ProposalFormPage = lazy(() => import('./pages/master/proposals/ProposalFormPage').then((module) => ({ default: module.ProposalFormPage })))
const ProposalPreviewPage = lazy(() => import('./pages/master/proposals/ProposalPreviewPage').then((module) => ({ default: module.ProposalPreviewPage })))
const UserApprovalPage = lazy(() => import('./pages/user-approval/UserApprovalPage').then((module) => ({ default: module.UserApprovalPage })))
const SellerMasterPage = lazy(() => import('./pages/master/sellers/SellerMasterPage').then((module) => ({ default: module.SellerMasterPage })))
const NotionImportPage = lazy(() => import('./pages/master/NotionImportPage').then((module) => ({ default: module.NotionImportPage })))
const SupplierMasterPage = lazy(() => import('./pages/master/suppliers/SupplierMasterPage').then((module) => ({ default: module.SupplierMasterPage })))
const PartnerCatalogPage = lazy(() => import('./pages/partner-catalog/PartnerCatalogPage').then((module) => ({ default: module.PartnerCatalogPage })))

export type AppPage = 'Dashboard' | 'My Work' | '공동구매 일정' | 'CS 관리' | '샘플 관리' | '판매 데이터' | '정산 관리' | '지급 승인' | '사용자 승인' | '셀러 마스터' | '매니저 마스터' | '브랜드 마스터' | '상품 마스터' | '벤더 마스터' | '제안서 마스터' | '가져오기/내보내기' | '운영 시나리오 테스트' | 'Supabase 파일럿 테스트'

function App() {
  const sellerRoute = parseSellerRoute()
  const isPartnerCatalog = window.location.pathname === '/partner/catalog'
  const proposalRoute = parseProposalRoute()
  const productMasterPermission = getCurrentProductMasterPermission()
  const proposalPermission = getCurrentProposalPermission()
  const isPublicCsIntake = window.location.hash === '#public-cs-intake'
  const route = parseCampaignRoute()
  const settlementRoute = parseSettlementRoute()
  const isPaymentRoute = window.location.pathname.startsWith('/payments')
  const masterRoute = parseMasterRoute()
  const [activePage, setActivePage] = useState<AppPage>(window.location.pathname === '/sales-data' ? '판매 데이터' : settlementRoute ? '정산 관리' : route || window.location.pathname === '/campaigns/new' ? '공동구매 일정' : isPaymentRoute ? '지급 승인' : masterRoute?.page ?? 'Dashboard')
  const [productId, setProductId] = useState<string | undefined>(masterRoute?.productId)
  const [proposalId, setProposalId] = useState<string | undefined>(proposalRoute?.mode === 'edit' ? proposalRoute.proposalId : undefined)
  const [paymentRouteKey, setPaymentRouteKey] = useState(0)
  const [selectedScheduleId, setSelectedScheduleId] = useState<string | null>(route?.campaignId ?? null)
  const [campaignTab, setCampaignTab] = useState<CampaignTab>(route?.tab ?? 'overview')
  const [selectedCsCaseId, setSelectedCsCaseId] = useState<string | null>(null)
  const [selectedSampleId, setSelectedSampleId] = useState<string | null>(null)
  const [selectedSalesDataImportId, setSelectedSalesDataImportId] = useState<string | null>(null)
  const [salesDataEditRequested, setSalesDataEditRequested] = useState(false)
  const [selectedSettlementId, setSelectedSettlementId] = useState<string | null>(settlementRoute?.settlementId ?? null)

  const handleNavigate = (page: AppPage) => {
    if (window.location.pathname.startsWith('/campaigns/') || window.location.pathname.startsWith('/payments') || window.location.pathname.startsWith('/master/') || window.location.pathname.startsWith('/settlements')) window.history.pushState({}, '', '/')
    setActivePage(page)
    setProductId(undefined)
    setProposalId(undefined)
    setSelectedScheduleId(null)
    setSelectedCsCaseId(null)
    setSelectedSampleId(null)
    setSelectedSalesDataImportId(null)
    setSalesDataEditRequested(false)
    setSelectedSettlementId(null)
    if (page === '판매 데이터') window.history.pushState({}, '', '/sales-data')
    if (page === '정산 관리') window.history.pushState({}, '', '/settlements')
    if (page === '지급 승인') window.history.pushState({ from: '/', label: '지급 요청 목록' }, '', '/payments?tab=requests')
    const masterPaths: Partial<Record<AppPage, string>> = { '셀러 마스터': '/master/sellers', '매니저 마스터': '/master/managers', '브랜드 마스터': '/master/brands', '상품 마스터': '/master/products', '벤더 마스터': '/master/vendors', '제안서 마스터': '/master/proposals', '가져오기/내보내기': '/master/import-export' }
    if (masterPaths[page]) window.history.pushState({}, '', masterPaths[page])
  }

  useEffect(() => {
    const handlePopState = () => {
      const nextRoute = parseCampaignRoute()
      if (window.location.pathname === '/sales-data') {
        setActivePage('판매 데이터')
        setSelectedSalesDataImportId(new URLSearchParams(window.location.search).get('import'))
      } else if (window.location.pathname.startsWith('/payments')) {
        setActivePage('지급 승인')
        setPaymentRouteKey((value) => value + 1)
      } else if (parseSettlementRoute()) {
        setActivePage('정산 관리')
        setSelectedSettlementId(parseSettlementRoute()?.settlementId ?? null)
      } else if (parseMasterRoute()) {
        const master = parseMasterRoute()!
        setActivePage(master.page)
        setProductId(master.productId)
        const nextProposal = parseProposalRoute()
        setProposalId(nextProposal?.mode === 'edit' ? nextProposal.proposalId : undefined)
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
  if (sellerRoute) {
    enterSellerPortal()
    return <SellerCatalogPage productId={sellerRoute.productId} onOpen={(id) => {
      window.history.pushState({}, '', `/seller/catalog/${encodeURIComponent(id)}`)
      window.location.reload()
    }} onBackToCatalog={() => {
      window.history.pushState({}, '', '/seller/catalog')
      window.location.reload()
    }} onLeave={() => {
      leaveSellerPortal()
      window.location.assign('/')
    }} />
  }
  if (isPartnerCatalog) return <AuthGate audience="partner"><PartnerCatalogPage /></AuthGate>
  if ((masterRoute?.page === '상품 마스터' || masterRoute?.page === '제안서 마스터') && !canAccessInternalProductMaster()) {
    window.history.replaceState({}, '', '/seller/catalog')
    window.location.reload()
    return null
  }
  if (proposalRoute?.mode === 'preview') {
    if (!proposalPermission.canPreview) {
      window.location.replace('/seller/catalog')
      return null
    }
    return <ProposalPreviewPage proposalId={proposalRoute.proposalId} onBack={() => window.location.assign('/master/proposals')} />
  }

  return (
    <AuthGate>
    <AuthorizedAppContent activePage={activePage} onNavigate={handleNavigate} onOpenRelated={openRelated}>
      {activePage === 'Dashboard' && <DashboardPage onOpenCampaign={openCampaign} onViewAll={() => handleNavigate('공동구매 일정')} />}
      {activePage === 'My Work' && <MyWorkPage />}
      {activePage === 'CS 관리' && <CsManagementPage initialCaseId={selectedCsCaseId} />}
      {activePage === '샘플 관리' && <SampleManagementPage initialSampleId={selectedSampleId} />}
      {activePage === '판매 데이터' && <SalesDataPage initialEditRequested={salesDataEditRequested} initialImportId={selectedSalesDataImportId} onInitialEditOpened={() => setSalesDataEditRequested(false)} />}
      {activePage === '정산 관리' && !selectedSettlementId && <SettlementPage onOpenDetail={(id) => {
        window.history.pushState({ from: '/settlements', scrollY: window.scrollY }, '', `/settlements/${encodeURIComponent(id)}`)
        setSelectedSettlementId(id)
      }} />}
      {activePage === '정산 관리' && selectedSettlementId && <SettlementDetailPage settlementId={selectedSettlementId} onOpenSalesData={(importId, openEditor = false) => {
        setSelectedSalesDataImportId(importId)
        setSalesDataEditRequested(openEditor)
        setSelectedSettlementId(null)
        setActivePage('판매 데이터')
        window.history.pushState({}, '', '/')
      }} onBack={() => {
        if (window.history.state?.from === '/settlements') window.history.back()
        else {
          window.history.pushState({}, '', '/settlements')
          setSelectedSettlementId(null)
        }
      }} />}
      {activePage === '지급 승인' && <PaymentRequestPage key={paymentRouteKey} />}
      {activePage === '사용자 승인' && <UserApprovalPage />}
      {activePage === '상품 마스터' && !productId && <ProductListPage permission={productMasterPermission} onOpen={(id) => {
        const path = id ? `/master/products/${encodeURIComponent(id)}` : '/master/products/new'
        window.history.pushState({}, '', path)
        setProductId(id ?? 'new')
      }} />}
      {activePage === '상품 마스터' && productId && <ProductFormPage permission={productMasterPermission} productId={productId === 'new' ? undefined : productId} onBack={() => {
        const returnTo = new URLSearchParams(window.location.search).get('returnTo')
        if (returnTo?.startsWith('/campaigns/new')) {
          window.location.assign(returnTo)
        } else {
          window.history.pushState({}, '', '/master/products')
          setProductId(undefined)
        }
      }} />}
      {activePage === '셀러 마스터' && <SellerMasterPage />}
      {activePage === '브랜드 마스터' && <ProductListPage permission={productMasterPermission} onOpen={(id) => { const path = id ? `/master/products/${encodeURIComponent(id)}` : '/master/products/new'; window.history.pushState({}, '', path); setProductId(id ?? 'new'); setActivePage('상품 마스터') }} />}
      {activePage === '벤더 마스터' && <SupplierMasterPage />}
      {activePage === '제안서 마스터' && !proposalId && <ProposalListPage permission={proposalPermission} onCreate={() => {
        window.history.pushState({}, '', '/master/proposals/new')
        setProposalId('new')
      }} onEdit={(id) => {
        window.history.pushState({}, '', `/master/proposals/${encodeURIComponent(id)}/edit`)
        setProposalId(id)
      }} onPreview={(id) => window.location.assign(`/master/proposals/${encodeURIComponent(id)}/preview`)} />}
      {activePage === '제안서 마스터' && proposalId && <ProposalFormPage proposalId={proposalId === 'new' ? undefined : proposalId} permission={proposalPermission} onBack={() => {
        window.history.pushState({}, '', '/master/proposals')
        setProposalId(undefined)
      }} onPreview={(id) => window.location.assign(`/master/proposals/${encodeURIComponent(id)}/preview`)} />}
      {activePage === '매니저 마스터' && <PreparingMasterPage title="매니저" />}
      {activePage === '가져오기/내보내기' && <NotionImportPage />}
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
          onDeleted={() => {
            window.history.pushState({}, '', '/')
            setSelectedScheduleId(null)
          }}
          onOpenRelated={(type, id) => {
            if (type === 'cs') { setActivePage('CS 관리'); setSelectedCsCaseId(id ?? null) }
            if (type === 'samples') { setActivePage('샘플 관리'); setSelectedSampleId(id ?? null) }
            if (type === 'sales') { setActivePage('판매 데이터'); setSelectedSalesDataImportId(id ?? null) }
            if (type === 'settlement') {
              setActivePage('정산 관리')
              setSelectedSettlementId(id ?? null)
              window.history.pushState({}, '', id ? `/settlements/${encodeURIComponent(id)}` : '/settlements')
            }
          }}
          scheduleId={selectedScheduleId}
        />
      )}
    </AuthorizedAppContent>
    </AuthGate>
  )
}

function AuthorizedAppContent({ activePage, children, onNavigate, onOpenRelated }: {
  activePage: AppPage
  children: React.ReactNode
  onNavigate: (page: AppPage) => void
  onOpenRelated: (targetId: string) => void
}) {
  const { profile } = useCompanyAuth()

  useEffect(() => {
    if (!canAccessPage(profile.role, activePage)) onNavigate('Dashboard')
  }, [activePage, onNavigate, profile.role])

  if (!canAccessPage(profile.role, activePage)) return null
  return <AppLayout activePage={activePage} onNavigate={onNavigate} onOpenRelated={onOpenRelated}><Suspense fallback={<div className="page-loading" role="status">화면을 불러오는 중입니다…</div>}>{children}</Suspense></AppLayout>
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
  if (path === '/master/proposals') return { page: '제안서 마스터' }
  if (/^\/master\/proposals\/(?:new|[^/]+\/edit|[^/]+\/preview)$/.test(path)) return { page: '제안서 마스터' }
  if (path === '/master/managers') return { page: '매니저 마스터' }
  return null
}

function parseProposalRoute(): { mode: 'list' } | { mode: 'edit'; proposalId?: string } | { mode: 'preview'; proposalId: string } | null {
  const path = window.location.pathname
  if (path === '/master/proposals') return { mode: 'list' }
  if (path === '/master/proposals/new') return { mode: 'edit' }
  const edit = path.match(/^\/master\/proposals\/([^/]+)\/edit$/)
  if (edit) return { mode: 'edit', proposalId: decodeURIComponent(edit[1]) }
  const preview = path.match(/^\/master\/proposals\/([^/]+)\/preview$/)
  return preview ? { mode: 'preview', proposalId: decodeURIComponent(preview[1]) } : null
}

function parseSellerRoute(): { productId?: string } | null {
  if (window.location.pathname === '/seller/catalog') return {}
  const match = window.location.pathname.match(/^\/seller\/catalog\/([^/]+)$/)
  return match ? { productId: decodeURIComponent(match[1]) } : null
}

function parseCampaignRoute(): { campaignId: string; tab: CampaignTab } | null {
  if (window.location.pathname === '/campaigns/new') return null
  const match = window.location.pathname.match(/^\/campaigns\/([^/]+)/)
  if (!match) return null
  const requested = new URLSearchParams(window.location.search).get('tab') as CampaignTab | null
  const tabs: CampaignTab[] = ['overview','timeline','work','files','communications','samples','cs','sales','settlement','history']
  return { campaignId: decodeURIComponent(match[1]), tab: requested && tabs.includes(requested) ? requested : 'overview' }
}

function parseSettlementRoute(): { settlementId?: string } | null {
  if (window.location.pathname === '/settlements') return {}
  const match = window.location.pathname.match(/^\/settlements\/([^/]+)$/)
  return match ? { settlementId: decodeURIComponent(match[1]) } : null
}

export default App
