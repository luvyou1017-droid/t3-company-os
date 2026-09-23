import { getTodayInSeoul, getDaysBetweenCalendarDates } from '../../features/campaignSchedules/scheduleStatus'
import { salesSourceLabel } from '../../shared/utils/salesSourceLabel'
import { NumericInput } from '../../shared/components/NumericInput'
import { paymentRequestService } from '../../shared/services/paymentRequestService'
import { useUploadDraft } from '../../shared/utils/useUploadDraft'
import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import { campaignService } from '../../shared/services/campaignService'
import { getDataProviderMode } from '../../shared/lib/dataProvider'
import { SupabaseCampaignRepository } from '../../shared/repositories/campaignRepository'
import { salesDataService } from '../../shared/services/salesDataService'
import { settlementService } from '../../shared/services/settlementService'
import { cloudSyncService } from '../../shared/services/cloudSyncService'
import { STORAGE_KEYS, storageService } from '../../shared/services/storageService'
import { UploadConditionsReview } from './UploadConditionsReview'
import { authorLabels, campaignChannel, channelLabels, documentKindLabels, getUploadConditions, captureUploadTerms, applyReviewedUpload } from '../../shared/utils/uploadSettlementConditions'
import type { SettlementDocumentAuthor, SettlementDocumentKind, SettlementSkuCondition } from '../../shared/types/settlementTerms'
import type { CampaignSalesChannelType } from '../../shared/types/campaign'
import { SalesColumnReview } from './SalesColumnReview'
import { inspectSalesWorkbook, findLearnedRule, headerSignature, mapSalesSheet, type ColumnMap, type ColumnRule, type SheetSample } from '../../shared/utils/salesColumnLearning'
import { createSkuFromSalesRow, manuallyMatchSalesRow, PRODUCT_COMMISSION_SYNC_VERSION, syncProductCommissionRates } from '../../shared/services/productCommissionSyncService'
import { productService } from '../../features/productMaster/services/productService'
import type { ProductMaster } from '../../features/productMaster/types'
import type { CommissionSyncIssue, CommissionSyncSuggestion, SalesEventCost } from '../../shared/types/salesData'
import type { SalesDataImport, SalesDataRow, SalesReviewStatus, SalesSettlementStatus } from '../../shared/types/salesData'
import { buildSalesAnalysis, calculateSalesRow, calculateSalesTotals, formatCurrency, formatFileSize, validateSalesRows } from '../../shared/utils/salesData'
import { getSalesEventCosts, getSalesEventCostTotal } from '../../shared/utils/salesEventCosts'
import { parseSalesDataFile, shouldAskPendingPaymentPolicy, UnmatchedSalesPricesError } from '../../shared/utils/salesDataFileParser'
import { openCampaignDetail } from '../../shared/utils/campaignNavigation'
import { calculateSrookPayFee, DEFAULT_SROOKPAY_FEE_RATE } from '../../shared/utils/srookPay'
import { manualCommissionComparison } from '../../shared/utils/manualSettlement'
import { normalizeProductMatchText } from '../../shared/utils/productSkuMatching'
import { LandingPageBadge } from '../../shared/components/LandingPageBadge'
import { sellerSettlementFileService } from '../../shared/services/sellerSettlementFileService'

type SalesQuickFilter = '전체' | '오늘 수신' | '업로드 대기' | '검수 대기' | '오류 확인 필요' | '확정 완료' | '정산 대기'

const quickFilters: Array<Exclude<SalesQuickFilter, '전체'>> = ['오늘 수신', '업로드 대기', '검수 대기', '오류 확인 필요', '확정 완료', '정산 대기']

function createEventCostDraft(direction: 'deduction' | 'payment' = 'deduction'): SalesEventCost {
  return { id: crypto.randomUUID(), name: '', amount: 0, direction, owner: direction === 'payment' ? 'seller' : 'company', unitPrice: 0, quantity: 1, supplierSupportRate: 0 }
}

function eventDeductionId(salesDataImportId: string, eventId: string) {
  return eventId === 'legacy' ? `deduction-${salesDataImportId}-event` : `deduction-${salesDataImportId}-event-${eventId}`
}

function detectWiseShopFileOrigin(fileName: string) {
  if (/외\s*\d+개/i.test(fileName)) return 'srookpay' as const
  if (/^주식회사솔루션파트너스_?\d+/i.test(fileName)) return 'order_hub' as const
  return undefined
}

function isSupportedSalesFile(file: File) {
  return /\.(xlsx|xls|csv)$/i.test(file.name)
}

const reviewTone: Record<SalesReviewStatus, string> = {
  '업로드 대기': 'muted',
  '업로드 완료': 'progress',
  '검수 중': 'warning',
  '오류 확인 필요': 'danger',
  '확정 완료': 'complete',
}

const settlementTone: Record<SalesSettlementStatus, string> = {
  '정산 전': 'muted',
  '정산 가능': 'settlement',
  '정산 생성됨': 'settlement',
  '정산 완료': 'complete',
}

function getImportCampaign(salesImport: SalesDataImport) {
  return campaignService.getCampaignById(salesImport.campaignId)
}

function getSupplyDisplay(salesImport: SalesDataImport) {
  const campaign = getImportCampaign(salesImport)
  const audience = salesImport.supplyAudience ?? campaign?.supplyAudience ?? 'seller'
  const vendor = salesImport.settlementVendorName?.trim() || campaign?.settlementVendorName?.trim() || ''
  const isVendor = audience === 'vendor'
  const mismatch = !!campaign && (
    (campaign.supplyAudience ?? 'seller') !== audience ||
    (isVendor && !!salesImport.settlementVendorName && salesImport.settlementVendorName.trim() !== (campaign.settlementVendorName ?? '').trim())
  )
  return {
    isVendor, mismatch,
    label: isVendor ? '벤더 공급' : '셀러 직공급',
    recipient: isVendor ? vendor || '벤더 지정 필요' : campaign?.sellerName || '셀러 확인 필요',
    basis: isVendor ? '해당 벤더와 합의한 SKU별 수수료율' : '셀러용 SKU별 수수료율',
  }
}

function matchesQuick(salesImport: SalesDataImport, quick: SalesQuickFilter) {
  if (quick === '전체') return true
  if (quick === '오늘 수신') return salesImport.uploadedAt.startsWith(getTodayInSeoul())
  if (quick === '검수 대기') return salesImport.reviewStatus === '업로드 완료' || salesImport.reviewStatus === '검수 중'
  if (quick === '정산 대기') return salesImport.settlementStatus === '정산 가능'
  return salesImport.reviewStatus === quick
}

function isCampaignEnded(salesImport: SalesDataImport) {
  const endDate = getImportCampaign(salesImport)?.endDate || salesImport.salesEndDate
  return Boolean(endDate && endDate < getTodayInSeoul())
}

function StatusBadge({ label, tone }: { label: string; tone: string }) {
  return <span className={`campaign-status campaign-status--${tone}`}>{label}</span>
}

function productSkuToSuggestion(product: ProductMaster, sku: ProductMaster['skus'][number]): CommissionSyncSuggestion {
  const totalCommissionRate = sku.totalCommissionRate
    ?? (sku.groupBuyPrice > 0 ? ((sku.groupBuyPrice - sku.supplyPrice) / sku.groupBuyPrice) * 100 : product.totalCommissionRate)
  const sellerCommissionRate = sku.sellerCommissionRate ?? product.sellerCommissionRate
  return {
    skuId: sku.id,
    productId: product.id,
    brandName: product.brandName,
    productName: `[${product.productName}] ${sku.productName || sku.optionName}`,
    optionName: sku.optionName,
    groupBuyPrice: sku.groupBuyPrice,
    pricingType: sku.pricingType,
    minimumQuantity: sku.minimumQuantity,
    maximumQuantity: sku.maximumQuantity,
    similarity: 0,
    priceMatched: false,
    totalCommissionRate,
    sellerCommissionRate,
    companyCommissionRate: Math.max(totalCommissionRate - sellerCommissionRate, 0),
  }
}

export function SalesDataPage({ initialImportId, initialEditRequested = false, onInitialEditOpened }: { initialImportId?: string | null; initialEditRequested?: boolean; onInitialEditOpened?: () => void }) {
  const [imports, setImports] = useState(() => salesDataService.getSalesDataImports())
  const [rows, setRows] = useState(() => salesDataService.getSalesDataRows())
  const [quick, setQuick] = useState<SalesQuickFilter>('전체')
  const [search, setSearch] = useState('')
  const [month, setMonth] = useState('')
  const [oldestFirst, setOldestFirst] = useState(true)
  const [expandedErrorImportId, setExpandedErrorImportId] = useState<string | null>(null)
  const [selectedImportId, setSelectedImportId] = useState<string | null>(() => initialImportId ?? new URLSearchParams(window.location.search).get('import'))
  const [manualTarget, setManualTarget] = useState<SalesDataImport | null>(null)
  useEffect(() => {
    if (window.location.pathname !== '/sales-data') {
      window.history.pushState({}, '', '/sales-data')
      if (initialImportId) window.history.pushState({}, '', `/sales-data?import=${encodeURIComponent(initialImportId)}`)
    }
    const restore = () => setSelectedImportId(new URLSearchParams(window.location.search).get('import'))
    window.addEventListener('popstate', restore)
    return () => window.removeEventListener('popstate', restore)
  }, [])
  useEffect(() => { if (initialImportId) setSelectedImportId(initialImportId) }, [initialImportId])

  const reconcileSettlementStatuses = () => {
    const result = salesDataService.reconcileSettlementStatuses(settlementService.getSettlements())
    if (result.changed) void cloudSyncService.syncKeys([STORAGE_KEYS.salesDataImports])
    return result.imports
  }

  useEffect(() => {
    setImports(reconcileSettlementStatuses())
  }, [])

  useEffect(() => {
    if (getDataProviderMode() !== 'supabase') return
    let active = true
    new SupabaseCampaignRepository().list().then((campaigns) => {
      if (!active) return
      campaignService.saveCampaigns(campaigns)
      salesDataService.syncCampaigns(campaigns)
      setImports(reconcileSettlementStatuses())
      setRows(salesDataService.getSalesDataRows())
    })
    return () => { active = false }
  }, [])

  const sync = () => {
    setImports(reconcileSettlementStatuses())
    setRows(salesDataService.getSalesDataRows())
  }

  const endedImports = useMemo(() => imports.filter(item => !salesDataService.isHiddenDeletedPlaceholder(item)).filter(isCampaignEnded), [imports])
  const selectedImport = endedImports.find((item) => item.id === selectedImportId) ?? null
  useEffect(() => {
    if (!initialEditRequested || !selectedImport) return
    queueMicrotask(() => {
      setManualTarget(selectedImport)
      onInitialEditOpened?.()
    })
  }, [initialEditRequested, onInitialEditOpened, selectedImport])
  const openImport = (importId: string) => {
    window.history.pushState({}, '', `/sales-data?import=${encodeURIComponent(importId)}`)
    setSelectedImportId(importId)
  }
  const closeImport = () => {
    window.history.replaceState({}, '', '/sales-data')
    setSelectedImportId(null)
  }

  const counts = useMemo<Record<Exclude<SalesQuickFilter, '전체'>, number>>(() => ({
    '오늘 수신': endedImports.filter((item) => matchesQuick(item, '오늘 수신')).length,
    '업로드 대기': endedImports.filter((item) => item.reviewStatus === '업로드 대기').length,
    '검수 대기': endedImports.filter((item) => matchesQuick(item, '검수 대기')).length,
    '오류 확인 필요': endedImports.filter((item) => item.reviewStatus === '오류 확인 필요').length,
    '확정 완료': endedImports.filter((item) => item.reviewStatus === '확정 완료').length,
    '정산 대기': endedImports.filter((item) => item.settlementStatus === '정산 가능').length,
  }), [endedImports])

  const months = [...new Set(endedImports.map(item => (item.salesEndDate || getImportCampaign(item)?.endDate || '').slice(0, 7)).filter(Boolean))].sort().reverse()
  const filteredImports = useMemo(() => endedImports
    .filter(item => !month || (item.salesEndDate || getImportCampaign(item)?.endDate || '').startsWith(month))
    .filter((item) => matchesQuick(item, quick))
    .filter((item) => {
      const campaign = getImportCampaign(item)
      const text = [campaign?.campaignName, campaign?.campaignCode, campaign?.sellerName, campaign?.brandName, campaign?.productName, getSupplyDisplay(item).recipient, getSupplyDisplay(item).label, item.fileName, item.campaignId].join(' ').toLowerCase().replace(/\s/g, '')
      return text.includes(search.toLowerCase().replace(/\s/g, ''))
    })
    .sort((a, b) => {
      const aDate = a.salesEndDate || getImportCampaign(a)?.endDate || '9999-12-31'
      const bDate = b.salesEndDate || getImportCampaign(b)?.endDate || '9999-12-31'
      return (oldestFirst ? 1 : -1) * aDate.localeCompare(bDate) || (a.salesEndDate || '').localeCompare(b.salesEndDate || '') || a.campaignId.localeCompare(b.campaignId)
    }), [endedImports, quick, search, month, oldestFirst])

  return (
    <section className="campaign-schedule-page sales-data-page">
      {!selectedImport && <>
      <section className="schedule-summary">
        <div className="schedule-summary__title">
          <div>
            <p className="page-eyebrow">Sales Data</p>
            <h2>판매 데이터</h2>
          </div>
        </div>
        <div className="schedule-summary__grid">
          {quickFilters.map((filter) => (
            <button className={quick === filter ? 'summary-count-card is-active' : 'summary-count-card'} key={filter} onClick={() => setQuick(quick === filter ? '전체' : filter)} type="button">
              <span>{filter}</span>
              <strong>{counts[filter]}</strong>
            </button>
          ))}
        </div>
      </section>

      <section className="panel">
        <div className="panel__header">
          <div>
            <h2>판매 데이터 목록</h2>
            <p>판매가 종료된 공동구매만 표시됩니다. 파일 업로드 또는 수기 입력 후 정산으로 연결합니다.</p>
          </div>
          <strong className="result-count">{filteredImports.length}건</strong>
        </div>
        <div className="schedule-panel__body">
          <div className="action-row"><label>판매 월<select value={month} onChange={event => setMonth(event.target.value)}><option value="">전체</option>{months.map(value => <option key={value} value={value}>{value.slice(0,4)}년 {Number(value.slice(5))}월</option>)}</select></label><button className="secondary-button" type="button" onClick={() => { setQuick('전체'); setMonth(''); setSearch('') }}>전체보기</button><label>경과일 정렬<select value={String(oldestFirst)} onChange={event => setOldestFirst(event.target.value === 'true')}><option value="true">오래된 종료 공구 먼저</option><option value="false">최근 종료 공구 먼저</option></select></label></div><label className="sales-list-search"><span>판매데이터 검색</span><input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="공구명, 셀러, 벤더, 브랜드, 상품명, 파일명 검색" /><small>공구 종료일이 빠른 순</small></label>
          {filteredImports.length === 0 && <p role="status">검색 조건에 맞는 판매데이터가 없습니다.</p>}
          <div className="schedule-table-wrap sales-data-table-wrap">
            <table className="schedule-table sales-data-table">
              <thead>
                <tr><th>공동구매</th><th>데이터 유입처</th><th>브랜드 / 상품</th><th>판매 기간</th><th>순판매수량</th><th>검수 상태</th><th>정산 상태</th><th>상세 / 작업</th></tr>
              </thead>
              <tbody>
                {filteredImports.map((salesImport) => {
                  const campaign = getImportCampaign(salesImport)
                  const net = calculateSalesTotals(rows.filter((row) => row.salesDataImportId === salesImport.id), salesImport)
                  const validationErrors = buildSalesAnalysis(salesImport, rows.filter((row) => row.salesDataImportId === salesImport.id), campaign).validation.results
                    .filter((result) => result.status === 'error')
                    .map((result) => result.message)
                  const messages = [...new Set([
                    ...validationErrors,
                    ...(salesImport.commissionSyncIssues ?? []).map((issue) => issue.message),
                  ])]
                  return (
                    <Fragment key={salesImport.id}><tr onClick={() => openImport(salesImport.id)}>
                      <td><strong>{campaign?.campaignName ?? salesImport.campaignId}</strong><span>{campaign?.campaignCode}</span><span>{getSupplyDisplay(salesImport).label} · 정산 대상: {getSupplyDisplay(salesImport).recipient}</span>{getSupplyDisplay(salesImport).mismatch && <span>공구 공급 조건과 불일치 · 확인 필요</span>}</td>
                      <td>{salesSourceLabel(salesImport)}</td>
                      <td>{campaign?.brandName ?? '-'}<span>{campaign?.productName ?? '-'}</span></td>
                      <td>{salesImport.salesStartDate || '-'} ~ {salesImport.salesEndDate || '-'}<span>{!(salesImport.salesEndDate || campaign?.endDate) ? '종료일 확인 필요' : `종료 후 ${Math.max(0, getDaysBetweenCalendarDates(salesImport.salesEndDate || campaign!.endDate!, getTodayInSeoul()))}일`}</span></td>
                      <td>{net.netQuantity.toLocaleString('ko-KR')}</td>
                      <td>{salesImport.reviewStatus === '오류 확인 필요' ? <button className="text-button" onClick={(event) => { event.stopPropagation(); setExpandedErrorImportId((current) => current === salesImport.id ? null : salesImport.id) }} type="button"><StatusBadge label={salesImport.reviewStatus} tone={reviewTone[salesImport.reviewStatus]} /></button> : <StatusBadge label={salesImport.reviewStatus} tone={reviewTone[salesImport.reviewStatus]} />}</td>
                      <td><StatusBadge label={salesImport.settlementStatus} tone={settlementTone[salesImport.settlementStatus]} /></td>
                      <td><button className="text-button" type="button" onClick={event => { event.stopPropagation(); openImport(salesImport.id) }}>상세</button></td>
                    </tr>{expandedErrorImportId === salesImport.id && <tr><td colSpan={8}><div className="inline-notice settlement-warning"><strong>확인할 오류</strong>{messages.length ? <ul>{messages.map((message) => <li key={message}>{message}</li>)}</ul> : <p>현재 계산 오류는 없습니다. 검수 상태를 다시 저장해주세요.</p>}<button className="secondary-button" onClick={() => openImport(salesImport.id)} type="button">판매데이터 상세 열기</button></div></td></tr>}</Fragment>
                  )
                })}
              </tbody>
            </table>
          </div>
          <div className="schedule-mobile-list">
            {filteredImports.map((salesImport) => {
              const campaign = getImportCampaign(salesImport)
              const net = calculateSalesTotals(rows.filter((row) => row.salesDataImportId === salesImport.id), salesImport)
              const mobileErrors = buildSalesAnalysis(salesImport, rows.filter((row) => row.salesDataImportId === salesImport.id), campaign).validation.results.filter((result) => result.status === 'error').map((result) => result.message)
              return (
                <button className="schedule-mobile-card" key={salesImport.id} onClick={() => openImport(salesImport.id)} type="button">
                  <div className="schedule-mobile-card__top"><strong>{campaign?.campaignName}</strong><StatusBadge label={salesImport.reviewStatus} tone={reviewTone[salesImport.reviewStatus]} /></div>
                  <dl>
                    <div><dt>공급 구분</dt><dd>{getSupplyDisplay(salesImport).label}</dd></div><div><dt>정산 대상</dt><dd>{getSupplyDisplay(salesImport).recipient}{getSupplyDisplay(salesImport).mismatch && ' · 공구 공급 조건 확인 필요'}</dd></div>
                    <div><dt>브랜드·상품</dt><dd>{campaign?.brandName} · {campaign?.productName}</dd></div>
                    <div><dt>순판매수량</dt><dd>{net.netQuantity.toLocaleString('ko-KR')}개</dd></div>
                    <div><dt>순매출</dt><dd>{formatCurrency(net.netSales)}</dd></div>
                    <div><dt>정산 상태</dt><dd>{salesImport.settlementStatus}</dd></div>
                    {salesImport.reviewStatus === '오류 확인 필요' && <div><dt>오류 원인·항목</dt><dd>{mobileErrors.slice(0, 2).join(' / ') || '상세에서 검수 상태를 다시 확인해주세요.'}</dd></div>}
                  </dl>
                </button>
              )
            })}
          </div>
        </div>
      </section>
      </>}

      <SalesDataDrawer
        key={selectedImport?.id ?? 'closed'}
        salesImport={selectedImport}
        rows={rows.filter((row) => row.salesDataImportId === selectedImport?.id)}
        onClose={closeImport}
        onManualInput={(target) => setManualTarget(target)}
        onSync={sync}
      />
      {manualTarget && <ManualSalesDataModal
        salesImport={manualTarget}
        rows={rows.filter((row) => row.salesDataImportId === manualTarget?.id)}
        onClose={() => setManualTarget(null)}
        onSave={() => {
          sync()
          setManualTarget(null)
        }}
      />}
    </section>
  )
}

function SalesDataDrawer({ salesImport, rows, onClose, onManualInput, onSync }: { salesImport: SalesDataImport | null; rows: SalesDataRow[]; onClose: () => void; onManualInput: (salesImport: SalesDataImport) => void; onSync: () => void }) {
  const reviewedUploads = useRef(new WeakSet<object>())
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const pasteUploadRef = useRef<(file?: File) => void>(() => undefined)
  const [uploading, setUploading] = useState(false)
  const [draggingFile, setDraggingFile] = useState(false)
  const [uploadError, setUploadError] = useState('')
  const [columnReview, setColumnReview] = useUploadDraft<{ file: File; sheets: SheetSample[] } | null>(`columnReview:${salesImport?.id}`, null)
  const [lastSelectedFile, setLastSelectedFile] = useUploadDraft<File | null>(`lastSelectedFile:${salesImport?.id}`, null)
  const [columnPreview, setColumnPreview] = useUploadDraft<{ file: File; parsed: Awaited<ReturnType<typeof parseSalesDataFile>>; rule: ColumnRule } | null>(`columnPreview:${salesImport?.id}`, null)
  const [priceRetry, setPriceRetry] = useUploadDraft<{ file: File; options: string[] } | null>(`priceRetry:${salesImport?.id}`, null)
  const [uploadChannel, setUploadChannel] = useUploadDraft<CampaignSalesChannelType | ''>(`uploadChannel:${salesImport?.id}`, campaignChannel(campaignService.getCampaignById(salesImport?.campaignId ?? ''), salesImport ?? undefined) ?? '')
  const [sellerDocumentAuthor, setSellerDocumentAuthor] = useUploadDraft<'supplier' | 'seller' | 'company'>(`documentAuthor:${salesImport?.id}`, salesImport?.documentAuthor ?? (salesImport?.sourceType === 'brand-email' ? 'supplier' : campaignChannel(campaignService.getCampaignById(salesImport?.campaignId ?? ''), salesImport ?? undefined) === 'wise_shop_link' ? 'company' : 'supplier'))
  const documentAuthor: SettlementDocumentAuthor = sellerDocumentAuthor
  const [fileOrigin, setFileOrigin] = useUploadDraft<'order_hub' | 'srookpay'>(`fileOrigin:${salesImport?.id}`, salesImport?.fileOrigin ?? 'order_hub')
  const [uploadConditions, setUploadConditions, uploadConditionsRestored] = useUploadDraft<SettlementSkuCondition[]>(`uploadConditions:${salesImport?.id}`, [])
  const [uploadReview, setUploadReview] = useUploadDraft<{ file: File; parsed: Awaited<ReturnType<typeof parseSalesDataFile>>; policy: 'exclude' | 'include' } | null>(`uploadReview:${salesImport?.id}`, null)
  const [settlementError, setSettlementError] = useState('')
  const [creatingSettlement, setCreatingSettlement] = useState(false)
  const [createdSettlementId, setCreatedSettlementId] = useState(() => salesImport
    ? settlementService.getSettlements().find((item) => item.salesDataImportId === salesImport.id)?.id ?? ''
    : '')
  const [syncingSku, setSyncingSku] = useState(false)
  const [skuSyncResult, setSkuSyncResult] = useState<{ tone: 'complete' | 'warning' | 'danger'; message: string } | null>(null)
  const [showErrorsOnly, setShowErrorsOnly] = useState(false)
  const [eventDrafts, setEventDrafts] = useState<SalesEventCost[]>(() => salesImport ? (getSalesEventCosts(salesImport).length ? getSalesEventCosts(salesImport) : [createEventCostDraft()]) : [])
  const [eventSaveStatus, setEventSaveStatus] = useState<{ tone: 'complete' | 'danger'; message: string } | null>(null)
  const [vendorShippingDetails, setVendorShippingDetails] = useState(() => salesImport?.shippingDetails ?? [{ label: '기본택배비', quantity: 0, unitPrice: 3000 }, { label: '도서산간비', quantity: 0, unitPrice: 3000 }])
  const [vendorShippingDetailed, setVendorShippingDetailed] = useState(Boolean(salesImport?.shippingDetails?.length))
  useEffect(() => {
    setVendorShippingDetails(salesImport?.shippingDetails ?? [{ label: '기본택배비', quantity: 0, unitPrice: 3000 }, { label: '도서산간비', quantity: 0, unitPrice: 3000 }])
    setVendorShippingDetailed(Boolean(salesImport?.shippingDetails?.length))
  }, [salesImport?.id, salesImport?.shippingDetails])
  const [srookPayDraft, setSrookPayDraft] = useState(() => ({
    normalAmount: salesImport?.srookPayNormalAmount ?? ((salesImport?.totalSalesAmount ?? 0) + (salesImport?.shippingRevenue ?? 0)),
    purchaseAmount: salesImport?.srookPayPurchaseAmount ?? (salesImport?.totalSalesAmount ?? 0),
    shippingRevenue: salesImport?.shippingRevenue ?? 0,
    actualFee: salesImport?.srookPayActualFeeAmount?.toString() ?? '',
  }))
  const [srookPaySaveStatus, setSrookPaySaveStatus] = useState<{ tone: 'complete' | 'danger'; message: string } | null>(null)
  const [pendingUpload, setPendingUpload] = useUploadDraft<{ file: File; parsed: Awaited<ReturnType<typeof parseSalesDataFile>> } | null>(`pendingUpload:${salesImport?.id}`, null)
  const [matchProducts, setMatchProducts] = useState<ProductMaster[]>([])
  const [matchProductsLoading, setMatchProductsLoading] = useState(false)
  const [matchProductsError, setMatchProductsError] = useState('')
  const salesImportId = salesImport?.id
  const [catalogRefresh, setCatalogRefresh] = useState(0)
  const [conditionsLoading, setConditionsLoading] = useState(false)
  useEffect(() => {
    if (!salesImport || !uploadConditionsRestored || (!uploadReview && !priceRetry)) return
    let active = true
    setConditionsLoading(true)
    productService.listProducts().then((products) => {
      if (!active) return
      // Refresh available choices too, not just labels on the old cached list.
      // Reviewed row selections and entered amounts live in a separate draft.
      const fresh = getUploadConditions(products, getImportCampaign(salesImport), salesImport).all
      setUploadConditions((current) => [...fresh, ...current.filter((item) => !fresh.some((candidate) => candidate.skuId === item.skuId)).map((item) => ({ ...item, supplyLabel: '이전 연결', conditionOrigin: '현재 상품 목록에 없음 · 다시 선택 필요' }))])
    }).catch(() => { if (active) setUploadError('최신 SKU 목록을 불러오지 못했습니다. 상품 목록 새로고침을 눌러주세요. 입력한 내용은 유지됩니다.') })
      .finally(() => { if (active) setConditionsLoading(false) })
    return () => { active = false }
  }, [salesImportId, uploadConditionsRestored, !!uploadReview, !!priceRetry, catalogRefresh, salesImport?.supplyAudience, salesImport?.settlementVendorName])
  const unmatchedRows = salesImport?.commissionSyncUnmatchedRows ?? 0
  const hasCommissionIssues = Boolean(salesImport?.commissionSyncIssues?.length)
  const needsCommissionPolicyRefresh = (salesImport?.commissionSyncVersion ?? 0) < PRODUCT_COMMISSION_SYNC_VERSION
  useEffect(() => {
    if (!salesImport) return
    const storedEvents = getSalesEventCosts(salesImport)
    setEventDrafts(storedEvents.length ? storedEvents : [createEventCostDraft()])
    setEventSaveStatus(null)
  }, [salesImportId])
  useEffect(() => {
    if (!salesImport) return
    setSrookPayDraft({ normalAmount: salesImport.srookPayNormalAmount ?? (salesImport.totalSalesAmount + (salesImport.shippingRevenue ?? 0)), purchaseAmount: salesImport.srookPayPurchaseAmount ?? salesImport.totalSalesAmount, shippingRevenue: salesImport.shippingRevenue ?? 0, actualFee: salesImport.srookPayActualFeeAmount?.toString() ?? '' })
    setSrookPaySaveStatus(null)
  }, [salesImportId, salesImport?.shippingRevenue, salesImport?.srookPayActualFeeAmount])
  useEffect(() => {
    if (!salesImportId || (!needsCommissionPolicyRefresh && (!unmatchedRows || hasCommissionIssues))) return
    void syncProductCommissionRates(salesImportId).then(onSync)
  }, [salesImportId, unmatchedRows, hasCommissionIssues, needsCommissionPolicyRefresh, onSync])
  useEffect(() => {
    if (!salesImportId || !(salesImport?.commissionSyncIssues?.length)) return
    let active = true
    setMatchProductsLoading(true)
    setMatchProductsError('')
    productService.listProducts().then((products) => {
      if (active) setMatchProducts(products.filter((product) => product.active))
    }).catch((error) => {
      if (active) setMatchProductsError(error instanceof Error ? error.message : '상품 DB를 불러오지 못했습니다.')
    }).finally(() => {
      if (active) setMatchProductsLoading(false)
    })
    return () => { active = false }
  }, [salesImportId, salesImport?.commissionSyncIssues?.length])
  useEffect(() => {
    if (!salesImportId) return
    const pasteFile = (event: ClipboardEvent) => {
      const target = event.target as HTMLElement | null
      if (target?.closest('input, textarea, select, [contenteditable="true"]')) return
      const file = Array.from(event.clipboardData?.files ?? []).find(isSupportedSalesFile)
        ?? Array.from(event.clipboardData?.items ?? []).map((item) => item.kind === 'file' ? item.getAsFile() : null).find((item): item is File => Boolean(item && isSupportedSalesFile(item)))
      if (!file) return
      event.preventDefault()
      pasteUploadRef.current(file)
    }
    document.addEventListener('paste', pasteFile)
    return () => document.removeEventListener('paste', pasteFile)
  }, [salesImportId])
  const searchableSkuCandidates = useMemo(() => matchProducts.flatMap((product) => product.skus
    .filter((sku) => sku.active)
    .map((sku) => productSkuToSuggestion(product, sku))), [matchProducts])
  if (!salesImport) return null

  const campaign = getImportCampaign(salesImport)
  const supply = getSupplyDisplay(salesImport)
  const totals = calculateSalesTotals(rows, salesImport)
  const analysis = buildSalesAnalysis(salesImport, rows, campaign)
  const errorMessages = Array.from(new Set(analysis.validation.results.filter((result) => result.status === 'error').map((result) => result.message)))
  if ((salesImport.commissionSyncUnmatchedRows ?? 0) > 0) errorMessages.push(`상품 DB의 SKU와 연결되지 않은 판매행이 ${salesImport.commissionSyncUnmatchedRows}개 있습니다. 옵션명을 확인하거나 상품 구성을 먼저 등록해주세요.`)
  const hasError = errorMessages.length > 0
  const rateLabel = (key: 'totalCommissionRate' | 'sellerCommissionRate', fallback?: number) => {
    if ((salesImport.commissionSyncUnmatchedRows ?? 0) > 0) return 'SKU 연결 확인 필요'
    const rates = Array.from(new Set(rows.map((row) => row[key]).filter((rate): rate is number => Number.isFinite(rate)))).sort((a, b) => a - b)
    if (rates.length > 1) return 'SKU마다 상이'
    const rate = rates[0] ?? fallback
    return rate === undefined ? '수수료 확인 필요' : `${Number(rate.toFixed(2))}%`
  }
  const totalRateLabel = rateLabel('totalCommissionRate', salesImport.totalCommissionRate ?? 25)
  const sellerRateLabel = rateLabel('sellerCommissionRate', salesImport.sellerCommissionRate ?? salesImport.commissionRate)
  const referenceSalesAmount = salesImport.fileAnalysis?.includedGrossSales ?? salesImport.totalSalesAmount
  const calculatedReferenceSalesAmount = totals.canceledQuantity > 0 || totals.refundedQuantity > 0 ? totals.netSales : totals.totalSalesAmount
  const salesAmountDifference = calculatedReferenceSalesAmount - referenceSalesAmount
  const salesAmountMatches = Math.abs(salesAmountDifference) < 1
  const linkedSettlement = settlementService.getSettlements().find((item) => item.salesDataImportId === salesImport.id)
  const settlementCreated = Boolean(createdSettlementId) || salesImport.settlementStatus === '정산 생성됨' || salesImport.settlementStatus === '정산 완료'
  const directEditLocked = Boolean(linkedSettlement && settlementService.isSettlementConfirmed(linkedSettlement))
  const isSrookPayCampaign = campaign?.salesChannelType === 'wise_shop_link'
    || campaign?.proposalSnapshots?.some((snapshot) => snapshot.actualSalesChannel === 'wise_shop_link')
  const srookPayFeeRate = salesImport.srookPayFeeRate ?? DEFAULT_SROOKPAY_FEE_RATE
  const srookPayEstimatedFee = calculateSrookPayFee(totals.netSales, srookPayDraft.shippingRevenue, srookPayFeeRate)
  const savedEventCosts = getSalesEventCosts(salesImport)
  const settlementEventDeductions = linkedSettlement
    ? (directEditLocked ? linkedSettlement.calculationSnapshot?.deductions ?? [] : settlementService.getDeductionsBySettlementId(linkedSettlement.id))
    : []
  const updateEventDraft = (id: string, patch: Partial<SalesEventCost>) => {
    setEventDrafts((events) => events.map((event) => {
      if (event.id !== id) return event
      const next = { ...event, ...patch }
      if (next.unitPrice !== undefined && next.quantity !== undefined) next.amount = Math.max(Math.round(next.unitPrice * next.quantity * (1 - (next.supplierSupportRate ?? 0) / 100)), 0)
      return next
    }))
    setEventSaveStatus(null)
  }
  const removeEventDraft = (id: string) => {
    if (!window.confirm('이 항목을 목록에서 삭제할까요? 저장하면 정산서 차감 항목에서도 제거됩니다.')) return
    setEventDrafts((events) => events.filter((event) => event.id !== id))
    setEventSaveStatus(null)
  }
  const saveCounterpartyShipping = async () => {
    if (directEditLocked) return
    const amount = vendorShippingDetailed ? vendorShippingDetails.reduce((sum, row) => sum + row.quantity * row.unitPrice, 0) : Number(srookPayDraft.shippingRevenue)
    if (!Number.isFinite(amount) || amount < 0 || (vendorShippingDetailed && vendorShippingDetails.some((row) => !row.label.trim() || !Number.isInteger(row.quantity) || row.quantity < 0 || !Number.isFinite(row.unitPrice) || row.unitPrice < 0))) {
      setSrookPaySaveStatus({ tone: 'danger', message: '배송비를 0원 이상으로 입력해주세요.' }); return
    }
    try {
      salesDataService.updateSalesDataImport({ ...salesImport, shippingRevenue: Math.round(amount), shippingDetails: vendorShippingDetailed ? vendorShippingDetails.map((row) => ({ ...row, unitPrice: Math.round(row.unitPrice) })) : undefined })
      await cloudSyncService.syncKeys([STORAGE_KEYS.salesDataImports])
      setSrookPaySaveStatus({ tone: 'complete', message: '배송비를 저장했습니다. 벤더 정산서의 수금액에 반영됩니다.' })
      onSync()
    } catch {
      setSrookPaySaveStatus({ tone: 'danger', message: '배송비 공용 저장에 실패했습니다. 다시 저장해주세요.' })
    }
  }
  const saveSrookPayCost = async () => {
    if (directEditLocked) {
      setSrookPaySaveStatus({ tone: 'danger', message: '확정된 정산서입니다. 정산 관리에서 확정을 해제한 뒤 수정해주세요.' })
      return
    }
    const actualFee = srookPayDraft.actualFee.trim() === '' ? undefined : Math.max(Math.round(Number(srookPayDraft.actualFee)), 0)
    if (!Number.isFinite(srookPayDraft.normalAmount) || !Number.isFinite(srookPayDraft.purchaseAmount) || srookPayDraft.normalAmount < srookPayDraft.purchaseAmount || (actualFee !== undefined && !Number.isFinite(actualFee))) {
      setSrookPaySaveStatus({ tone: 'danger', message: '정상금액과 구매총액을 확인해주세요. 정상금액은 구매총액보다 작을 수 없습니다.' })
      return
    }
    salesDataService.updateSalesDataImport({ ...salesImport, srookPayNormalAmount: Math.round(srookPayDraft.normalAmount), srookPayPurchaseAmount: Math.round(srookPayDraft.purchaseAmount), shippingRevenue: Math.round(srookPayDraft.shippingRevenue), srookPayFeeRate, srookPayEstimatedFeeAmount: srookPayEstimatedFee, srookPayActualFeeAmount: actualFee })
    const syncedSettlement = settlementService.syncSalesCostDeductions(salesImport.id)
    await cloudSyncService.syncKeys([STORAGE_KEYS.salesDataImports, STORAGE_KEYS.settlements, STORAGE_KEYS.settlementDeductions, STORAGE_KEYS.settlementActivityLogs])
    setSrookPaySaveStatus({ tone: 'complete', message: syncedSettlement ? '✅ 스룩페이 수수료가 정산서에 반영되었습니다.' : '✅ 저장되었습니다. 정산서 생성 시 자동 반영됩니다.' })
    onSync()
  }
  const saveEventCosts = async () => {
    if (directEditLocked) {
      setEventSaveStatus({ tone: 'danger', message: '확정된 정산서입니다. 정산 관리에서 확정을 해제한 뒤 수정해주세요.' })
      return
    }
    const normalized = eventDrafts.map((event) => ({ ...event, name: event.name.trim(), amount: event.unitPrice !== undefined && event.quantity !== undefined ? Math.max(Math.round(event.unitPrice * event.quantity * (1 - (event.supplierSupportRate ?? 0) / 100)), 0) : Math.max(Math.round(event.amount), 0) }))
    if (normalized.some((event) => !event.name || !Number.isFinite(event.amount) || (event.direction === 'payment' && !['seller','company','manager'].includes(event.owner)))) {
      setEventSaveStatus({ tone: 'danger', message: '항목명·금액·지급 대상을 확인해주세요.' })
      return
    }
    const owners = new Set(normalized.map((event) => event.owner))
    const nextImport: SalesDataImport = {
      ...salesImport,
      eventCosts: normalized,
      eventName: normalized.length === 1 ? normalized[0].name : normalized.length ? `${normalized.length}개 이벤트` : undefined,
      eventDeductionAmount: normalized.reduce((sum, event) => sum + event.amount, 0),
      eventCostOwner: owners.size === 1 ? normalized[0]?.owner : undefined,
    }
    salesDataService.updateSalesDataImport(nextImport)
    const syncedSettlement = settlementService.syncSalesEventDeduction(salesImport.id)
    await cloudSyncService.syncKeys([
      STORAGE_KEYS.salesDataImports,
      STORAGE_KEYS.settlements,
      STORAGE_KEYS.settlementDeductions,
      STORAGE_KEYS.settlementActivityLogs,
    ])
    setEventDrafts(normalized.length ? normalized : [createEventCostDraft()])
    setEventSaveStatus({ tone: 'complete', message: syncedSettlement ? `✅ 이벤트 ${normalized.length}건이 정산서에 반영되었습니다.` : `✅ 이벤트 ${normalized.length}건이 저장되었습니다. 정산서 생성 시 자동 반영됩니다.` })
    onSync()
  }
  const reconnectSkuRates = async () => {
    setSyncingSku(true)
    setSkuSyncResult(null)
    try {
      const result = await syncProductCommissionRates(salesImport.id)
      const validation = salesDataService.validateSalesData(salesImport.id)
      setSkuSyncResult(result.unmatched === 0
        ? { tone: 'complete', message: `✅ SKU·수수료 연결 완료 · ${result.matched.toLocaleString('ko-KR')}개 모두 연결되었습니다.` }
        : { tone: 'warning', message: `SKU ${result.matched.toLocaleString('ko-KR')}개 연결 · ${result.unmatched.toLocaleString('ko-KR')}개는 직접 확인이 필요합니다.` })
      if (!validation) setSkuSyncResult({ tone: 'danger', message: '판매 데이터 검증 결과를 저장하지 못했습니다.' })
      onSync()
    } catch (error) {
      setSkuSyncResult({ tone: 'danger', message: error instanceof Error ? error.message : 'SKU·수수료를 다시 연결하지 못했습니다.' })
    } finally {
      setSyncingSku(false)
    }
  }
  const confirmAndCreateSettlement = async () => {
    setSettlementError('')
    if (hasError) {
      setSettlementError(errorMessages.join(' / '))
      return
    }
    setCreatingSettlement(true)
    await new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()))
    try {
      const confirmed = salesDataService.confirmSalesData(salesImport.id)
      if (!confirmed) throw new Error('판매데이터 검증 오류가 남아 있어 확정할 수 없습니다. 위의 검증 메시지를 확인해주세요.')
      const created = await settlementService.prepareSettlementFromSalesData(confirmed.id)
      if (!created) throw new Error('정산 생성 조건을 충족하지 못했습니다. 검수 상태와 정산 가능 상태를 확인해주세요.')
      await cloudSyncService.syncKeys([
        STORAGE_KEYS.salesDataImports,
        STORAGE_KEYS.salesDataRows,
        STORAGE_KEYS.settlements,
        STORAGE_KEYS.settlementDeductions,
        STORAGE_KEYS.settlementVersions,
        STORAGE_KEYS.settlementActivityLogs,
        STORAGE_KEYS.workItems,
        STORAGE_KEYS.notifications,
      ])
      setCreatedSettlementId(created.id)
      onSync()
    } catch (error) {
      setSettlementError(error instanceof Error ? error.message : '정산을 생성하지 못했습니다.')
    } finally {
      setCreatingSettlement(false)
    }
  }

  const saveParsedUpload = async (file: File, parsed: Awaited<ReturnType<typeof parseSalesDataFile>>, policy: 'exclude' | 'include', approved = false) => {
    if (directEditLocked) throw new Error('확정된 정산서입니다. 확정을 해제한 후 자료를 변경해주세요.')
    if (!documentAuthor || !uploadChannel) throw new Error('자료 작성 주체와 공구 판매 링크를 확인해주세요.')
    const detectedKind: SettlementDocumentKind = parsed.analysis.sourceDocumentType === 'supplier_dispatch' ? 'supplier_cost' : parsed.analysis.sourceDocumentType === 'supplier_settlement' ? 'supplier_net_settlement' : 'customer_sales'
    if (!approved && !reviewedUploads.current.has(parsed)) { setUploadReview({ file, parsed, policy }); setPendingUpload(null); return }
    const includePending = policy === 'include'
    const selectedRows = includePending ? parsed.rowsIncludingPending : parsed.rows
    const selectedQuantity = parsed.analysis.includedQuantity + (includePending ? parsed.analysis.pendingPaymentQuantity : 0)
    if (parsed.analysis.finalSettlementQuantity !== undefined && selectedQuantity !== parsed.analysis.finalSettlementQuantity) {
      throw new Error(`선택한 정산 수량 ${selectedQuantity}개와 최종정산 수량 ${parsed.analysis.finalSettlementQuantity}개가 다릅니다. 결제대기 반영 기준을 확인해주세요.`)
    }
    const selectedSales = parsed.analysis.includedGrossSales + (includePending ? parsed.analysis.pendingPaymentSales : 0)
    const selectedAnalysis = {
      ...parsed.analysis,
      includedRowCount: parsed.analysis.includedRowCount + (includePending ? parsed.analysis.pendingPaymentRowCount : 0),
      includedQuantity: selectedQuantity,
      includedGrossSales: selectedSales,
      includedShippingRevenue: (parsed.analysis.includedShippingRevenue ?? 0) + (includePending ? parsed.analysis.pendingPaymentShippingRevenue ?? 0 : 0),
      excludedRowCount: parsed.analysis.sourceRowCount - parsed.analysis.includedRowCount - (includePending ? parsed.analysis.pendingPaymentRowCount : 0),
      excludedGrossSales: parsed.analysis.sourceGrossSales - selectedSales,
      pendingPaymentPolicy: policy,
      statusBreakdown: parsed.analysis.statusBreakdown.map((item) => ({
        ...item,
        included: /결제대기|입금대기|미결제/.test(item.status) ? includePending : item.included,
      })),
      warnings: [
        ...parsed.analysis.warnings.filter((warning) => !warning.includes('포함 여부를 선택')),
        ...(shouldAskPendingPaymentPolicy(parsed.analysis)
          ? [`결제대기 ${parsed.analysis.pendingPaymentRowCount}행 ${formatCurrency(parsed.analysis.pendingPaymentSales)}을 ${includePending ? '매출·정산금에 포함' : '매출·정산금에서 제외'}하도록 선택했습니다.`]
          : []),
      ],
    }
    try {
      const originalFile = await sellerSettlementFileService.storeOriginalForImport(file, {
        campaignId: salesImport.campaignId,
        salesDataImportId: salesImport.id,
        previousPath: salesImport.originalSalesFileStoragePath,
      })
      const hasPeriodStatistics = salesImport.srookPayNormalAmount !== undefined && salesImport.srookPayPurchaseAmount !== undefined
      const periodShippingRevenue = hasPeriodStatistics ? Math.max(salesImport.srookPayNormalAmount! - salesImport.srookPayPurchaseAmount!, 0) : undefined
      const detectedSrookPayFee = isSrookPayCampaign && periodShippingRevenue !== undefined ? calculateSrookPayFee(selectedSales, periodShippingRevenue, DEFAULT_SROOKPAY_FEE_RATE) : undefined
      const nextImport = salesDataService.updateSalesDataImport({
        ...salesImport,
        fileName: file.name,
        fileSize: file.size,
        ...originalFile,
        sellerExcelExport: undefined,
        sourceType: 'file',
        documentAuthor, documentKind: detectedKind, fileOrigin: uploadChannel === 'wise_shop_link' && documentAuthor === 'company' ? (detectWiseShopFileOrigin(file.name) ?? fileOrigin) : undefined,
        settlementTerms: captureUploadTerms(uploadChannel, selectedRows, salesImport.supplyAudience !== 'vendor'),
        commissionCalculationType: 'sku',
        commissionSyncVersion: PRODUCT_COMMISSION_SYNC_VERSION, commissionSyncIssues: [], commissionSyncUnmatchedRows: 0,
        manualSettlement: undefined,
        uploadedBy: '허수정',
        uploadedAt: new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Seoul' }).slice(0, 16),
        reviewStatus: '업로드 완료',
        settlementStatus: '정산 전',
        confirmedAt: undefined,
        confirmedBy: undefined,
        uploadedProductName: campaign?.productName,
        salesStartDate: campaign?.startDate,
        salesEndDate: campaign?.endDate,
        totalQuantity: selectedQuantity,
        totalSalesAmount: selectedSales,
        fileAnalysis: selectedAnalysis,
        pendingPaymentPolicy: policy,
        shippingRevenue: isSrookPayCampaign ? periodShippingRevenue : salesImport.shippingRevenue,
        srookPayFeeRate: isSrookPayCampaign ? DEFAULT_SROOKPAY_FEE_RATE : salesImport.srookPayFeeRate,
        srookPayEstimatedFeeAmount: detectedSrookPayFee,
        srookPayActualFeeAmount: undefined,
        notes: selectedAnalysis.warnings.join(' '),
      })
      salesDataService.addSalesDataRows(salesImport.id, selectedRows)
      const commissionSync = await syncProductCommissionRates(salesImport.id)
      if (commissionSync.unmatched > 0) {
        const syncedImport = salesDataService.getSalesDataImportById(salesImport.id) ?? nextImport
        salesDataService.updateSalesDataImport({
          ...syncedImport,
          notes: `${selectedAnalysis.warnings.join(' ')} 상품 DB 수수료를 찾지 못한 판매행 ${commissionSync.unmatched}개는 일정 기본 수수료를 사용합니다.`,
        })
      }
      salesDataService.validateSalesData(nextImport.id)
      await cloudSyncService.syncKeys([STORAGE_KEYS.salesDataImports, STORAGE_KEYS.salesDataRows])
      setPendingUpload(null)
      setUploadReview(null)
      setUploadError('')
      onSync()
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : '분석 결과를 저장하지 못했습니다.')
    }
  }

  const uploadFile = async (file?: File) => {
    if (!file) return
    if (!isSupportedSalesFile(file)) { setUploadError('엑셀 또는 CSV 파일(.xlsx, .xls, .csv)만 업로드할 수 있습니다.'); return }
    if (directEditLocked) { setUploadError('확정된 정산서입니다. 확정을 해제한 후 자료를 변경해주세요.'); return }
    if (!documentAuthor || !uploadChannel) { setUploadError('자료 작성 주체와 공구 판매 링크를 먼저 확인해주세요.'); return }
    setUploadReview(null)
    setLastSelectedFile(file)
    setColumnReview(null)
    setColumnPreview(null)
    setPendingUpload(null)
    setPriceRetry(null)
    setUploading(true)
    setUploadError('')
    try {
      const detectedOrigin = detectWiseShopFileOrigin(file.name)
      if (detectedOrigin) setFileOrigin(detectedOrigin)
      const products = await productService.listProducts()
      const conditionSet = getUploadConditions(products, campaign, salesImport)
      setUploadConditions(conditionSet.all)
      const priceCandidates = conditionSet.candidates
      const sheets = await inspectSalesWorkbook(file)
      const scope = `${campaign?.brandId || campaign?.brandName || salesImport.campaignId}::${documentAuthor}::${uploadChannel === 'wise_shop_link' && documentAuthor === 'company' ? (detectedOrigin ?? fileOrigin) : 'auto'}`
      const learned = sheets.length === 1 ? findLearnedRule(sheets, scope, storageService.getItem<ColumnRule[]>(STORAGE_KEYS.salesColumnRules, [])) : undefined
      const parsed = await parseSalesDataFile(learned ? mapSalesSheet(sheets[learned.sheet], learned.row, learned.mapping) : file, salesImport, priceCandidates, uploadChannel || undefined)
      if (learned) parsed.analysis.warnings.push('이 업체에서 확인한 용어 분류를 재사용했습니다. 수량·판매가·합계를 검증했습니다.')
      if (shouldAskPendingPaymentPolicy(parsed.analysis)) setPendingUpload({ file, parsed })
      else await saveParsedUpload(file, parsed, 'exclude')
    } catch (error) {
      if (error instanceof UnmatchedSalesPricesError) setPriceRetry({ file, options: error.options })
      else {
        try { setColumnReview({ file, sheets: await inspectSalesWorkbook(file) }) } catch { /* File decoding errors remain visible below. */ }
      }
      setUploadError(error instanceof Error ? error.message : '파일을 분석하지 못했습니다.')
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const previewColumns = async (sheet: number, row: number, mapping: ColumnMap) => {
    if (!columnReview) return
    setUploading(true)
    setUploadError('')
    setColumnPreview(null)
    try {
      const conditions = getUploadConditions(await productService.listProducts(), campaign, salesImport)
      setUploadConditions(conditions.all)
      const parsed = await parseSalesDataFile(mapSalesSheet(columnReview.sheets[sheet], row, mapping), salesImport, conditions.candidates, uploadChannel || undefined)
      parsed.analysis.sheetName = columnReview.sheets[sheet].name
      parsed.analysis.headerRow = row + 1
      parsed.analysis.warnings.push('사용자가 확인한 열 분류를 적용했습니다. 수수료는 상품·SKU 연결 기준으로 별도 검증합니다.')
      setColumnPreview({ file: columnReview.file, parsed, rule: { scope: `${campaign?.brandId || campaign?.brandName || salesImport.campaignId}::${documentAuthor}::${uploadChannel === 'wise_shop_link' && documentAuthor === 'company' ? fileOrigin : 'auto'}`, signature: headerSignature(columnReview.sheets[sheet].rows[row]), mapping, updatedAt: new Date().toISOString() } })
    } catch (error) { setUploadError(error instanceof Error ? error.message : '열 분류를 확인해주세요.') }
    finally { setUploading(false) }
  }
  pasteUploadRef.current = uploadFile
  const rememberColumns = async () => {
    if (!columnPreview || uploading) return
    setUploading(true)
    setUploadError('')
    try {
      const rules = storageService.getItem<ColumnRule[]>(STORAGE_KEYS.salesColumnRules, [])
      storageService.setItem(STORAGE_KEYS.salesColumnRules, [...rules.filter((rule) => rule.scope !== columnPreview.rule.scope || rule.signature !== columnPreview.rule.signature), columnPreview.rule])
      await cloudSyncService.syncKeys([STORAGE_KEYS.salesColumnRules])
      if (shouldAskPendingPaymentPolicy(columnPreview.parsed.analysis)) setPendingUpload({ file: columnPreview.file, parsed: columnPreview.parsed })
      else await saveParsedUpload(columnPreview.file, columnPreview.parsed, 'exclude')
      setColumnReview(null)
      setColumnPreview(null)
    } catch (error) { setUploadError(error instanceof Error ? error.message : '확인한 양식을 저장하지 못했습니다.') }
    finally { setUploading(false) }
  }

  const retryWithConfirmedPrices = async (edited: SalesDataRow[]) => {
    if (!priceRetry || uploading) return
    const candidates = edited
      .filter((row) => row.skuId && Number.isFinite(row.unitPrice) && row.unitPrice > 0)
      .map((row) => ({ ...row, productName: row.productName ?? '', groupBuyPrice: row.unitPrice, confirmed: true }))
    setUploading(true)
    setUploadError('')
    try {
      const products = await productService.listProducts()
      const catalog = getUploadConditions(products, campaign, salesImport).candidates
      const parsed = await parseSalesDataFile(priceRetry.file, salesImport, [...candidates, ...catalog], uploadChannel || undefined)
      try { if (!uploadChannel) throw new Error('판매 링크 확인 필요'); captureUploadTerms(uploadChannel, parsed.rowsIncludingPending, salesImport.supplyAudience !== 'vendor'); reviewedUploads.current.add(parsed) } catch { /* Only unresolved conditions need another review. */ }
      parsed.analysis.warnings.push('검색·가격 비교에서 확인한 SKU와 수수료 조건을 적용했습니다.')
      if (shouldAskPendingPaymentPolicy(parsed.analysis)) setPendingUpload({ file: priceRetry.file, parsed })
      else await saveParsedUpload(priceRetry.file, parsed, 'exclude')
      setPriceRetry(null)
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : '공구가를 적용하지 못했습니다.')
    } finally { setUploading(false) }
  }

  const applyUploadConditions = async (edited: SalesDataRow[]) => {
    if (!uploadReview || uploading) return
    setUploading(true)
    setUploadError('')
    try {
      const parsed = applyReviewedUpload(uploadReview.parsed, edited)
      await saveParsedUpload(uploadReview.file, parsed, uploadReview.policy, true)
    } catch (error) { setUploadError(error instanceof Error ? error.message : 'SKU 조건을 확인해주세요.') }
    finally { setUploading(false) }
  }

  const applyPendingPolicy = async (policy: 'exclude' | 'include') => {
    if (!pendingUpload) return
    try { await saveParsedUpload(pendingUpload.file, pendingUpload.parsed, policy) }
    catch (error) { setUploadError(error instanceof Error ? error.message : '자료 내용과 정산 기준을 확인해주세요.') }
  }

  return (
      <section className="sales-data-detail-page">
        <div className="preview-drawer__header">
          <div><button className="back-button" onClick={onClose} type="button">← 판매 데이터 목록</button><p className="page-eyebrow">Sales Detail</p><h2>{campaign?.campaignName ?? salesImport.campaignId}</h2></div>
        </div>

        <dl className="preview-list sales-data-detail-list">
          <div><dt>공급 구분</dt><dd><StatusBadge label={supply.label} tone={supply.isVendor ? 'progress' : 'muted'} /></dd></div>
          <div><dt>정산 대상</dt><dd>{supply.recipient}{supply.isVendor && ' (벤더 정산서)'}</dd></div>
          <div><dt>수수료 기준</dt><dd>{supply.basis}</dd></div>
          <div><dt>판매 셀러</dt><dd>{campaign?.sellerName || '-'}</dd></div>
          <div><dt>브랜드</dt><dd>{campaign?.brandName}</dd></div>
          <div><dt>상품</dt><dd>{campaign?.productName}</dd></div>
          <div><dt>판매 기간</dt><dd>{salesImport.salesStartDate || '-'} ~ {salesImport.salesEndDate || '-'}</dd></div>
          <div><dt>담당 매니저</dt><dd>{campaign?.managerName}</dd></div>
          <div><dt>MD</dt><dd>{campaign?.mdName}</dd></div>
          <div><dt>판매 링크</dt><dd><LandingPageBadge landingPageType={campaignChannel(campaign, salesImport)} linkOwner={campaign?.linkOwner} /></dd></div>
          <div><dt>데이터 출처</dt><dd>{salesImport.sourceType}</dd></div>
          <div><dt>업로드 담당자</dt><dd>{salesImport.uploadedBy || '-'}</dd></div>
          <div><dt>업로드 시간</dt><dd>{salesImport.uploadedAt || '-'}</dd></div>
          <div><dt>검수 담당자</dt><dd>{salesImport.reviewerName}</dd></div>
          <div><dt>검수 상태</dt><dd><StatusBadge label={salesImport.reviewStatus} tone={reviewTone[salesImport.reviewStatus]} /></dd></div>
          <div><dt>정산 상태</dt><dd><StatusBadge label={salesImport.settlementStatus} tone={settlementTone[salesImport.settlementStatus]} /></dd></div>
        </dl>

        <div className="sales-supply-notice">
          <strong>공급·정산 안내</strong>
          {supply.isVendor && <p>정산서는 {supply.recipient}에 전달합니다. 판매 셀러의 정산은 해당 벤더가 진행합니다.</p>}
          {supply.mismatch && <p className="sales-supply-notice__warning" role="alert">공구 일정의 공급 조건과 이 판매 데이터에 저장된 조건이 다릅니다. 정산 전 공급 구분과 정산 대상을 확인해주세요.</p>}
          <p>판매 셀러와 정산 대상은 공구별로 관리합니다. 같은 셀러도 이번 공구의 공급 방식에 따라 정산 대상이 달라질 수 있습니다.</p>
          <button className="secondary-button" type="button" onClick={() => openCampaignDetail(salesImport.campaignId)}>공구 연결 정보 확인</button>
        </div>

        <section
          className={`sales-upload-box${draggingFile ? ' is-dragging' : ''}`}
          onDragEnter={(event) => { event.preventDefault(); setDraggingFile(true) }}
          onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDraggingFile(false) }}
          onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = 'copy' }}
          onDrop={(event) => {
            event.preventDefault()
            setDraggingFile(false)
            const file = Array.from(event.dataTransfer.files).find(isSupportedSalesFile)
            if (file) void uploadFile(file)
            else setUploadError('엑셀 또는 CSV 파일(.xlsx, .xls, .csv)을 끌어놓아 주세요.')
          }}
        >
          <strong>정산서 자동 분석</strong>
          <div className="sales-upload-context">
            <div><strong>{uploadChannel ? channelLabels[uploadChannel] : '판매 링크 미등록'}</strong><span>공구 일정 기준 · 자료 내용 자동 분석</span></div>
            {!uploadChannel && <label>판매 링크 확인 <select value={uploadChannel} disabled={uploading} onChange={(event) => setUploadChannel(event.target.value as CampaignSalesChannelType)}><option value="">선택해주세요</option>{Object.entries(channelLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>}
            {true ? <fieldset disabled={uploading || !!priceRetry || !!pendingUpload || !!uploadReview || directEditLocked}><legend>자료 작성</legend>{(['supplier', 'seller', 'company'] as const).map((value) => <label key={value}><input type="radio" name="seller-document-author" checked={sellerDocumentAuthor === value} onChange={() => setSellerDocumentAuthor(value)} />{authorLabels[value]}</label>)}</fieldset> : <p>자료 작성: {uploadChannel === 'wise_shop_link' ? '와이즈벤더 (우리 회사)' : '공급사'}</p>}
            {uploadChannel === 'wise_shop_link' && documentAuthor === 'company' && <fieldset disabled={uploading || !!priceRetry || !!pendingUpload || !!uploadReview || directEditLocked}><legend>업로드 파일</legend><label><input type="radio" name="upload-file-origin" checked={fileOrigin === 'order_hub'} onChange={() => setFileOrigin('order_hub')} />발주모아</label><label><input type="radio" name="upload-file-origin" checked={fileOrigin === 'srookpay'} onChange={() => setFileOrigin('srookpay')} />스룩페이</label></fieldset>}
          </div>

          <div className="sales-upload-drop-hint">
            <strong>{draggingFile ? '여기에 놓으면 바로 분석합니다' : '파일을 끌어놓거나 복사해서 붙여넣으세요'}</strong>
            <span>바탕화면에서 드래그 · 파일 복사 후 Ctrl+V 또는 ⌘+V · 엑셀/CSV 지원</span>
          </div>
          <p>업체마다 열 이름과 위치가 달라도 상품·수량·판매가·주문 상태를 찾아 정산용 표로 변환합니다. 분석 후 반드시 결과를 확인해주세요.</p>
          <dl>
            <div><dt>파일명</dt><dd>{salesImport.fileName || '-'}</dd></div>
            {salesImport.originalSalesFileStorageError && <div role="status"><dt>원본 보관 확인 필요</dt><dd>판매데이터 반영과 정산서 작성은 가능합니다. 원본 보관 및 구매내역 링크 생성은 별도 확인이 필요합니다. {salesImport.originalSalesFileStorageError}</dd></div>}
            <div><dt>파일 크기</dt><dd>{formatFileSize(salesImport.fileSize)}</dd></div>
            <div><dt>업로드 시간</dt><dd>{salesImport.uploadedAt || '-'}</dd></div>
            <div><dt>현재 검수 상태</dt><dd>{salesImport.reviewStatus}</dd></div>
          </dl>
          {uploadError && <div className="inline-notice settlement-warning"><strong>분석 실패</strong><span>{uploadError}</span></div>}
          {lastSelectedFile && <button type="button" className="secondary-button" disabled={uploading} onClick={() => { setColumnPreview(null); setPendingUpload(null); void inspectSalesWorkbook(lastSelectedFile).then((sheets) => setColumnReview({ file: lastSelectedFile, sheets })).catch((error) => setUploadError(String(error))) }}>열 의미 확인·수정 / 양식 다시 학습</button>}
          {columnReview && <div onChange={() => setColumnPreview(null)}><SalesColumnReview key={columnReview.file.name} sheets={columnReview.sheets} busy={uploading} onAnalyze={(sheet, row, mapping) => void previewColumns(sheet, row, mapping)} onClose={() => { setColumnReview(null); setColumnPreview(null) }} /></div>}
          {columnPreview && <section className="inline-notice"><strong>분류 결과 확인</strong><p>{columnPreview.parsed.rows.length}개 옵션 · 순판매 {columnPreview.parsed.analysis.includedQuantity.toLocaleString()}개 · 순매출 {formatCurrency(columnPreview.parsed.analysis.includedGrossSales)}</p><p>취소 {columnPreview.parsed.rows.reduce((sum, row) => sum + row.canceledQuantity, 0)}개 · 반품 {columnPreview.parsed.rows.reduce((sum, row) => sum + row.refundedQuantity, 0)}개</p><button type="button" className="primary-button" disabled={uploading} onClick={() => void rememberColumns()}>결과 적용하고 이 업체 양식 기억</button></section>}
          {priceRetry && <UploadConditionsReview sellerCheckout={uploadChannel === 'seller_checkout'} refreshing={conditionsLoading} onRefresh={() => setCatalogRefresh((value) => value + 1)} supplyAudience={supply.isVendor ? 'vendor' : 'seller'} vendorName={supply.isVendor ? supply.recipient : undefined} draftKey={`${salesImport.id}:${priceRetry.file.name}:${priceRetry.file.lastModified}:prices`} key={priceRetry.file.name + priceRetry.file.lastModified + '-missing-prices'} rows={priceRetry.options.map((optionName) => calculateSalesRow({ id: optionName, salesDataImportId: salesImport.id, campaignId: salesImport.campaignId, optionName, quantity: 0, unitPrice: 0, priceSource: 'sku', canceledQuantity: 0, refundedQuantity: 0 }))} conditions={uploadConditions} preferredProductIds={Array.from(new Set([campaign?.productId ?? '', ...(campaign?.campaignProducts?.map((item) => item.productId) ?? []), ...uploadConditions.filter((item) => campaign?.productName && item.productName.replace(/[^a-z0-9가-힣]/gi, '').startsWith(campaign.productName.replace(/[^a-z0-9가-힣]/gi, ''))).map((item) => item.productId)]))} busy={uploading} error={uploadError} onApply={(edited) => void retryWithConfirmedPrices(edited)} onCancel={() => { setPriceRetry(null); setUploadError('') }} />}
          <input accept=".xlsx,.xls,.csv" hidden onChange={(event) => void uploadFile(event.target.files?.[0])} ref={fileInputRef} type="file" />
          <div className="sales-upload-actions"><button className="primary-button" disabled={uploading || directEditLocked} onClick={() => fileInputRef.current?.click()} type="button">{uploading ? '분석 중...' : '정산서 선택'}</button><button className="secondary-button" disabled={uploading || directEditLocked} onClick={() => onManualInput({ ...salesImport, documentAuthor, documentKind: 'combined_commission' })} type="button">수기 입력</button></div>
        </section>

        {uploadReview && <><div className="inline-notice"><strong>분석 결과 확인</strong><span>자료 작성: {documentAuthor ? authorLabels[documentAuthor] : '미선택'} · {documentKindLabels[uploadReview.parsed.analysis.sourceDocumentType === 'supplier_dispatch' ? 'supplier_cost' : uploadReview.parsed.analysis.sourceDocumentType === 'supplier_settlement' ? 'supplier_net_settlement' : 'customer_sales']}</span><span>정산 반영 예정 수량: {uploadReview.parsed.analysis.includedQuantity + (uploadReview.policy === 'include' ? uploadReview.parsed.analysis.pendingPaymentQuantity : 0)}개</span></div><UploadConditionsReview sellerCheckout={uploadChannel === 'seller_checkout'} refreshing={conditionsLoading} onRefresh={() => setCatalogRefresh((value) => value + 1)} supplyAudience={supply.isVendor ? 'vendor' : 'seller'} vendorName={supply.isVendor ? supply.recipient : undefined} draftKey={`${salesImport.id}:${uploadReview.file.name}:${uploadReview.file.lastModified}:review`} key={uploadReview.file.name + uploadReview.file.lastModified} rows={uploadReview.parsed.rowsIncludingPending} conditions={uploadConditions} preferredProductIds={Array.from(new Set([campaign?.productId ?? '', ...(campaign?.campaignProducts?.map((item) => item.productId) ?? []), ...uploadConditions.filter((item) => campaign?.productName && item.productName.replace(/[^a-z0-9가-힣]/gi, '').startsWith(campaign.productName.replace(/[^a-z0-9가-힣]/gi, ''))).map((item) => item.productId)]))} busy={uploading} error={uploadError} onApply={(edited) => void applyUploadConditions(edited)} onCancel={() => { setUploadReview(null); setUploadError('') }} /></>}

        {salesImport.settlementTerms && <section className="inline-notice"><strong>공구 정산 조건 저장됨</strong><span>{channelLabels[salesImport.settlementTerms.salesChannelType]} · 자료 작성: {salesImport.documentAuthor ? authorLabels[salesImport.documentAuthor] : '미확인'} · {salesImport.documentKind ? documentKindLabels[salesImport.documentKind] : '내용 미확인'}</span><small>SKU별 판매가·수수료는 확인 당시 조건을 사용합니다. 변경이 필요하면 판매 수량·조건 수정에서 조정하세요.</small></section>}

        {pendingUpload && <section className="sales-pending-policy">
          <div className="checklist-head"><div><h3>결제대기 매출 처리 선택</h3><p>업체가 결제대기 주문까지 정산해줬는지 확인한 뒤, 이번 파일의 기준을 선택해주세요. 선택 전에는 판매데이터가 저장되지 않습니다.</p></div><StatusBadge label="선택 필수" tone="danger" /></div>
          <div className="sales-policy-options">
            <button type="button" onClick={() => applyPendingPolicy('exclude')}><span>결제대기 제외</span><strong>{formatCurrency(pendingUpload.parsed.analysis.includedGrossSales)}</strong><small>{pendingUpload.parsed.analysis.includedQuantity.toLocaleString('ko-KR')}개 · 일반적인 정산 기준</small></button>
            <button type="button" onClick={() => applyPendingPolicy('include')}><span>결제대기 모두 포함</span><strong>{formatCurrency(pendingUpload.parsed.analysis.includedGrossSales + pendingUpload.parsed.analysis.pendingPaymentSales)}</strong><small>{(pendingUpload.parsed.analysis.includedQuantity + pendingUpload.parsed.analysis.pendingPaymentQuantity).toLocaleString('ko-KR')}개 · 뉴월드처럼 실제 지급된 경우</small></button>
          </div>
          <p className="sales-pending-alert">결제대기 차이: {pendingUpload.parsed.analysis.pendingPaymentRowCount}행 · {pendingUpload.parsed.analysis.pendingPaymentQuantity.toLocaleString('ko-KR')}개 · {formatCurrency(pendingUpload.parsed.analysis.pendingPaymentSales)}</p>
        </section>}

        {salesImport.manualSettlement && <section className="sales-ai-card">
          <h3>수기 정산 · 업체 전달 수수료 대조</h3>
          <p>셀러 + 와이즈벤더 합산 수수료 · {salesImport.manualSettlement.quantityBasis === 'net' ? '취소·반품 차감 후 수량' : '취소·반품 차감 전 수량'}</p>
          <div className="sales-summary-grid">
            <SummaryItem label="업체 전달 합산 수수료" value={salesImport.manualSettlement.reportedCommissionAmount === undefined ? '확인 필요' : formatCurrency(salesImport.manualSettlement.reportedCommissionAmount)} />
            <SummaryItem label="계산 합산 수수료" value={manualCommissionComparison(salesImport, rows) ? formatCurrency(manualCommissionComparison(salesImport, rows)!.total) : '조건 확인 필요'} />
            <SummaryItem label="계산 금액 − 업체 전달 금액" value={manualCommissionComparison(salesImport, rows)?.difference === undefined ? '확인 필요' : formatCurrency(manualCommissionComparison(salesImport, rows)!.difference!)} />
          </div>
          {salesImport.manualSettlement.sourceMessage && <p style={{ whiteSpace: 'pre-wrap' }}>{salesImport.manualSettlement.sourceMessage}</p>}
        </section>}

        {salesImport.fileAnalysis && <section className="sales-ai-card">
          <div className="checklist-head"><div><h3>파일 자동 인식 결과</h3><p>{salesImport.fileAnalysis.formatName} · {salesImport.fileAnalysis.sheetName} 시트 {salesImport.fileAnalysis.headerRow}행을 제목으로 인식했습니다.</p></div><StatusBadge label={salesImport.fileAnalysis.sourceDocumentType === 'supplier_settlement' ? '공급사 정산서 · 총매출 역산' : salesImport.fileAnalysis.sourceDocumentType === 'supplier_dispatch' ? '발주 합산 · 공급가 대조' : !shouldAskPendingPaymentPolicy(salesImport.fileAnalysis) ? '결제대기 없음' : salesImport.pendingPaymentPolicy === 'include' ? '결제대기 포함' : '결제대기 제외'} tone={salesImport.pendingPaymentPolicy === 'include' && shouldAskPendingPaymentPolicy(salesImport.fileAnalysis) ? 'warning' : 'complete'} /></div>
          <div className="sales-summary-grid">
            <SummaryItem label={salesImport.fileAnalysis.sourceDocumentType === 'supplier_settlement' ? '역산 고객 총매출' : salesImport.fileAnalysis.sourceDocumentType === 'supplier_dispatch' ? '판매가 연결 후 계산 매출' : '파일 전체 판매금액'} value={formatCurrency(salesImport.fileAnalysis.sourceGrossSales)} />
            <SummaryItem label={salesImport.fileAnalysis.sourceDocumentType === 'supplier_settlement' ? '공급사 확정 정산금' : '정산 반영 매출'} value={formatCurrency(salesImport.fileAnalysis.sourceDocumentType === 'supplier_settlement' ? salesImport.fileAnalysis.supplierSettlementAmount ?? 0 : salesImport.fileAnalysis.includedGrossSales)} />
            <SummaryItem label={salesImport.fileAnalysis.sourceDocumentType === 'supplier_settlement' ? '역산 셀러 수수료' : '제외 금액'} value={formatCurrency(salesImport.fileAnalysis.sourceDocumentType === 'supplier_settlement' ? salesImport.fileAnalysis.includedGrossSales - (salesImport.fileAnalysis.supplierSettlementAmount ?? 0) : salesImport.fileAnalysis.excludedGrossSales)} />
            <SummaryItem label="정산 반영 수량" value={`${salesImport.fileAnalysis.includedQuantity.toLocaleString('ko-KR')}개`} />
            <SummaryItem label={salesImport.fileAnalysis.sourceDocumentType === 'supplier_settlement' ? '적용 셀러 수수료율' : '파일 기재 공급가'} value={salesImport.fileAnalysis.sourceDocumentType === 'supplier_settlement' ? `${salesImport.fileAnalysis.sellerCommissionRateUsed ?? 0}%` : salesImport.fileAnalysis.supplyTotal === undefined ? '미인식' : formatCurrency(salesImport.fileAnalysis.supplyTotal)} />
            <SummaryItem label="파일 기재 차액" value={salesImport.fileAnalysis.declaredMargin === undefined ? '미인식' : formatCurrency(salesImport.fileAnalysis.declaredMargin)} />
          </div>
          {salesImport.fileAnalysis.dispatchSheets && <>
            <h4>발주 시트별 합산 내역</h4>
            <div className="comparison-table-wrap"><table className="comparison-table"><thead><tr><th>발주 시트</th><th>읽은 주문행</th><th>중복 제외 후 수량</th><th>중복 제외</th></tr></thead><tbody>{salesImport.fileAnalysis.dispatchSheets.map((item) => <tr key={item.sheetName}><td>{item.sheetName}</td><td>{item.rowCount}행</td><td>{item.quantity}개</td><td>{item.duplicateRowCount}행</td></tr>)}</tbody></table></div>
            {salesImport.fileAnalysis.finalSettlementQuantity !== undefined && <div className="sales-summary-grid">
              <SummaryItem label="최종정산 기재 수량" value={`${salesImport.fileAnalysis.finalSettlementQuantity}개`} />
              <SummaryItem label="정산 반영 수량과 차이" value={`${salesImport.fileAnalysis.includedQuantity - salesImport.fileAnalysis.finalSettlementQuantity}개`} />
              <SummaryItem label="공급사 청구 배송비" value={formatCurrency(salesImport.fileAnalysis.supplierShippingCost ?? 0)} />
              <SummaryItem label="공급가 + 배송비 합계" value={formatCurrency(salesImport.fileAnalysis.supplierPayableTotal ?? 0)} />
            </div>}
          </>}
          <p className="section-description">인식 열: {salesImport.fileAnalysis.detectedColumns.join(' · ')}</p>
          <div className="comparison-table-wrap"><table className="comparison-table"><thead><tr><th>{salesImport.fileAnalysis.sourceDocumentType === 'supplier_settlement' ? '발생 구분' : '주문 상태'}</th><th>수량</th><th>{salesImport.fileAnalysis.sourceDocumentType === 'supplier_settlement' ? '공급사 정산금액' : '금액'}</th><th>정산 반영</th></tr></thead><tbody>{salesImport.fileAnalysis.statusBreakdown.map((item) => <tr key={item.status}><td>{item.status}</td><td>{item.quantity.toLocaleString('ko-KR')}개</td><td>{formatCurrency(item.amount)}</td><td>{item.included ? '포함' : '제외'}</td></tr>)}</tbody></table></div>
          {salesImport.fileAnalysis.warnings.length > 0 && <ul>{salesImport.fileAnalysis.warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul>}
        </section>}

        {(settlementError || hasError) && <section className="inline-notice settlement-warning settlement-action-error" role="alert">
          <strong>{settlementError ? '정산 생성 실패' : `정산 생성 전 수정할 오류 ${errorMessages.length}건`}</strong>
          <span>{settlementError || errorMessages.join(' / ')}</span>
        </section>}

        <section className="sales-ai-card">
          <div className="checklist-head"><h3>판매 옵션과 연결된 상품·SKU</h3><button className="secondary-button" disabled={directEditLocked} onClick={() => onManualInput(salesImport)} type="button">상품·SKU 연결 수정</button></div>
          <p>파일의 옵션명과 연결 상품을 함께 확인하세요. 판매가가 같아도 다른 상품일 수 있습니다.</p>
          <div className="table-scroll"><table className="data-table"><thead><tr><th>판매 옵션</th><th>연결 상품·SKU</th><th>판매가</th></tr></thead><tbody>{rows.map((row) => <tr key={row.id}><td>{row.optionName}</td><td>{row.productName || '연결 확인 필요'}<small className="sku-match-meta">{row.skuOptionName || row.skuId || 'SKU 미연결'}</small>{row.detailOption && <small className="sku-match-meta">세부옵션: {row.detailOption}</small>}</td><td>{formatCurrency(row.unitPrice)}</td></tr>)}</tbody></table></div>
          {directEditLocked && <p>정산 관리에서 확정을 해제한 뒤 수정해주세요.</p>}
        </section>

        {salesImport.commissionCalculationType === 'campaign_total' && <section className="inline-notice" role="status"><strong>공구 총매출 공통 수수료 적용</strong><span>색상·사이즈·수량 할인 옵션은 매출 내역으로만 보존하고, 할인 반영 총매출에 공구 확정 수수료율을 한 번 적용합니다. SKU 이름 불일치는 정산을 막지 않습니다.</span></section>}

        {(salesImport.commissionSyncIssues?.length ?? 0) > 0 && <section className="sales-ai-card">
          <div className="checklist-head"><div><h3>SKU 연결 불일치 상세</h3><p>수량 할인 상품은 색상·사이즈가 아니라 주문에 실제 적용된 개당가격으로 수량 구간을 연결합니다.</p></div><StatusBadge label={`${salesImport.commissionSyncIssues?.length ?? 0}개 확인 필요`} tone="danger" /></div>
          <div className="comparison-table-wrap sku-matching-table"><table className="comparison-table"><thead><tr><th>정산서 옵션명</th><th>할인 후 실판매가</th><th>연결 후보</th><th>등록 가격 기준</th><th>가격 차이</th><th>판단</th><th>수정</th></tr></thead><tbody>
            {salesImport.commissionSyncIssues?.map((issue) => <SkuMatchRow allCandidates={searchableSkuCandidates} issue={issue} key={issue.rowId} productsError={matchProductsError} productsLoading={matchProductsLoading} salesImportId={salesImport.id} onMatched={() => { salesDataService.validateSalesData(salesImport.id); onSync() }} />)}
          </tbody></table></div>
          <p className="section-description">수량 구간의 실판매가가 일치하면 해당 구간으로 연결하세요. 가격이 다르면 색상 SKU를 새로 만들지 말고 상품 DB에 누락된 수량 구간을 먼저 추가해주세요.</p>
        </section>}

        {salesImport.fileAnalysis && salesImport.fileAnalysis.sourceDocumentType !== 'supplier_settlement' && <section aria-label="정산 수량 계산 과정" className="sales-quantity-flow">
          <div><span>파일 원본 수량</span><strong>{salesImport.fileAnalysis.sourceQuantity.toLocaleString('ko-KR')}개</strong></div>
          <b aria-hidden="true">−</b>
          <div><span>{salesImport.pendingPaymentPolicy === 'include' ? '결제대기 포함' : '결제대기 제외'}</span><strong>{salesImport.pendingPaymentPolicy === 'include' ? '0개' : `${salesImport.fileAnalysis.pendingPaymentQuantity.toLocaleString('ko-KR')}개`}</strong></div>
          <b aria-hidden="true">−</b>
          <div><span>취소·반품 제외</span><strong>{(totals.canceledQuantity + totals.refundedQuantity).toLocaleString('ko-KR')}개</strong></div>
          <b aria-hidden="true">=</b>
          <div className="is-result"><span>정산 순판매수량</span><strong>{totals.netQuantity.toLocaleString('ko-KR')}개</strong></div>
        </section>}

        <section className="sales-summary-grid">
          <SummaryItem label={salesImport.pendingPaymentPolicy === 'exclude' && (salesImport.fileAnalysis?.pendingPaymentQuantity ?? 0) > 0 ? '결제대기 제외 후 판매수량' : '총 판매수량'} value={`${totals.totalQuantity.toLocaleString('ko-KR')}개`} />
          <SummaryItem label="총매출" value={formatCurrency(totals.totalSalesAmount)} />
          <SummaryItem label={salesImport.fileAnalysis?.sourceDocumentType === 'supplier_settlement' ? '취소/반품 수량' : '취소수량'} value={`${totals.canceledQuantity.toLocaleString('ko-KR')}개`} />
          <SummaryItem label="환불수량" value={`${totals.refundedQuantity.toLocaleString('ko-KR')}개`} />
          <SummaryItem label="순판매수량" value={`${totals.netQuantity.toLocaleString('ko-KR')}개`} />
          <SummaryItem label="순매출" value={formatCurrency(totals.netSales)} />
          <SummaryItem label="총 수수료율" value={totalRateLabel} />
          <SummaryItem label="셀러 수수료율" value={sellerRateLabel} />
          <SummaryItem label="수수료 적용 기준" value={salesImport.commissionCalculationType === 'campaign_total' ? '공구 총매출 공통' : 'SKU별 적용'} />
          <SummaryItem label="예상 수수료" value={formatCurrency(totals.expectedCommission)} />
          <SummaryItem label="샘플비 차감 예정" value={formatCurrency(salesImport.sampleDeductionAmount ?? 0)} />
          <SummaryItem label="차감·조정 등록 합계" value={formatCurrency(getSalesEventCostTotal(salesImport))} />
          {isSrookPayCampaign && <SummaryItem label="스룩페이 수수료" value={salesImport.shippingRevenue === undefined ? '배송비 입력 필요' : formatCurrency(salesImport.srookPayActualFeeAmount ?? calculateSrookPayFee(totals.netSales, salesImport.shippingRevenue, srookPayFeeRate))} />}
          <SummaryItem label="회사 잔여 수수료 예상" value={formatCurrency(totals.companyRemainingCommission)} />
        </section>

        {!isSrookPayCampaign && salesImport.supplyAudience === 'vendor' && <section className="sales-ai-card sales-event-entry">
          <h3>벤더 정산 배송비</h3><p>상대방 링크로 판매한 경우 우리가 받을 배송비 합계를 입력합니다. 기본 배송비와 도서산간 추가비를 포함해주세요.</p>
          <label><input type="checkbox" checked={vendorShippingDetailed} disabled={directEditLocked} onChange={(event) => setVendorShippingDetailed(event.target.checked)} /> 배송비 세부 명세 입력</label>
          {vendorShippingDetailed ? <div className="sales-event-entry__grid">{vendorShippingDetails.map((row, index) => <div key={index} className="sales-ai-card"><strong>{row.label}</strong><label className="form-field"><span>{row.label} 건수</span><NumericInput type="number" min="0" disabled={directEditLocked} value={row.quantity} onChange={(event) => setVendorShippingDetails((items) => items.map((item, i) => i === index ? { ...item, quantity: Number(event.target.value) } : item))} /></label><label className="form-field"><span>{row.label} 단가</span><NumericInput type="number" min="0" disabled={directEditLocked} value={row.unitPrice} onChange={(event) => setVendorShippingDetails((items) => items.map((item, i) => i === index ? { ...item, unitPrice: Number(event.target.value) } : item))} /></label><p>{formatCurrency(row.quantity * row.unitPrice)}</p></div>)}<strong>배송비 합계: {formatCurrency(vendorShippingDetails.reduce((sum, row) => sum + row.quantity * row.unitPrice, 0))}</strong></div> : <label className="form-field"><span>받을 배송비 합계</span><NumericInput disabled={directEditLocked} min="0" type="number" value={srookPayDraft.shippingRevenue} onChange={(event) => { setSrookPayDraft((draft) => ({ ...draft, shippingRevenue: Number(event.target.value) })); setSrookPaySaveStatus(null) }} /></label>}

          <button className="primary-button" disabled={directEditLocked} onClick={() => void saveCounterpartyShipping()} type="button">{directEditLocked ? '정산서 확정 해제 후 수정 가능' : '벤더 배송비 저장'}</button>
          {srookPaySaveStatus && <p role="status">{srookPaySaveStatus.message}</p>}
        </section>}

        {isSrookPayCampaign && <section className="sales-ai-card sales-event-entry">
          <div className="checklist-head"><div><h3>스룩페이 결제 수수료</h3><p>기간별 매출의 정상금액과 구매총액을 입력하면 배송비(정상금액-구매총액)를 자동 계산합니다.</p></div><span className={`sales-event-entry__status ${salesImport.shippingRevenue !== undefined ? 'is-complete' : 'is-pending'}`}>{salesImport.shippingRevenue !== undefined ? '정산 기준 저장됨' : '기간 통계 입력 필요'}</span></div>
          {directEditLocked && <div className="inline-notice settlement-warning"><strong>확정 정산서 · 수정 잠김</strong><span>정산 관리에서 `확정 해제` 후 배송비 또는 실제 차감액을 수정할 수 있습니다.</span></div>}
          <div className="sales-event-entry__grid">
            <label className="form-field"><span>기간 통계 정상금액</span><NumericInput disabled={directEditLocked} min="0" onChange={(event) => { const normalAmount = Number(event.target.value); setSrookPayDraft((draft) => ({ ...draft, normalAmount, shippingRevenue: Math.max(normalAmount - draft.purchaseAmount, 0) })); setSrookPaySaveStatus(null) }} type="number" value={srookPayDraft.normalAmount} /></label>
            <label className="form-field"><span>기간 통계 구매총액</span><NumericInput disabled={directEditLocked} min="0" onChange={(event) => { const purchaseAmount = Number(event.target.value); setSrookPayDraft((draft) => ({ ...draft, purchaseAmount, shippingRevenue: Math.max(draft.normalAmount - purchaseAmount, 0) })); setSrookPaySaveStatus(null) }} type="number" value={srookPayDraft.purchaseAmount} /></label>
            <label className="form-field"><span>자동 계산 배송비</span><input disabled readOnly value={srookPayDraft.shippingRevenue} /></label>
            <label className="form-field"><span>수수료율(VAT 포함)</span><input disabled readOnly value={`${srookPayFeeRate}%`} /></label>
            <label className="form-field"><span>자동 계산 수수료</span><input disabled readOnly value={srookPayEstimatedFee} /></label>
            <label className="form-field"><span>스룩페이 실제 차감액 (선택)</span><NumericInput disabled={directEditLocked} min="0" onChange={(event) => { setSrookPayDraft((draft) => ({ ...draft, actualFee: event.target.value })); setSrookPaySaveStatus(null) }} placeholder="비우면 자동 계산액 적용" type="number" value={srookPayDraft.actualFee} /></label>
            <button className="primary-button" disabled={directEditLocked} onClick={() => void saveSrookPayCost()} type="button">{directEditLocked ? '확정 해제 후 수정 가능' : '스룩페이 비용 저장'}</button>
          </div>
          <p className="section-description">배송비는 주문 상세 엑셀의 배송비 열을 합산하지 않습니다. 정산 반영액: {formatCurrency(srookPayDraft.actualFee.trim() === '' ? srookPayEstimatedFee : Number(srookPayDraft.actualFee))} · 실제 차감액을 입력하면 자동 계산액보다 우선합니다.</p>
          {srookPaySaveStatus && <span className={`sales-event-entry__save-status is-${srookPaySaveStatus.tone}`}>{srookPaySaveStatus.message}</span>}
        </section>}

        <section className="sales-ai-card sales-event-entry">
          <div className="checklist-head"><div><h3>차감·지급내역</h3><p>샘플비도 품목·단가·수량·부담 주체를 지정해 입력할 수 있습니다. 차감내역은 정산금에서 빼고, 지급내역은 선택한 대상의 정산금에 더합니다. 샘플관리에서 등록한 비용과 중복 입력하지 마세요.</p></div><div className="sales-event-entry__heading-actions"><span>{eventDrafts.length}건 · {formatCurrency(eventDrafts.reduce((sum, event) => sum + Math.max(event.amount, 0), 0))}</span><button className="secondary-button" disabled={directEditLocked} onClick={() => { setEventDrafts((events) => [...events, createEventCostDraft()]); setEventSaveStatus(null) }} type="button">+ 차감내역 추가</button><button className="secondary-button" disabled={directEditLocked} onClick={() => { setEventDrafts(events => [...events, createEventCostDraft('payment')]); setEventSaveStatus(null) }} type="button">+ 지급내역 추가</button></div></div>
          {directEditLocked && <div className="inline-notice settlement-warning"><strong>확정 정산서 · 수정 잠김</strong><span>정산 관리에서 `확정 해제` 후 이벤트를 추가·수정·삭제할 수 있습니다.</span></div>}
          <div className="sales-event-entry__list">
            {[...eventDrafts].sort((a,b)=>Number(a.direction === 'payment')-Number(b.direction === 'payment') || ['seller','company','manager','brand','company_manager_prepaid'].indexOf(a.owner)-['seller','company','manager','brand','company_manager_prepaid'].indexOf(b.owner)).map((event, index) => {
              const savedEvent = savedEventCosts.find((item) => item.id === event.id)
              const isSaved = Boolean(savedEvent && savedEvent.name === event.name.trim() && savedEvent.amount === Math.max(Math.round(event.amount), 0) && savedEvent.owner === event.owner)
              const deduction = settlementEventDeductions.find((item) => item.id === eventDeductionId(salesImport.id, event.id))
              const isReflected = Boolean(isSaved && deduction && deduction.title === event.name.trim() && deduction.amount === Math.max(Math.round(event.amount), 0) && deduction.costOwner === (event.owner === 'company_manager_prepaid' ? 'company' : event.owner) && (event.owner !== 'company_manager_prepaid' || deduction.applyLocation === 'manager_reimbursement'))
              const status = !isSaved ? '저장 전' : !linkedSettlement ? '정산서 생성 시 반영' : isReflected ? (event.owner === 'brand' ? '정산 기록 완료' : directEditLocked ? '확정 정산서 반영 완료' : '정산 반영 완료') : '정산 미반영'
              return <article className="sales-event-entry__item" key={event.id}>
                <div className="sales-event-entry__item-head"><strong>{event.direction === 'payment' ? '지급내역' : event.owner === 'company_manager_prepaid' ? '회사 부담 · 매니저 선지급 환급' : '차감내역'} {index + 1}</strong><span className={`sales-event-entry__status ${isReflected || (!linkedSettlement && isSaved) ? 'is-complete' : !isSaved ? 'is-pending' : 'is-warning'}`}>{status}</span></div>
                <div className="sales-event-entry__grid"><label className="form-field"><span>품목</span><input disabled={directEditLocked} placeholder="예: HEPA 필터 1개입" value={event.name} onChange={(change) => updateEventDraft(event.id, { name: change.target.value })} /></label><label className="form-field"><span>적용 단가</span><NumericInput disabled={directEditLocked} min="0" type="number" value={event.unitPrice ?? event.amount} onChange={(change) => updateEventDraft(event.id, { unitPrice: Number(change.target.value) })} /></label><label className="form-field"><span>인원/수량</span><NumericInput disabled={directEditLocked} min="0" type="number" value={event.quantity ?? 1} onChange={(change) => updateEventDraft(event.id, { quantity: Number(change.target.value) })} /></label><label className="form-field"><span>회사 실제원가 · 선택</span><NumericInput disabled={directEditLocked || event.direction === 'payment'} min="0" placeholder="공급가 차이 계산 시" type="number" value={event.companyUnitCost ?? ''} onChange={(change) => updateEventDraft(event.id, { companyUnitCost: change.target.value === '' ? undefined : Number(change.target.value) })} /></label><label className="form-field"><span>공급사 지원율(%)</span><NumericInput disabled={directEditLocked || event.direction === 'payment'} min="0" max="100" type="number" value={event.supplierSupportRate ?? 0} onChange={(change) => updateEventDraft(event.id, { supplierSupportRate: Number(change.target.value) })} /></label><label className="form-field"><span>정산 반영액</span><input disabled readOnly value={`${event.direction === 'payment' ? '+' : '−'} ${event.amount.toLocaleString('ko-KR')}`} /></label><label className="form-field"><span>{event.direction === 'payment' ? '지급 대상' : '부담 주체'}</span><select disabled={directEditLocked} value={event.owner} onChange={(change) => updateEventDraft(event.id, { owner: change.target.value as SalesEventCost['owner'] })}>{event.direction === 'payment' ? <><option value="seller">셀러</option><option value="company">회사</option><option value="manager">매니저</option></> : <><option value="seller">셀러 부담 · 셀러 지급액에서 차감</option><option value="company">{event.direction ? '회사 부담 · 배분 전 차감' : '회사 부담 · 배분 전 차감'}</option><option value="manager">매니저 부담 · 매니저 지급액에서 차감</option><option value="company_manager_prepaid">회사 부담(매니저 선지급) · 매니저 정산금에 가산</option><option value="brand">공급사 부담 · 기록 후 공급사 정산에서 반영</option></>}</select></label><button className="secondary-button sales-event-entry__remove" disabled={directEditLocked} onClick={() => removeEventDraft(event.id)} type="button">삭제</button></div>
              </article>
            })}
            {!eventDrafts.length && <div className="sales-event-entry__empty">등록된 차감·조정내역이 없습니다.</div>}
          </div>
          <div className="sales-event-entry__footer"><button className="primary-button" disabled={directEditLocked} onClick={() => void saveEventCosts()} type="button">{directEditLocked ? '확정 해제 후 수정 가능' : '차감·지급내역 전체 저장'}</button>{eventSaveStatus && <span className={`sales-event-entry__save-status is-${eventSaveStatus.tone}`}>{eventSaveStatus.message}</span>}</div>
        </section>

        <section className="sales-ai-card">
          <div className="checklist-head"><div><h3>판매 데이터 검증</h3><p>자동 인식된 합계와 Campaign 조건의 불일치를 확인합니다.</p></div></div>
          <div className={`sales-total-check ${salesAmountMatches ? 'is-match' : 'is-mismatch'}`}>
            <div className="sales-total-check__status"><strong>{salesAmountMatches ? '✅ 총매출 일치' : '⚠️ 총매출 불일치'}</strong><span>{salesAmountMatches ? '판매행 합계와 정산 반영 기준 금액이 같습니다.' : '차이 금액을 확인한 뒤 정산을 확정해주세요.'}</span></div>
            <dl>
              <div><dt>{totals.canceledQuantity > 0 || totals.refundedQuantity > 0 ? '판매행 순매출 합계' : '판매행 계산 합계'}</dt><dd>{formatCurrency(calculatedReferenceSalesAmount)}</dd></div>
              <div><dt>{salesImport.fileAnalysis ? '파일 정산 반영 매출' : '등록된 기준 총매출'}</dt><dd>{formatCurrency(referenceSalesAmount)}</dd></div>
              <div><dt>차이</dt><dd>{formatCurrency(Math.abs(salesAmountDifference))}</dd></div>
            </dl>
          </div>
          <ul>{analysis.messages.map((message) => <li key={message}>{message}</li>)}</ul>
          <div className="action-row">
            <button className="primary-button sku-reconnect-button" disabled={syncingSku || !!salesImport.settlementTerms} onClick={() => void reconnectSkuRates()} type="button">{salesImport.settlementTerms ? '저장된 공구 조건 적용 중' : syncingSku ? 'SKU·수수료 연결 중…' : 'SKU·수수료 다시 연결'}</button>
            <button className={`secondary-button ${showErrorsOnly ? 'is-active' : ''}`} onClick={() => setShowErrorsOnly((value) => !value)} type="button">{showErrorsOnly ? '전체 판매행 보기' : `오류 판매행만 보기 (${rows.filter((row) => row.validationStatus === 'error').length})`}</button>
          </div>
          {skuSyncResult && <div className={`sku-sync-result is-${skuSyncResult.tone}`} role="status">{skuSyncResult.message}</div>}
        </section>

        <div className="sales-row-table-heading">
          <div><h3>판매 수량·정산 조건</h3><p>옵션별 판매수량, 취소·반품, 판매가와 수수료율을 직접 수정할 수 있습니다.</p></div>
          <button className="secondary-button" disabled={directEditLocked} onClick={() => onManualInput(salesImport)} title={directEditLocked ? '확정된 정산서는 정산 관리에서 확정을 해제한 후 수정할 수 있습니다.' : undefined} type="button">{directEditLocked ? '확정 해제 후 수정 가능' : '판매 수량·조건 수정'}</button>
        </div>
        <section className="comparison-table-wrap">
          <table className="comparison-table sales-row-table">
            <thead><tr><th>옵션명</th><th>{salesImport.pendingPaymentPolicy === 'exclude' && (salesImport.fileAnalysis?.pendingPaymentQuantity ?? 0) > 0 ? '결제대기 제외 후 판매수량' : '판매수량'}</th><th>판매가</th><th>총매출</th><th>{salesImport.fileAnalysis?.sourceDocumentType === 'supplier_settlement' ? '취소/반품 수량' : '취소수량'}</th><th>환불수량</th><th>순판매수량</th><th>순매출</th><th>검증 상태</th><th>검증 메시지</th></tr></thead>
            <tbody>
              {rows.filter((row) => !showErrorsOnly || row.validationStatus === 'error').map((row) => (
                <tr key={row.id}><td>{row.optionName}</td><td>{row.quantity}</td><td>{formatCurrency(row.unitPrice)}</td><td>{formatCurrency(row.grossSales)}</td><td>{row.canceledQuantity}</td><td>{row.refundedQuantity}</td><td>{row.netQuantity}</td><td>{formatCurrency(row.netSales)}</td><td>{row.validationStatus === 'valid' ? '✅ 정상' : row.validationStatus === 'warning' ? '⚠️ 확인' : '오류'}</td><td>{row.validationMessage}</td></tr>
              ))}
              {showErrorsOnly && !rows.some((row) => row.validationStatus === 'error') && <tr><td colSpan={10}>오류가 있는 판매행이 없습니다.</td></tr>}
            </tbody>
            <tfoot>
              <tr className="sales-row-total"><th>전체 합계</th><td>{totals.totalQuantity.toLocaleString('ko-KR')}개</td><td>-</td><td>{formatCurrency(totals.totalSalesAmount)}</td><td>{totals.canceledQuantity.toLocaleString('ko-KR')}개</td><td>{totals.refundedQuantity.toLocaleString('ko-KR')}개</td><td>{totals.netQuantity.toLocaleString('ko-KR')}개</td><td>{formatCurrency(totals.netSales)}</td><td colSpan={2}>총매출 · 순매출 합계</td></tr>
            </tfoot>
          </table>
        </section>

        <div className="preview-drawer__actions">
          {settlementError && <div className="inline-notice settlement-warning settlement-action-error"><strong>정산 생성 실패</strong><span>{settlementError}</span></div>}
          {settlementCreated && <div className="settlement-success-notice" role="status">
            <div><strong>✅ 정산 확정 완료</strong><span>정산서가 생성되었습니다. 정산 관리에서 이어서 확인할 수 있습니다.</span></div>
            <a className="secondary-button" href={createdSettlementId ? `/settlements/${encodeURIComponent(createdSettlementId)}` : '/settlements'}>정산서 확인</a>
          </div>}
          <button className={`primary-button settlement-create-button${settlementCreated ? ' is-complete' : ''}`} disabled={settlementCreated || creatingSettlement} onClick={() => void confirmAndCreateSettlement()} type="button">{creatingSettlement ? '정산 확정 중…' : settlementCreated ? '✅ 정산 확정 완료' : '판매 데이터 확정 · 정산 생성'}</button>
          <button className="secondary-button" onClick={() => openCampaignDetail(salesImport.campaignId, 'sales')} type="button">공동구매 상세 보기</button>
        </div>
      </section>
  )
}

function SkuMatchRow({ issue, salesImportId, allCandidates, productsLoading, productsError, onMatched }: { issue: CommissionSyncIssue; salesImportId: string; allCandidates: CommissionSyncSuggestion[]; productsLoading: boolean; productsError: string; onMatched: () => void }) {
  const [selectedSkuId, setSelectedSkuId] = useState(issue.suggestions[0]?.skuId ?? '')
  const [matching, setMatching] = useState(false)
  const [creatingSku, setCreatingSku] = useState(false)
  const [matchError, setMatchError] = useState('')
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const selectedCandidate = issue.suggestions.find((item) => item.skuId === selectedSkuId)
    ?? allCandidates.find((item) => item.skuId === selectedSkuId)
    ?? issue.suggestions[0]
  const selected = selectedCandidate ? {
    ...selectedCandidate,
    priceMatched: Math.round(issue.unitPrice) === Math.round(selectedCandidate.groupBuyPrice),
  } : undefined
  const dropdownCandidates = selected && !issue.suggestions.some((item) => item.skuId === selected.skuId)
    ? [selected, ...issue.suggestions]
    : issue.suggestions
  const normalizedQuery = searchQuery.trim().toLocaleLowerCase('ko-KR').replace(/\s+/g, '')
  const searchResults = normalizedQuery ? allCandidates.filter((candidate) => `${candidate.brandName} ${candidate.productName} ${candidate.optionName}`
    .toLocaleLowerCase('ko-KR').replace(/\s+/g, '').includes(normalizedQuery)).slice(0, 30) : []
  const isQuantityTier = selected?.pricingType === 'quantity_tier'
  const quantityTierLabel = selected && isQuantityTier
    ? selected.maximumQuantity
      ? `${selected.minimumQuantity ?? 1}~${selected.maximumQuantity}개 구매 시`
      : `${selected.minimumQuantity ?? 1}개 이상 구매 시`
    : '고정가'
  const match = async () => {
    if (!selected) return
    setMatching(true)
    setMatchError('')
    try {
      await manuallyMatchSalesRow(salesImportId, issue.rowId, selected.skuId)
      await cloudSyncService.syncKeys([STORAGE_KEYS.salesDataImports, STORAGE_KEYS.salesDataRows])
      onMatched()
    } catch (error) {
      setMatchError(error instanceof Error ? error.message : '구성을 연결하지 못했습니다.')
    } finally { setMatching(false) }
  }
  const priceDifference = selected ? selected.groupBuyPrice - issue.unitPrice : 0
  const createVariant = async () => {
    if (!selected) return
    setCreatingSku(true)
    setMatchError('')
    try {
      await createSkuFromSalesRow(salesImportId, issue.rowId, selected.skuId)
      onMatched()
    } catch (error) {
      setMatchError(error instanceof Error ? error.message : '새 구성을 등록하지 못했습니다.')
    } finally { setCreatingSku(false) }
  }
  return <tr><td><strong>{issue.salesOptionName || '(빈 옵션명)'}</strong></td><td><strong className="sku-price-value">{formatCurrency(issue.unitPrice)}</strong><small className="sku-match-meta">주문별 할인 반영 금액 ÷ 주문수량</small></td><td>{dropdownCandidates.length ? <><select className="sku-match-select" value={selected?.skuId ?? ''} onChange={(event) => setSelectedSkuId(event.target.value)}>{dropdownCandidates.map((candidate) => <option key={candidate.skuId} value={candidate.skuId}>{candidate.productName} · {candidate.optionName}</option>)}</select>{selected && <small className="sku-match-meta">{selected.brandName}<br />총 {selected.totalCommissionRate.toFixed(1)}% · 셀러 {selected.sellerCommissionRate.toFixed(1)}% · 회사 {selected.companyCommissionRate.toFixed(1)}%</small>}</> : <span className="sku-match-meta">자동 추천 상품이 없습니다.</span>}<button aria-expanded={searchOpen} className="sku-product-search-toggle" onClick={() => setSearchOpen((open) => !open)} type="button">{searchOpen ? '상품 검색 닫기' : '다른 상품 검색'}</button>{searchOpen && <div className="sku-product-search"><label><span className="sr-only">브랜드, 상품 또는 SKU 옵션 검색</span><input autoFocus onChange={(event) => setSearchQuery(event.target.value)} placeholder="예: 엑스쿠첸, 저압냄비, 4L" type="search" value={searchQuery} /></label>{productsLoading ? <p>제품DB를 불러오고 있습니다.</p> : productsError ? <p className="field-error">{productsError}</p> : !normalizedQuery ? <p>브랜드명, 상품명 또는 옵션명을 입력하세요.</p> : searchResults.length ? <div className="sku-product-search__results">{searchResults.map((candidate) => <button key={candidate.skuId} onClick={() => { setSelectedSkuId(candidate.skuId); setSearchOpen(false); setSearchQuery('') }} type="button"><strong>{candidate.brandName} · {candidate.productName}</strong><span>{candidate.optionName} · {formatCurrency(candidate.groupBuyPrice)}</span></button>)}</div> : <p>일치하는 등록 상품이 없습니다.</p>}</div>}</td><td>{selected ? <><strong className="sku-price-value sku-price-value--registered">{formatCurrency(selected.groupBuyPrice)}</strong><small className="sku-match-meta">{quantityTierLabel}</small></> : '-'}</td><td>{selected ? <strong className={priceDifference === 0 ? 'sku-price-difference is-same' : 'sku-price-difference is-different'}>{priceDifference === 0 ? '동일' : `${priceDifference > 0 ? '+' : ''}${formatCurrency(priceDifference)}`}</strong> : '-'}</td><td>{selected ? isQuantityTier ? selected.priceMatched ? `${quantityTierLabel} 구간과 실판매가 일치` : `${quantityTierLabel} 후보지만 실판매가 불일치` : selected.similarity > 0 ? `${selected.priceMatched ? '판매가 일치 · ' : ''}이름 ${selected.similarity}% 유사` : '직접 검색해 선택한 상품' : '직접 확인 필요'}</td><td><div className="sku-match-actions">{selected ? <>{isQuantityTier ? <button className="primary-button" disabled={matching || creatingSku || !selected.priceMatched} onClick={() => void match()} type="button">{matching ? '적용 중' : selected.priceMatched ? '이 수량 구간으로 연결' : '가격 구간 불일치'}</button> : <><button className="primary-button" disabled={matching || creatingSku} onClick={() => void match()} type="button">{matching ? '적용 중' : '선택한 상품·SKU로 연결'}</button><button className="secondary-button sku-create-variant-button" disabled={matching || creatingSku} onClick={() => void createVariant()} type="button">{creatingSku ? '등록 중' : '선택 상품에 새 SKU 등록'}</button></>}<a className="secondary-button" href={`/master/products/${encodeURIComponent(selected.productId)}`}>등록 상품 확인</a></> : <a className="secondary-button" href="/master/products">상품 DB에서 찾기</a>}{matchError && <small className="field-error">{matchError}</small>}</div></td></tr>
}

function SummaryItem({ label, value }: { label: string; value: string }) {
  return <div className="sales-summary-item"><span>{label}</span><strong>{value}</strong></div>
}

function ManualSalesDataModal({ salesImport, rows, onClose, onSave }: { salesImport: SalesDataImport | null; rows: SalesDataRow[]; onClose: () => void; onSave: () => void }) {
  const [supplyAudience, setSupplyAudience] = useState<'seller' | 'vendor'>(salesImport?.supplyAudience ?? campaignService.getCampaignById(salesImport?.campaignId ?? '')?.supplyAudience ?? 'seller')
  const [vendorName, setVendorName] = useState(salesImport?.settlementVendorName ?? campaignService.getCampaignById(salesImport?.campaignId ?? '')?.settlementVendorName ?? '')
  const [vendorTerms, setVendorTerms] = useState(() => storageService.getItem<Array<{vendor: string; skuId: string; rate: number; updatedAt: string}>>(STORAGE_KEYS.vendorSkuTerms, []))
  const [draftRows, setDraftRows] = useState(() => rows.length ? rows : [])
  const [selectedManualRows, setSelectedManualRows] = useState<string[]>([])
  const [bulkSellerRate, setBulkSellerRate] = useState('20')
  const [rateDraft, setRateDraft] = useState({ total: salesImport?.totalCommissionRate?.toString() ?? '', seller: (salesImport?.sellerCommissionRate ?? salesImport?.commissionRate)?.toString() ?? '' })
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [manualChannel, setManualChannel] = useState<CampaignSalesChannelType | ''>(() => campaignChannel(campaignService.getCampaignById(salesImport?.campaignId ?? ''), salesImport ?? undefined) ?? '')
  const [manualAuthor, setManualAuthor] = useState<SettlementDocumentAuthor | ''>(salesImport?.documentAuthor ?? (campaignChannel(campaignService.getCampaignById(salesImport?.campaignId ?? ''), salesImport ?? undefined) === 'wise_shop_link' ? 'company' : 'supplier'))
  const [reportEnabled, setReportEnabled] = useState(Boolean(salesImport?.manualSettlement) || rows.length === 0)
  const [reportedAmount, setReportedAmount] = useState(salesImport?.manualSettlement?.reportedCommissionAmount === undefined ? '' : String(salesImport.manualSettlement.reportedCommissionAmount - (salesImport.manualSettlement.reportedOffsetAmount ?? 0)))
  const [quantityBasis, setQuantityBasis] = useState<'net' | 'gross'>(salesImport?.manualSettlement?.quantityBasis ?? (rows.length ? 'gross' : 'net'))
  const [sourceMessage, setSourceMessage] = useState(salesImport?.manualSettlement?.sourceMessage ?? '')
  const [products, setProducts] = useState<ProductMaster[]>([])
  const [productId, setProductId] = useState('')
  const [skuId, setSkuId] = useState('')
  const [skuSearch, setSkuSearch] = useState('')
  const [pickerExpanded, setPickerExpanded] = useState(rows.length === 0)
  const [catalogError, setCatalogError] = useState('')
  const [catalogLoading, setCatalogLoading] = useState(true)
  const [offsetAmount, setOffsetAmount] = useState(salesImport?.manualSettlement?.reportedOffsetAmount ?? 0)
  const [shippingDetails, setShippingDetails] = useState(() => salesImport?.shippingDetails?.length
    ? salesImport.shippingDetails
    : salesImport?.shippingRevenue
      ? [{ label: '배송비', quantity: 1, unitPrice: salesImport.shippingRevenue }]
      : [{ label: '기본택배비', quantity: 0, unitPrice: 3000 }, { label: '도서산간비', quantity: 0, unitPrice: 3000 }])
  const [shippingDetailsTouched, setShippingDetailsTouched] = useState(false)
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(`manual-settlement-draft:${salesImport?.id}`)
      if (!raw) return
      const saved = JSON.parse(raw)
      setSupplyAudience(saved.supplyAudience ?? salesImport?.supplyAudience ?? campaignService.getCampaignById(salesImport?.campaignId ?? '')?.supplyAudience ?? 'seller'); setVendorName(saved.vendorName ?? salesImport?.settlementVendorName ?? campaignService.getCampaignById(salesImport?.campaignId ?? '')?.settlementVendorName ?? ''); setDraftRows(saved.draftRows); setRateDraft(saved.rateDraft)
      setManualChannel(saved.manualChannel); setManualAuthor(saved.manualAuthor)
      setReportEnabled(saved.reportEnabled); setReportedAmount(saved.reportedAmount)
      setQuantityBasis(saved.quantityBasis); setSourceMessage(saved.sourceMessage); setOffsetAmount(saved.offsetAmount)
      if (saved.shippingDetails) setShippingDetails(saved.shippingDetails)
      setShippingDetailsTouched(Boolean(saved.shippingDetailsTouched))
    } catch { /* Keep the current source if a draft cannot be restored. */ }
  }, [])


  useEffect(() => {
    let active = true
    void productService.listProducts().then((items) => {
      if (!active) return
      setProducts(items.filter((item) => item.active))
      const campaign = campaignService.getCampaignById(salesImport?.campaignId ?? '')
      setProductId(items.find((item) => item.id === campaign?.productId || campaign?.campaignProducts?.some((link) => link.productId === item.id))?.id ?? '')
      const conditions = getUploadConditions(items, campaign, salesImport ?? undefined)
      const linked = conditions.all.filter((item) => conditions.candidates.some((candidate) => candidate.skuId === item.skuId))
      if (salesImport) setDraftRows((current) => current.length ? current : linked.map((condition) => ({ ...calculateSalesRow({
        ...condition, id: crypto.randomUUID(), salesDataImportId: salesImport.id, campaignId: salesImport.campaignId,
        optionName: condition.optionName || condition.productName, quantity: 0, unitPrice: condition.groupBuyPrice,
        agreedUnitPrice: condition.groupBuyPrice, priceSource: 'sku', canceledQuantity: 0, refundedQuantity: 0,
      }), sellerCommissionRate: supplyAudience === 'vendor' ? (vendorTerms.find((term) => term.vendor === vendorName.trim() && term.skuId === condition.skuId)?.rate ?? items.find((product) => product.supplyAudience === 'vendor' && product.settlementVendorName === vendorName.trim() && product.skus.some((sku) => sku.id === condition.skuId))?.skus.find((sku) => sku.id === condition.skuId)?.sellerCommissionRate) : condition.sellerCommissionRate })))
      setCatalogLoading(false)
    }).catch(() => { if (active) { setCatalogLoading(false); setCatalogError('등록 상품을 불러오지 못했습니다. 직접 입력하거나 창을 다시 열어주세요.') } })
    return () => { active = false }
  }, [salesImport?.campaignId])
  if (!salesImport) return null
  const preparedRows = draftRows.map((row) => calculateSalesRow({ ...row,
    canceledQuantity: reportEnabled && quantityBasis === 'net' ? 0 : row.canceledQuantity,
    refundedQuantity: reportEnabled && quantityBasis === 'net' ? 0 : row.refundedQuantity,
  }))
  const activeShippingDetails = shippingDetails.filter((item) => item.quantity > 0).map((item) => ({ ...item, label: item.label.trim(), quantity: Math.round(item.quantity), unitPrice: Math.round(item.unitPrice) }))
  const shippingTotal = activeShippingDetails.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0)
  const preparedImport = { ...salesImport, supplyAudience, settlementVendorName: supplyAudience === 'vendor' ? vendorName.trim() : undefined,
    documentAuthor: manualAuthor || undefined, documentKind: reportEnabled ? 'combined_commission' as const : salesImport.documentKind,
    commissionCalculationType: draftRows.some((row) => row.settlementSupplyPrice !== undefined) ? 'sku' as const : salesImport.commissionCalculationType,
    totalCommissionRate: rateDraft.total === '' ? undefined : Number(rateDraft.total),
    sellerCommissionRate: rateDraft.seller === '' ? undefined : Number(rateDraft.seller),
    commissionRate: rateDraft.seller === '' ? undefined : Number(rateDraft.seller),
    ...(shippingDetailsTouched ? { shippingDetails: activeShippingDetails.length ? activeShippingDetails : undefined, shippingRevenue: shippingTotal } : {}),
    manualSettlement: reportEnabled ? { amountType: 'seller_vendor_commission' as const,
      reportedCommissionAmount: reportedAmount.trim() === '' ? undefined : Number(reportedAmount.replace(/,/g, '')) + offsetAmount,
      quantityBasis, sourceMessage, reportedOffsetAmount: offsetAmount } : undefined,
  }
  const comparison = manualCommissionComparison(preparedImport, preparedRows)
  const campaign = campaignService.getCampaignById(salesImport.campaignId)
  const resolveAudienceRate = (skuId: string, audience = supplyAudience, vendor = vendorName) => {
    if (audience === 'vendor') {
      const dedicated = products.find((item) => item.supplyAudience === 'vendor' && item.settlementVendorName === vendor.trim() && item.skus.some((sku) => sku.id === skuId))
      return vendorTerms.find((term) => term.vendor === vendor.trim() && term.skuId === skuId)?.rate ?? dedicated?.skus.find((sku) => sku.id === skuId)?.sellerCommissionRate
    }
    const product = products.find((item) => item.skus.some((sku) => sku.id === skuId))
    return product?.skus.find((sku) => sku.id === skuId)?.sellerCommissionRate ?? product?.sellerCommissionRate
  }
  const changeAudience = (audience: 'seller' | 'vendor', vendor: string) => {
    setSupplyAudience(audience); setVendorName(vendor)
    setRateDraft((current) => ({ ...current, seller: '' }))
    setDraftRows((current) => current.map((row) => ({ ...row, sellerCommissionRate: row.skuId ? resolveAudienceRate(row.skuId, audience, vendor) : undefined })))
  }
  const saveVendorTerms = async () => {
    try {
      if (!vendorName.trim()) throw new Error('정산 벤더명을 입력해주세요.')
      if (!draftRows.length || draftRows.some((row) => !row.skuId || row.sellerCommissionRate === undefined || !Number.isFinite(row.sellerCommissionRate) || row.sellerCommissionRate < 0 || row.sellerCommissionRate > 100)) throw new Error('모든 SKU의 벤더 수수료를 입력해주세요.')
      const vendor = vendorName.trim()
      const entries = draftRows.map((row) => ({vendor, skuId: row.skuId!, rate: row.sellerCommissionRate!, updatedAt: new Date().toISOString()}))
      const latest = storageService.getItem<typeof vendorTerms>(STORAGE_KEYS.vendorSkuTerms, [])
      const next = [...latest.filter((term) => !entries.some((entry) => entry.vendor === term.vendor && entry.skuId === term.skuId)), ...entries]
      storageService.setItem(STORAGE_KEYS.vendorSkuTerms, next)
      await cloudSyncService.syncKeys([STORAGE_KEYS.vendorSkuTerms])
      setVendorTerms(next); setSaveError('벤더별 SKU 조건 저장 완료. 다음 선택부터 자동 적용됩니다. 기존 정산은 변경하지 않습니다.')
    } catch(error) { setSaveError(error instanceof Error ? error.message : '벤더 조건 저장 실패') }
  }
  const addSku = (selectedProductId = productId, selectedSkuId = skuId) => {
    const product = products.find((item) => item.id === selectedProductId)
    if (!product || !product.active) return
    const skus = product.skus.filter((sku) => sku.active && (selectedSkuId === '*' || sku.id === selectedSkuId))
    setDraftRows((current) => [...current, ...skus.filter((sku) => !current.some((row) => row.skuId === sku.id)).map((sku) => ({ ...calculateSalesRow({
      id: crypto.randomUUID(), skuId: sku.id, productId: product.id, productName: `[${product.productName}] ${sku.productName || sku.optionName}`, agreedUnitPrice: sku.groupBuyPrice, salesDataImportId: salesImport.id, campaignId: salesImport.campaignId,
      optionName: sku.optionName || sku.productName || product.productName, quantity: 0, unitPrice: sku.groupBuyPrice,
      canceledQuantity: 0, refundedQuantity: 0, totalCommissionRate: sku.totalCommissionRate ?? product.totalCommissionRate,
      sellerCommissionRate: resolveAudienceRate(sku.id),
    }), sellerCommissionRate: resolveAudienceRate(sku.id) }))])
    setSkuId('')
  }

  const updateRow = (id: string, key: keyof SalesDataRow, value: string) => {
    setDraftRows((current) => current.map((row) => {
      if (row.id !== id) return row
      const next = { ...row, [key]: key === 'optionName' ? value : (key === 'totalCommissionRate' || key === 'sellerCommissionRate') && value === '' ? undefined : Number(value || 0) }
      if (key === 'totalCommissionRate') next.settlementSupplyPrice = undefined
      if (key === 'unitPrice' && next.settlementSupplyPrice !== undefined && next.unitPrice > 0) next.totalCommissionRate = (next.unitPrice - next.settlementSupplyPrice) / next.unitPrice * 100
      return { ...calculateSalesRow({
        ...next,
        skuId: next.skuId,
        id: next.id,
        salesDataImportId: next.salesDataImportId,
        campaignId: next.campaignId,
        optionName: next.optionName,
        quantity: next.quantity,
        unitPrice: next.unitPrice,
        canceledQuantity: next.canceledQuantity,
        refundedQuantity: next.refundedQuantity,
        totalCommissionRate: next.totalCommissionRate,
        sellerCommissionRate: next.sellerCommissionRate,
      }), sellerCommissionRate: next.sellerCommissionRate }
    }))
  }

  const updateSettlementSupplyPrice = (id: string, value: string) => {
    setDraftRows((current) => current.map((row) => {
      if (row.id !== id) return row
      if (value === '') return { ...row, settlementSupplyPrice: undefined }
      const supplyPrice = Math.max(Math.round(Number(value || 0)), 0)
      const totalCommissionRate = row.unitPrice > 0 ? (row.unitPrice - supplyPrice) / row.unitPrice * 100 : row.totalCommissionRate
      return { ...row, settlementSupplyPrice: supplyPrice, totalCommissionRate }
    }))
  }

  const updateShippingDetail = (index: number, patch: Partial<{ label: string; quantity: number; unitPrice: number }>) => {
    setShippingDetailsTouched(true)
    setShippingDetails((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item))
  }

  const addRow = () => {
    setDraftRows((current) => [...current, calculateSalesRow({ id: crypto.randomUUID(), salesDataImportId: salesImport.id, campaignId: salesImport.campaignId, optionName: '', quantity: 0, unitPrice: 0, canceledQuantity: 0, refundedQuantity: 0, totalCommissionRate: salesImport.totalCommissionRate, sellerCommissionRate: salesImport.sellerCommissionRate ?? salesImport.commissionRate })])
  }

  const save = async (confirm = false) => {
    setSaving(true)
    setSaveError('')
    try {
      if (!confirm) {
        sessionStorage.setItem(`manual-settlement-draft:${salesImport.id}`, JSON.stringify({ supplyAudience, vendorName, draftRows, rateDraft, manualChannel, manualAuthor, reportEnabled, reportedAmount, quantityBasis, sourceMessage, offsetAmount, shippingDetails, shippingDetailsTouched }))
        setSaveError('임시 저장 완료 · 이 브라우저 탭에 수정안을 보관했습니다. 정산 금액에는 아직 반영되지 않았습니다.')
        return
      }
      const linkedSettlement = settlementService.getSettlements().find((item) => item.salesDataImportId === salesImport.id)
      if (linkedSettlement && settlementService.isSettlementConfirmed(linkedSettlement)) throw new Error('확정된 정산서입니다. 정산 관리에서 확정을 해제한 후 수정해주세요.')
      if (linkedSettlement && campaign && (paymentRequestService.getActivePaymentRequestForRecipient(linkedSettlement.id, 'seller', campaign.sellerId) || paymentRequestService.getActivePaymentRequestForRecipient(linkedSettlement.id, 'manager', campaign.managerId))) throw new Error('기존 지급요청이 남아 있습니다. 정산 관리에서 지급요청을 먼저 정리해주세요. 입력한 수정값은 유지됩니다.')
      if (confirm && reportEnabled && !manualAuthor) throw new Error('자료 작성 주체를 선택해주세요.')
      if (reportEnabled && reportedAmount.trim() && (!Number.isFinite(preparedImport.manualSettlement?.reportedCommissionAmount) || preparedImport.manualSettlement!.reportedCommissionAmount! < 0)) throw new Error('업체 전달 수수료는 0 이상의 숫자로 입력해주세요.')
      if (!Number.isFinite(offsetAmount) || offsetAmount < 0) throw new Error('상계처리금액은 0 이상의 숫자로 입력해주세요.')
      if (shippingDetails.some((item) => (item.quantity > 0 || item.unitPrice > 0 || item.label.trim()) && (!item.label.trim() || !Number.isInteger(item.quantity) || item.quantity < 0 || !Number.isFinite(item.unitPrice) || item.unitPrice < 0))) throw new Error('배송비 항목·건수·단가를 확인해주세요.')
      if (preparedRows.some((row) => row.settlementSupplyPrice !== undefined && (row.settlementSupplyPrice < 0 || row.settlementSupplyPrice > row.unitPrice))) throw new Error('이번 정산 공급가는 0원 이상, 판매가 이하로 입력해주세요.')
      if (supplyAudience === 'vendor' && (!vendorName.trim() || draftRows.some((row) => row.sellerCommissionRate === undefined))) throw new Error('벤더명과 모든 SKU의 벤더 수수료 조건을 등록해주세요.')
      const totals = calculateSalesTotals(preparedRows, preparedImport)
      const nextImport: SalesDataImport = { ...preparedImport,
        settlementTerms: salesImport.settlementTerms ? captureUploadTerms(manualChannel || salesImport.settlementTerms.salesChannelType, preparedRows, salesImport.settlementTerms.sellerCheckoutPricingVersion === 2) : undefined,
        totalQuantity: totals.totalQuantity, totalSalesAmount: totals.totalSalesAmount,
        sourceType: reportEnabled ? 'manual' : salesImport.sourceType,
        fileName: reportEnabled ? '카톡·수기 정산' : salesImport.fileName,
        fileSize: reportEnabled ? 0 : salesImport.fileSize,
        settlementStatus: linkedSettlement ? salesImport.settlementStatus : '정산 전',
        fileAnalysis: reportEnabled ? undefined : salesImport.fileAnalysis,
        reviewStatus: '검수 중', confirmedAt: undefined, confirmedBy: undefined,
        commissionSyncVersion: PRODUCT_COMMISSION_SYNC_VERSION, commissionSyncIssues: [], commissionSyncUnmatchedRows: 0,
        commissionManualMatches: { ...salesImport.commissionManualMatches, ...Object.fromEntries(preparedRows.filter((row) => row.skuId).map((row) => [`${normalizeProductMatchText(row.optionName)}::${Math.round(row.unitPrice)}`, row.skuId!])) },
        uploadedBy: '허수정', uploadedAt: new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Seoul' }).slice(0, 16),
        notes: `${salesImport.notes ? `${salesImport.notes} ` : ''}판매 수량·조건 직접 수정`,
      }
      const validation = validateSalesRows(nextImport, preparedRows)
      if (confirm && validation.status === 'error') throw new Error(validation.results.filter((item) => item.status === 'error').map((item) => item.message).join(' / '))
      if (linkedSettlement && validation.status === 'error') throw new Error('이미 생성된 정산서가 있습니다. 수량·수수료 조건과 업체 전달 금액의 차이를 해결한 후 저장해주세요.')
      salesDataService.updateSalesDataImport(nextImport)
      salesDataService.addSalesDataRows(salesImport.id, preparedRows)
      salesDataService.validateSalesData(salesImport.id)
      if (confirm) salesDataService.confirmSalesData(salesImport.id)
      if (linkedSettlement) {
        settlementService.recalculateSettlement(linkedSettlement.id, '판매 수량·조건 직접 수정')
        salesDataService.markSettlementReady(salesImport.id)
      }
      await cloudSyncService.syncKeys([
        STORAGE_KEYS.salesDataImports,
        STORAGE_KEYS.salesDataRows,
        STORAGE_KEYS.settlements,
        STORAGE_KEYS.settlementVersions,
        STORAGE_KEYS.settlementActivityLogs,
        STORAGE_KEYS.workItems,
      ])
      sessionStorage.removeItem(`manual-settlement-draft:${salesImport.id}`)
      onSave()
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : '수정 내용을 저장하지 못했습니다.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="drawer-backdrop">
      <section className="complete-modal sales-manual-modal">
        <h3>수기 정산 · 판매 수량·조건 입력</h3>
        <p className="section-description">공급 대상을 선택하고 상품의 SKU·수량·정산 조건을 확인해주세요.</p>
        <p className="manual-campaign-name">{campaign?.campaignName}</p>
        <section className="manual-settlement-fields"><label style={{ display: 'flex', alignItems: 'center', gap: 8 }}><input type="checkbox" style={{ width: 18, height: 18, minHeight: 18 }} checked={supplyAudience === 'vendor'} onChange={(event) => changeAudience(event.target.checked ? 'vendor' : 'seller', vendorName)} />벤더 공급 · 공구일정 설정 자동 적용</label>
        {supplyAudience === 'vendor' && <><label>정산 벤더명<input list="settlement-vendors" placeholder="예: 소셜라운지" value={vendorName} onChange={(event) => changeAudience('vendor', event.target.value)} /></label><datalist id="settlement-vendors">{[...new Set(vendorTerms.map((term) => term.vendor))].map((name) => <option key={name} value={name} />)}</datalist><p>공통 SKU에 벤더별 합의 수수료를 적용합니다. 처음에는 각 SKU의 수수료를 입력하고 조건을 저장해주세요.</p><button type="button" className="secondary-button" onClick={() => void saveVendorTerms()}>현재 SKU 수수료를 이 벤더의 기본 조건으로 저장</button></>}
        </section>
        {supplyAudience === 'vendor' && <div className="sales-summary-grid"><SummaryItem label="공급사 수령액(상계 후)" value={reportEnabled && reportedAmount ? formatCurrency(Number(reportedAmount.replaceAll(',', ''))) : '입력 필요'} /><SummaryItem label="벤더 지급 수수료" value={draftRows.some((row) => row.sellerCommissionRate === undefined) ? '조건 등록 필요' : formatCurrency(preparedRows.reduce((sum,row) => sum + Math.round(row.netSales * (row.sellerCommissionRate ?? 0) / 100),0))} /></div>}
        {catalogLoading && <p role="status">공구에 연결된 SKU와 가격을 불러오는 중입니다.</p>}
        <details className="manual-secondary" open><summary>1. 카톡 붙여넣기 · 최종 금액 확인</summary>
        {salesImport.settlementTerms && <label>공구 판매 링크 확정 조건 <select value={manualChannel} onChange={(event) => setManualChannel(event.target.value as CampaignSalesChannelType)}>{Object.entries(channelLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>}
        <label>자료 작성 주체 <select value={manualAuthor} onChange={(event) => setManualAuthor(event.target.value as SettlementDocumentAuthor)}><option value="">작성 주체 선택</option>{Object.entries(authorLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        <label><input type="checkbox" checked={reportEnabled} onChange={(event) => setReportEnabled(event.target.checked)} /> 업체 전달 합산 수수료 함께 입력</label>
        {reportEnabled && <div className="manual-settlement-fields">
          <label className="manual-settlement-message"><span>카톡 원문·정산 근거 메모</span><textarea rows={4} placeholder="공구명, 기간, 옵션별 수량, 업체 전달 내용을 붙여넣으세요." value={sourceMessage} onChange={(event) => setSourceMessage(event.target.value)} /></label>
          <div className="manual-settlement-message">
            <p>원문은 근거 메모로 보관됩니다. 상품의 SKU를 불러온 뒤 수량과 금액을 직접 입력해주세요.</p>
            {offsetAmount > 0 && <p>상계처리금액 {formatCurrency(offsetAmount)} · 상계 후 전달액 {formatCurrency(Number(reportedAmount.replace(/,/g, '')))}. 수수료 대조는 상계 전 금액 기준입니다. 최종 전달 금액에 상계금액을 더해 상계 전 수수료와 비교합니다. 기존 비용에는 중복 차감하지 않습니다.</p>}
          </div>

          <label><span>카톡에 적힌 최종 전달 금액 (상계 후)</span><NumericInput inputMode="decimal" placeholder="예: 674,121" value={reportedAmount} onChange={(event) => setReportedAmount(event.target.value)} /></label>
          <label><span>상계처리금액</span><NumericInput type="number" min="0" inputMode="numeric" value={offsetAmount} onChange={(event) => setOffsetAmount(Number(event.target.value))} /></label>
          <label><span>전달받은 수량 기준</span><select value={quantityBasis} onChange={(event) => setQuantityBasis(event.target.value as 'net' | 'gross')}><option value="net">취소·반품 차감 후 최종 수량</option><option value="gross">취소·반품 차감 전 판매수량</option></select></label>
          {quantityBasis === 'net' && <p>입력한 수량을 최종 정산 수량으로 사용합니다. 취소·반품은 다시 차감하지 않습니다.</p>}
          <div className="sales-summary-grid manual-settlement-message">
            <SummaryItem label="계산 합산 수수료" value={comparison ? formatCurrency(comparison.total) : '제품을 연결하고 수량을 입력해주세요'} />
            <SummaryItem label="셀러 수수료" value={comparison ? formatCurrency(comparison.seller) : '확인 필요'} />
            <SummaryItem label="벤더 수수료 (비용 차감 전)" value={comparison ? formatCurrency(comparison.vendor) : '확인 필요'} />
            <SummaryItem label="상계 반영 후 차이" value={comparison?.difference === undefined || !Number.isFinite(comparison.difference) ? '확인 필요' : formatCurrency(comparison.difference)} />
          </div>
        </div>}
        </details>
        <h4>2. 제품과 수량 확인</h4>
        <div className="inline-form"><label><input type="checkbox" checked={draftRows.length > 0 && draftRows.every(row => selectedManualRows.includes(row.id))} onChange={event => setSelectedManualRows(event.target.checked ? draftRows.map(row => row.id) : [])} /> 전체 선택</label><label>셀러/벤더 수수료 (%)<input type="number" min="0" max="100" step="any" value={bulkSellerRate} onChange={event => setBulkSellerRate(event.target.value)} /></label>{[20,25,30].map(rate => <button className="secondary-button" type="button" key={rate} onClick={() => setBulkSellerRate(String(rate))}>{rate}%</button>)}<button type="button" className="primary-button" disabled={!selectedManualRows.length || saving || salesImport.commissionCalculationType === 'campaign_total'} onClick={() => {
            const rate = Number(bulkSellerRate)
            if (!bulkSellerRate.trim() || !Number.isFinite(rate) || rate < 0 || rate > 100 || draftRows.some(row => selectedManualRows.includes(row.id) && (row.totalCommissionRate ?? salesImport.totalCommissionRate ?? -1) < rate)) { setSaveError('총수수료율을 확인하고 그 이하의 수수료를 입력해주세요.'); return }
            selectedManualRows.forEach(id => updateRow(id, 'sellerCommissionRate', bulkSellerRate))
            setSaveError('')
          }}>선택 항목 일괄 적용</button></div>
        <div className="manual-table-wrap"><table className="data-table manual-edit-table"><thead><tr><th>선택</th><th>상품·옵션</th><th>연결 SKU</th><th>판매수량</th><th>판매가</th><th>공급가</th><th>취소·환불·수수료</th><th>수정</th></tr></thead><tbody>
          {draftRows.map((row) => (
            <tr key={row.id}><td><input type="checkbox" aria-label={`${row.optionName} 선택`} checked={selectedManualRows.includes(row.id)} onChange={event => setSelectedManualRows(value => event.target.checked ? [...value, row.id] : value.filter(id => id !== row.id))} /></td>
              <td><label className="manual-option-name"><span>{row.productName || '제품·옵션'}</span><input value={row.optionName} onChange={(event) => updateRow(row.id, 'optionName', event.target.value)} /></label></td>
              <td><label className="manual-sku-change"><span>연결 상품·SKU 변경</span><input aria-label={`${row.optionName} 연결 상품 검색`} placeholder="알텐바흐 등 상품명 검색" value={skuSearch} onChange={(event) => setSkuSearch(event.target.value)} /><select value={row.skuId ?? ''} onChange={(event) => {
                const product = products.find((item) => item.skus.some((sku) => sku.id === event.target.value))
                const sku = product?.skus.find((item) => item.id === event.target.value)
                if (!product || !sku) return
                setDraftRows((items) => items.map((item) => item.id !== row.id ? item : ({ ...calculateSalesRow({ ...item, skuId: sku.id, productId: product.id, productName: `[${product.productName}] ${sku.productName || sku.optionName}`, agreedUnitPrice: sku.groupBuyPrice, settlementSupplyPrice: undefined, totalCommissionRate: sku.totalCommissionRate ?? product.totalCommissionRate, sellerCommissionRate: resolveAudienceRate(sku.id) }), sellerCommissionRate: resolveAudienceRate(sku.id) })))
              }}><option value="">SKU 선택</option>{products.flatMap((product) => product.skus.filter((sku) => sku.id === row.skuId || (sku.active && (skuSearch.trim() ? normalizeProductMatchText(product.brandName + product.productName + sku.optionName).includes(normalizeProductMatchText(skuSearch)) : product.id === row.productId))).map((sku) => <option key={sku.id} value={sku.id}>{product.productName} · {sku.optionName}</option>))}</select><small>판매 옵션·수량·실판매가는 유지하며 선택 SKU의 수수료를 적용합니다.</small></label></td>
              <td><label><span>{reportEnabled && quantityBasis === 'net' ? '최종 정산 수량' : '판매수량'}</span><NumericInput type="number" min="0" inputMode="numeric" value={row.quantity} onChange={(event) => updateRow(row.id, 'quantity', event.target.value)} /></label></td>
              <td><label><span>판매가</span><NumericInput type="number" min="0" inputMode="decimal" value={row.unitPrice} onChange={(event) => updateRow(row.id, 'unitPrice', event.target.value)} /></label></td>
              <td><label className="manual-supply-price"><span>이번 정산 공급가 (1회 적용)</span><NumericInput type="number" min="0" max={row.unitPrice} inputMode="numeric" placeholder={row.totalCommissionRate === undefined ? '공급가 입력' : String(Math.round(row.unitPrice * (1 - row.totalCommissionRate / 100)))} value={row.settlementSupplyPrice ?? ''} onChange={(event) => updateSettlementSupplyPrice(row.id, event.target.value)} /><small>상품 DB는 변경하지 않습니다. 입력 시 총수수료율을 자동 계산합니다.</small></label></td>
              <td><details className="manual-row-details" open><summary>취소·환불 / 수수료 수정</summary><div className="manual-row-extra">
              <label><span>취소수량</span><NumericInput type="number" disabled={reportEnabled && quantityBasis === 'net'} value={reportEnabled && quantityBasis === 'net' ? 0 : row.canceledQuantity} onChange={(event) => updateRow(row.id, 'canceledQuantity', event.target.value)} /></label>
              <label><span>환불수량</span><NumericInput type="number" disabled={reportEnabled && quantityBasis === 'net'} value={reportEnabled && quantityBasis === 'net' ? 0 : row.refundedQuantity} onChange={(event) => updateRow(row.id, 'refundedQuantity', event.target.value)} /></label>
              {salesImport.commissionCalculationType !== 'campaign_total' && <>
                <label><span>총 수수료율(%)</span><NumericInput min="0" max="100" step="0.1" type="number" value={row.totalCommissionRate ?? salesImport.totalCommissionRate ?? ''} onChange={(event) => updateRow(row.id, 'totalCommissionRate', event.target.value)} /></label>
                <label><span>{supplyAudience === 'vendor' ? '벤더 수수료율(%) · 미등록 시 입력 필요' : '셀러 수수료율(%)'}</span><NumericInput min="0" max="100" step="0.1" type="number" value={row.sellerCommissionRate ?? (supplyAudience === 'vendor' ? undefined : salesImport.sellerCommissionRate ?? salesImport.commissionRate) ?? ''} onChange={(event) => updateRow(row.id, 'sellerCommissionRate', event.target.value)} /></label>
              </>}
              </div></details></td>
              <td><button className="secondary-button" onClick={() => setDraftRows((current) => current.filter((item) => item.id !== row.id))} type="button">삭제</button></td>
            </tr>
          ))}
        </tbody></table></div>
        {!catalogLoading && !draftRows.length && <p>공구에 연결된 SKU가 없습니다. 아래 ‘상품·SKU 추가’에서 선택하거나 행을 추가해주세요.</p>}
        <details className="manual-secondary" open={pickerExpanded} onToggle={(event) => setPickerExpanded(event.currentTarget.open)}><summary>상품·SKU 추가</summary>
        <div className="manual-sku-search">
          <label><span>제품·SKU 검색</span><input type="search" value={skuSearch} onChange={(event) => setSkuSearch(event.target.value)} placeholder="예: 이지드롭, 옵션1, 리필" /></label>
          {skuSearch.trim() && <div className="manual-sku-search-results" aria-live="polite">
            {(() => {
              const normalize = (text: string) => text.toLowerCase().replace(/\s+/g, '')
              const query = normalize(skuSearch)
              const results = products.flatMap((product) => product.skus.filter((sku) => sku.active && normalize(`${product.brandName} ${product.productName} ${sku.productName} ${sku.optionName}`).includes(query)).map((sku) => ({ product, sku })))
              return results.length ? <>{results.slice(0, 40).map(({ product, sku }) => {
                const added = draftRows.some((row) => row.skuId === sku.id)
                return <button key={sku.id} type="button" className="secondary-button" disabled={added || saving} onClick={() => { setProductId(product.id); addSku(product.id, sku.id) }}><strong>[{product.productName}] {sku.productName || sku.optionName}</strong><span>{sku.optionName} · {formatCurrency(sku.groupBuyPrice)}</span><small>{added ? '추가됨' : '이 SKU 추가'}</small></button>
              })}{results.length > 40 && <p>검색 결과가 많습니다. 제품명이나 구성명을 더 입력해주세요.</p>}</> : <p>일치하는 SKU가 없습니다. 다른 제품명이나 구성명으로 검색해주세요.</p>
            })()}
          </div>}
        </div>
        <div className="manual-sku-picker">
          <label><span>상품 선택 · 전체 SKU 불러오기</span><select value={productId} onChange={(event) => { setProductId(event.target.value); addSku(event.target.value, '*'); setSkuId('') }}><option value="">상품을 선택하세요</option>{products.filter((item) => item.active && (item.supplyAudience !== 'vendor' || (supplyAudience === 'vendor' && item.settlementVendorName === vendorName.trim()))).map((item) => <option key={item.id} value={item.id}>{item.brandName} · {item.productName}</option>)}</select></label>
          <label><span>SKU 선택</span><select value={skuId} onChange={(event) => setSkuId(event.target.value)}><option value="">SKU를 선택하세요</option>{products.find((item) => item.id === productId)?.skus.filter((sku) => sku.active).map((sku) => <option key={sku.id} value={sku.id}>{sku.optionName} · {formatCurrency(sku.groupBuyPrice)}</option>)}</select></label>
          <button className="secondary-button" type="button" disabled={!skuId} onClick={() => addSku()}>SKU 추가</button>
        </div>
        </details>
        {catalogError && <p role="alert">{catalogError}</p>}
        {salesImport.commissionCalculationType === 'campaign_total' && <div className="sales-manual-rate-grid">
          <label><span>공구 총 수수료율(%)</span><NumericInput min="0" max="100" step="0.1" type="number" value={rateDraft.total} onChange={(event) => setRateDraft((current) => ({ ...current, total: event.target.value }))} /></label>
          <label><span>셀러 수수료율(%)</span><NumericInput min="0" max="100" step="0.1" type="number" value={rateDraft.seller} onChange={(event) => setRateDraft((current) => ({ ...current, seller: event.target.value }))} /></label>
        </div>}
        <details className="manual-secondary manual-shipping-section" open>
          <summary>3. 배송비 추가</summary>
          <p className="section-description">정산서에 반영할 배송비를 항목별로 입력하세요. 합계는 물품대금과 별도로 표시됩니다.</p>
          <div className="manual-shipping-list">
            {shippingDetails.map((item, index) => <div className="manual-shipping-row" key={index}>
              <label><span>항목</span><input value={item.label} onChange={(event) => updateShippingDetail(index, { label: event.target.value })} placeholder="기본택배비" /></label>
              <label><span>건수</span><NumericInput type="number" min="0" inputMode="numeric" value={item.quantity} onChange={(event) => updateShippingDetail(index, { quantity: Number(event.target.value || 0) })} /></label>
              <label><span>단가</span><NumericInput type="number" min="0" inputMode="numeric" value={item.unitPrice} onChange={(event) => updateShippingDetail(index, { unitPrice: Number(event.target.value || 0) })} /></label>
              <strong>{formatCurrency(item.quantity * item.unitPrice)}</strong>
              <button className="secondary-button" type="button" onClick={() => { setShippingDetailsTouched(true); setShippingDetails((current) => current.filter((_, itemIndex) => itemIndex !== index)) }}>삭제</button>
            </div>)}
          </div>
          <div className="manual-shipping-footer"><button className="secondary-button" type="button" onClick={() => { setShippingDetailsTouched(true); setShippingDetails((current) => [...current, { label: '', quantity: 0, unitPrice: 0 }]) }}>배송비 항목 추가</button><strong>배송비 합계 {formatCurrency(preparedImport.shippingRevenue ?? 0)}</strong></div>
        </details>
        <div className="action-row">
          {saveError && <div className="inline-notice" role="alert" style={{ gridColumn: '1 / -1', width: '100%' }}><span>{saveError}</span></div>}
          <button className="secondary-button" onClick={addRow} type="button">행 추가</button>
          <button className="primary-button" disabled={saving || catalogLoading || !draftRows.length} onClick={() => void save()} type="button">{saving ? '저장 중…' : '임시 저장'}</button>
          <button className="primary-button" disabled={saving || catalogLoading || !draftRows.length} onClick={() => void save(true)} type="button">확인 완료 · 정산 반영</button>
          <button className="secondary-button" onClick={onClose} type="button">닫기</button>
        </div>
      </section>
    </div>
  )
}
import './operational-tables.css'
