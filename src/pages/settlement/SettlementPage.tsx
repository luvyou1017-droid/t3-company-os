import { VendorPartnerDetails } from './components/VendorPartnerDetails'
import { SupplierSettlementDocument } from './components/SupplierSettlementDocument'
import { calculateVendorDocument } from '../../shared/utils/vendorSettlementDocument'
import { SalesReferences } from './components/SalesReferences'
import { useEffect, useRef, useState, type ClipboardEvent, type RefObject } from 'react'
import { flushSync } from 'react-dom'
import { toBlob } from 'html-to-image'

const documentPngJobs = new WeakMap<HTMLDivElement, Promise<Blob>>()
import { campaignService } from '../../shared/services/campaignService'
import { salesDataService } from '../../shared/services/salesDataService'
import { settlementService } from '../../shared/services/settlementService'
import { cloudSyncService } from '../../shared/services/cloudSyncService'
import { STORAGE_KEYS, storageService } from '../../shared/services/storageService'
import type { SupplierPilotRow } from '../../shared/data/notionSupplierPilot10'
import { paymentEvidenceService } from '../../shared/services/paymentEvidenceService'
import { PAYMENT_EVIDENCE_ALLOWED_TYPES, paymentEvidenceStorageService } from '../../shared/services/paymentEvidenceStorageService'
import { managerPaymentService } from '../../shared/services/managerPaymentService'
import { sellerSettlementService } from '../../shared/services/sellerSettlementService'
import { withholdingTaxService } from '../../shared/services/withholdingTaxService'
import type { SalesDataImport, SalesDataRow } from '../../shared/types/salesData'
import type { Settlement, SettlementCalculationSnapshot, SettlementDeduction, SettlementRevisionDraft, SettlementStatus, SettlementVersion } from '../../shared/types/settlement'
import { calculateManagerBaseShare, runSettlementAssertions, statusLabel, validateSettlement } from '../../shared/utils/settlement'
import { formatCurrency } from '../../shared/utils/salesData'
import { openCampaignDetail } from '../../shared/utils/campaignNavigation'
import { calculateFinalSellerPayment, getRecommendedEvidenceType, normalizeSellerBusinessType } from '../../shared/utils/sellerSettlement'
import { sellerMasterService } from '../../shared/services/sellerMasterService'
import { companySettlementProfile } from '../../shared/data/companySettlementProfile'
import { managerSettlementReportService } from '../../shared/services/managerSettlementReportService'
import { canViewManagerSettlement, isAssignedManager } from '../../shared/utils/managerSettlementPermission'
import { canEditSettlement } from '../../shared/data/users'
import { paymentRequestService } from '../../shared/services/paymentRequestService'
import { sensitiveIdentityService } from '../../shared/services/sensitiveIdentityService'
import { campaignEventOperationService } from '../../shared/services/campaignEventOperationService'
import { getCampaignEventTypeLabel } from '../../shared/services/campaignCreationService'
import { calculateManagerPayoutBreakdown, calculateManagerProductRow, calculateSellerProductRow, calculateSellerProductSubtotal, formatKoreanDocumentDate, formatKoreanExportTime, getSellerSettlementSchedule } from '../../shared/utils/settlementDocument'
import { formatKoreanDate, formatKoreanDateTime as formatKoreanDateTimeCommon } from '../../shared/utils/koreanDate'
import { calculateWithholding } from '../../shared/utils/withholdingTax'
import type { EvidenceOwnerType } from '../../shared/types/paymentEvidence'
import type { PaymentRequest, PaymentRequestStatus, SellerBusinessType } from '../../shared/types/sellerSettlement'
import type { CampaignEvent } from '../../shared/types/campaignCreation'
import type { Campaign } from '../../shared/types/campaign'
import type { AppUser } from '../../shared/data/users'
import { ResidentRegistrationNumberInput } from '../../shared/components/ResidentRegistrationNumberInput'
import { ReasonInput, ReasonModal } from '../../shared/components/ReasonInput'
import { useCompanyAuth, type CompanyProfile } from '../../features/auth/AuthGate'
import { sanitizeAccountNumberInput } from '../../shared/utils/accountNumber'
import { isCompanyDirectManager } from '../../shared/utils/managerPayment'
import { campaignChannel } from '../../shared/utils/uploadSettlementConditions'
import { sellerSettlementFileService } from '../../shared/services/sellerSettlementFileService'

type DocumentMode = '내부 검토용' | '셀러 전달용' | '매니저 정산서'
type ReadinessModal = 'vendor-info' | 'commission' | 'costs' | 'share' | 'business' | 'account' | 'seller-info' | 'manager-info' | 'manager-business-edit' | 'manager-account-edit'
type ReadinessSeverity = 'blocking' | 'non-blocking'
type ReadinessWarning = { id: string; message: string; actionLabel: string; severity: ReadinessSeverity; action: () => void }
type PaymentWarningAction = { reason: string; actionLabel: string; action: () => void }
type PayoutStatusNotice = { title: string; detail: string; tone: 'unconfirmed' | 'pending' | 'waiting' | 'approved' | 'complete' }
const evidenceAllowedTypes = new Set<string>(PAYMENT_EVIDENCE_ALLOWED_TYPES)
const evidenceImageTypes = new Set<string>(PAYMENT_EVIDENCE_ALLOWED_TYPES.filter((type) => type.startsWith('image/')))
const statusTone: Record<SettlementStatus, string> = {
  draft: 'muted',
  calculating: 'progress',
  review_pending: 'warning',
  revision_required: 'danger',
  manager_reviewed: 'settlement',
  approval_pending: 'settlement',
  approved: 'settlement',
  payment_ready: 'progress',
  partially_paid: 'warning',
  completed: 'complete',
  canceled: 'muted',
}

const actionLabels: Record<string, string> = {
  draft_created: '정산 초안 생성',
  calculation_run: '계산 실행',
  deduction_added: '차감 항목 추가',
  deduction_updated: '차감 항목 수정',
  deduction_removed: '차감 항목 삭제',
  commission_rate_updated: '수수료율 수정',
  manager_review_requested: '매니저 검토 요청',
  manager_review_completed: '매니저 검토 완료',
  revision_requested: '수정 요청',
  revision_request_updated: '수정 요청 내용 변경',
  revision_request_cancelled: '수정 요청 취소',
  revision_request_rejected: '수정 요청 반려',
  revision_completed: '정산 수정 완료',
  settlement_confirmed: '정산서 확정',
  settlement_confirmation_released: '정산서 확정 해제',
  seller_payment_requested: '셀러 지급요청',
  seller_payment_request_updated: '셀러 지급요청 수정',
  seller_payment_request_canceled: '셀러 지급요청 취소',
  manager_payment_requested: '매니저 지급요청',
  manager_payment_request_updated: '매니저 지급요청 수정',
  manager_payment_request_canceled: '매니저 지급요청 취소',
  approval_requested: '대표 승인 요청',
  approved: '대표 승인',
  payment_ready: '지급 준비',
  seller_payment_completed: '셀러 지급 완료',
  manager_payment_completed: '매니저 지급 완료',
  company_settlement_completed: '업체 정산 완료',
  completed: '최종 완료',
}

function Badge({ label, tone }: { label: string; tone: string }) {
  return <span className={`campaign-status campaign-status--${tone}`}>{label}</span>
}

function money(value: number) {
  return formatCurrency(value).replace('원', '원')
}

function getCampaign(settlement: Settlement) {
  return campaignService.getCampaignById(settlement.campaignId)
}

const koreaToday = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' })
function addCalendarDays(date: string, days: number) {
  const [year, month, day] = date.split('-').map(Number)
  const value = new Date(Date.UTC(year, month - 1, day + days))
  return value.toISOString().slice(0, 10)
}

type SettlementCalendarItem = {
  request: PaymentRequest
  settlement: Settlement
  dueDate: string
  campaignName: string
  recipientName: string
  recipientType: '셀러' | '매니저'
  amount: number
  remainingAmount: number
  status: '지급 대기' | '연체' | '지급 완료'
}

function buildSettlementCalendarItems(settlements: Settlement[]): SettlementCalendarItem[] {
  const settlementById = new Map(settlements.map((settlement) => [settlement.id, settlement]))
  const today = koreaToday()
  return paymentRequestService.getOperationalPaymentRequests().filter((request) => request.status !== 'draft' && request.status !== 'canceled').flatMap((request) => {
    const settlement = settlementById.get(request.settlementId)
    if (!settlement) return []
    const campaign = getCampaign(settlement)
    const salesImport = salesDataService.getSalesDataImportById(settlement.salesDataImportId)
    const endDate = salesImport?.salesEndDate || campaign?.endDate || settlement.createdAt.slice(0, 10)
    const dueDate = request.dueDate || settlement.paymentDueDate || addCalendarDays(endDate, 21)
    const amount = Math.max(request.finalPaymentAmount, 0)
    const completed = request.status === 'payment_completed' || request.status === 'remittance_confirmed'
    const remainingAmount = completed ? 0 : amount
    const status = completed ? '지급 완료' : dueDate < today ? '연체' : '지급 대기'
    return [{ request, settlement, dueDate, campaignName: campaign?.campaignName ?? settlement.campaignId, recipientName: request.recipientName, recipientType: request.recipientType === 'seller' ? '셀러' : '매니저', amount, remainingAmount, status }]
  })
}

function calculateUnrequestedAmount(settlements: Settlement[]) {
  const requests = paymentRequestService.getOperationalPaymentRequests().filter((request) => request.status !== 'canceled')
  return settlements.filter((settlement) => settlement.status !== 'completed' && settlement.status !== 'canceled').reduce((sum, settlement) => {
    const sellerRequested = requests.some((request) => request.settlementId === settlement.id && request.recipientType === 'seller')
    const managerRequested = requests.some((request) => request.settlementId === settlement.id && request.recipientType === 'manager')
    const sellerAmount = settlement.sellerPaymentCompleted || sellerRequested ? 0 : Math.max(settlement.currentCalculation.finalSellerPaymentAmount, 0)
    const managerAmount = settlement.managerPaymentCompleted || managerRequested ? 0 : Math.max(settlement.currentCalculation.finalPaymentAmount, 0)
    return sum + sellerAmount + managerAmount
  }, 0)
}

function SettlementCalendar({ items, totalUnrequested, unpricedCount, onOpenDetail }: { items: SettlementCalendarItem[]; totalUnrequested: number; unpricedCount: number; onOpenDetail: (settlementId: string) => void }) {
  const [month, setMonth] = useState(koreaToday().slice(0, 7))
  const [year, monthNumber] = month.split('-').map(Number)
  const firstDay = new Date(Date.UTC(year, monthNumber - 1, 1))
  const lastDay = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate()
  const mondayOffset = (firstDay.getUTCDay() + 6) % 7
  const cells = Array.from({ length: Math.ceil((mondayOffset + lastDay) / 7) * 7 }, (_, index) => {
    const day = index - mondayOffset + 1
    return day > 0 && day <= lastDay ? `${month}-${String(day).padStart(2, '0')}` : ''
  })
  const monthItems = items.filter((item) => item.dueDate.startsWith(month))
  const moveMonth = (offset: number) => {
    const date = new Date(Date.UTC(year, monthNumber - 1 + offset, 1))
    setMonth(`${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`)
  }
  const allWaiting = items.filter((item) => item.status === '지급 대기').reduce((sum, item) => sum + item.remainingAmount, 0)
  const allOverdue = items.filter((item) => item.status === '연체').reduce((sum, item) => sum + item.remainingAmount, 0)
  return <section className="settlement-calendar panel"><div className="panel__header settlement-calendar__header"><div><h2>정산 요청 달력</h2><p>실제로 지급 요청이 생성된 건만 표시합니다. 기본 지급 예정일은 공구 종료일 + 21일입니다.</p>{unpricedCount > 0 && <small className="settlement-calendar__unpriced">정산서 미생성 · 금액 산정 전 {unpricedCount}건</small>}</div><div className="settlement-calendar__nav"><button onClick={() => moveMonth(-1)} type="button">‹</button><strong>{year}년 {monthNumber}월</strong><button onClick={() => moveMonth(1)} type="button">›</button></div></div><div className="settlement-calendar__summary"><Metric label="이번 달 요청 금액" value={money(monthItems.reduce((sum, item) => sum + item.amount, 0))} /><Metric label="이번 달 요청 후 미지급" value={money(monthItems.reduce((sum, item) => sum + item.remainingAmount, 0))} /><Metric label="총 미요청액" value={money(totalUnrequested)} tone={totalUnrequested ? 'danger' : 'complete'} /><Metric label="전체 요청 후 지급 대기" value={money(allWaiting)} /><Metric label="전체 기한 지난 미지급" value={money(allOverdue)} tone={allOverdue ? 'danger' : 'complete'} /></div><div className="settlement-calendar__weekdays">{['월','화','수','목','금','토','일'].map((day) => <span key={day}>{day}</span>)}</div><div className="settlement-calendar__grid">{cells.map((date, index) => <div className={`settlement-calendar__day ${date === koreaToday() ? 'is-today' : ''} ${!date ? 'is-empty' : ''}`} key={`${date}-${index}`}>{date && <><strong>{Number(date.slice(-2))}</strong>{items.filter((item) => item.dueDate === date).map((item) => <button className={`settlement-calendar__item is-${item.status.replace(' ', '-')}`} key={item.request.id} onClick={() => onOpenDetail(item.settlement.id)} type="button"><span>{item.campaignName}</span><b>{money(item.remainingAmount || item.amount)}</b><small>{item.status} · {item.recipientType} {item.recipientName}</small></button>)}</>}</div>)}</div></section>
}

type ManagerPerformanceCampaign = {
  settlementId: string
  campaignName: string
  sellerName: string
  endDate: string
  sales: number
  commission: number
  companyContribution: number
}

type ManagerPerformanceRow = {
  id: string
  name: string
  sales: number
  commission: number
  companyContribution: number
  employee: boolean
  campaigns: ManagerPerformanceCampaign[]
}

const employeeManagerName = '유시철'
const representativeManagerName = '허윤정'
const employeeIncentiveRate = 10

function isEmployeeManager(managerName?: string) {
  return (managerName ?? '').trim() === employeeManagerName
}

function isRepresentativeDirectManager(managerName?: string) {
  return (managerName ?? '').split(/[,/&·+]/).some((name) => name.trim() === representativeManagerName)
}

function calculateEmployeeKpiAmounts(companyProfit: number, vendorSupply: boolean) {
  const incentive = vendorSupply ? 0 : calculateManagerBaseShare(companyProfit, employeeIncentiveRate)
  return { incentive, companyContribution: companyProfit - incentive }
}

function ManagerPerformance({ settlements, onOpenDetail }: { settlements: Settlement[]; onOpenDetail: (settlementId: string) => void }) {
  const [period, setPeriod] = useState<'all' | 'month' | 'quarter'>('quarter')
  const [expandedManagerId, setExpandedManagerId] = useState<string | null>(null)
  const currentMonth = koreaToday().slice(0, 7)
  const [year, setYear] = useState(Number(currentMonth.slice(0, 4)))
  const [quarter, setQuarter] = useState(Math.ceil(Number(currentMonth.slice(5, 7)) / 3))
  const years = Array.from(new Set([Number(currentMonth.slice(0, 4)), year, ...settlements
    .filter((settlement) => settlement.status !== 'canceled')
    .map((settlement) => Number(getCampaign(settlement)?.endDate?.slice(0, 4)))
    .filter((value) => Number.isInteger(value) && value > 0)])).sort((a, b) => b - a)
  const missingEndDateCount = settlements.filter((settlement) => settlement.status !== 'canceled' && !getCampaign(settlement)?.endDate).length
  const periodSettlements = settlements.filter((settlement) => {
    if (settlement.status === 'canceled') return false
    if (period === 'all') return true
    const endDate = getCampaign(settlement)?.endDate || ''
    if (period === 'month') return endDate.startsWith(currentMonth)
    return Number(endDate.slice(0, 4)) === year && Math.ceil(Number(endDate.slice(5, 7)) / 3) === quarter
  })
  const rows = Array.from(periodSettlements.reduce((map, settlement) => {
    const campaign = getCampaign(settlement)
    const representativeDirect = isRepresentativeDirectManager(campaign?.managerName)
    const employee = isEmployeeManager(campaign?.managerName)
    const id = representativeDirect ? 'representative-heo-yoonjeong' : employee ? 'employee-yoo-sicheol' : campaign?.managerId || campaign?.managerName || settlement.assigneeName
    const name = representativeDirect ? representativeManagerName : employee ? employeeManagerName : campaign?.managerName || settlement.assigneeName || '담당자 미등록'
    const previous = map.get(id) ?? { id, name, sales: 0, commission: 0, companyContribution: 0, employee, campaigns: [] }
    previous.sales += settlement.currentCalculation.grossSales
    const vendorSupply = (salesDataService.getSalesDataImportById(settlement.salesDataImportId)?.supplyAudience ?? campaign?.supplyAudience) === 'vendor'
    let commission = 0
    let companyContribution = 0
    if (employee) {
      const amounts = calculateEmployeeKpiAmounts(settlement.currentCalculation.distributableVendorCommission, vendorSupply)
      commission = amounts.incentive
      companyContribution = amounts.companyContribution
    } else {
      const companyDirect = Boolean(vendorSupply || representativeDirect || (campaign && isCompanyDirectManager(campaign.managerId, campaign.managerName)))
      commission = companyDirect ? 0 : settlement.currentCalculation.managerAmount
      companyContribution = companyDirect
        ? settlement.currentCalculation.distributableVendorCommission
        : settlement.currentCalculation.companyAmount
    }
    previous.commission += commission
    previous.companyContribution += companyContribution
    previous.campaigns.push({
      settlementId: settlement.id,
      campaignName: campaign?.campaignName || settlement.campaignId,
      sellerName: campaign?.sellerName || '셀러 미등록',
      endDate: campaign?.endDate || '',
      sales: settlement.currentCalculation.grossSales,
      commission,
      companyContribution,
    })
    map.set(id, previous)
    return map
  }, new Map<string, ManagerPerformanceRow>()).values()).sort((a, b) => b.sales - a.sales)
  rows.forEach((row) => row.campaigns.sort((a, b) => b.endDate.localeCompare(a.endDate) || b.sales - a.sales))
  const totalCompanyContribution = rows.reduce((sum, row) => sum + row.companyContribution, 0)
  const totalSales = rows.reduce((sum, row) => sum + row.sales, 0)
  return <section className="manager-performance panel"><div className="panel__header"><div><h2>매니저별 실적</h2><p>공구 종료일 기준입니다. 외주 매니저는 정산서상 배분액을 표시합니다. 유시철은 사내 직원으로 구분하여 모든 비용 차감 후 회사이익의 10%를 인센티브로 계산합니다. 벤더 공급 건은 인센티브 없이 전액 회사이익으로 집계합니다.</p></div><div className="manager-performance__period"><button className={period === 'all' ? 'is-active' : ''} onClick={() => setPeriod('all')} type="button">전체 누적</button><button className={period === 'month' ? 'is-active' : ''} onClick={() => setPeriod('month')} type="button">이번 달</button><button className={period === 'quarter' ? 'is-active' : ''} onClick={() => setPeriod('quarter')} type="button">분기별</button></div></div>
    {period === 'quarter' && <div className="manager-performance__quarter"><label>연도 <select value={year} onChange={(event) => setYear(Number(event.target.value))}>{years.map((value) => <option key={value} value={value}>{value}년</option>)}</select></label><label>분기 <select value={quarter} onChange={(event) => setQuarter(Number(event.target.value))}>{[1, 2, 3, 4].map((value) => <option key={value} value={value}>{value}분기 ({(value - 1) * 3 + 1}~{value * 3}월)</option>)}</select></label><span>{year}년 {quarter}분기 · 공구 종료일 {(quarter - 1) * 3 + 1}월 1일 ~ {quarter * 3}월 {quarter === 1 || quarter === 4 ? 31 : 30}일</span></div>}
    {period !== 'all' && missingEndDateCount > 0 && <p>공구 종료일 미등록 {missingEndDateCount}건은 기간별 집계에서 제외됩니다.</p>}
    {rows.length > 0 ? <><div className="manager-performance__top"><span>선택 기간</span><strong>회사에 최종 남은 금액</strong><b>{money(totalCompanyContribution)}</b><small>총매출 {money(totalSales)} · 공구 {periodSettlements.length}건 · 비용 및 매니저 수수료·직원 인센티브 반영</small></div><div className="responsive-table manager-performance__table"><table><thead><tr><th scope="col">매니저</th><th scope="col">매니저가 낸 매출</th><th scope="col">수수료 / 인센티브</th><th scope="col">회사 기여액</th></tr></thead><tbody>{rows.flatMap((row) => {
      const expanded = expandedManagerId === row.id
      const averageSales = row.campaigns.length ? row.sales / row.campaigns.length : 0
      return [<tr key={row.id}><th scope="row"><button aria-expanded={expanded} className="manager-performance__name" onClick={() => setExpandedManagerId(expanded ? null : row.id)} type="button"><span>{row.name}{row.employee && <small className="employee-manager-badge">사내 직원 · 회사이익 10%</small>}</span><b aria-hidden="true">{expanded ? '접기 ▲' : '상세 보기 ▼'}</b></button></th><td className="amount-cell" data-label="매니저가 낸 매출">{money(row.sales)}</td><td className="amount-cell" data-label={row.employee ? "직원 인센티브" : "매니저 수수료"}>{money(row.commission)}</td><td className="amount-cell" data-label="회사 기여액">{money(row.companyContribution)}</td></tr>, expanded ? <tr className="manager-performance__detail-row" key={`${row.id}-detail`}><td colSpan={4}><div className="manager-performance__detail"><div className="manager-performance__detail-summary"><div><span>진행 공구</span><strong>{row.campaigns.length}건</strong></div><div><span>총매출</span><strong>{money(row.sales)}</strong></div><div><span>평균 매출</span><strong>{money(averageSales)}</strong></div><div><span>회사에 남은 금액</span><strong>{money(row.companyContribution)}</strong></div></div><div className="manager-performance__campaigns">{row.campaigns.map((campaign) => <button key={campaign.settlementId} onClick={() => onOpenDetail(campaign.settlementId)} type="button"><span className="manager-performance__campaign-title"><strong>{campaign.campaignName}</strong><small>{campaign.sellerName} · 종료 {campaign.endDate ? formatKoreanDate(campaign.endDate) : '미등록'}</small></span><span><small>매출</small><b>{money(campaign.sales)}</b></span><span><small>{row.employee ? '인센티브' : '수수료'}</small><b>{money(campaign.commission)}</b></span><span><small>회사 귀속</small><b>{money(campaign.companyContribution)}</b></span><i>정산서 보기 ›</i></button>)}</div></div></td></tr> : null]
    })}</tbody></table></div></> : <div className="empty-state"><strong>집계할 정산 데이터가 없습니다.</strong></div>}</section>
}

export function SettlementPage({ onOpenDetail }: { onOpenDetail: (settlementId: string) => void }) {
  const [settlements, setSettlements] = useState(() => settlementService.getSettlements())
  const [view, setView] = useState<'list' | 'managers' | 'calendar' | 'references'>(() => {
    const saved = sessionStorage.getItem('settlement-view')
    return saved === 'managers' || saved === 'calendar' || saved === 'references' ? saved : 'list'
  })
  const changeView = (next: 'list' | 'managers' | 'calendar' | 'references') => {
    setView(next)
    sessionStorage.setItem('settlement-view', next)
    sessionStorage.removeItem('settlement-list-scroll')
  }
  const [creationError, setCreationError] = useState('')
  const [quick, setQuick] = useState<SettlementStatus | 'all'>(() => (sessionStorage.getItem('settlement-list-filter') as SettlementStatus | 'all' | null) ?? 'all')

  useEffect(() => {
    const savedScroll = Number(sessionStorage.getItem('settlement-list-scroll') ?? 0)
    requestAnimationFrame(() => window.scrollTo({ top: savedScroll }))
  }, [])

  useEffect(() => { sessionStorage.setItem('settlement-list-filter', quick) }, [quick])

  useEffect(() => {
    let active = true
    void (async () => {
      const readySales = salesDataService.getSalesDataImports().filter((item) => item.reviewStatus === '확정 완료' && item.settlementStatus === '정산 가능')
      const automaticErrors: string[] = []
      readySales.forEach((item) => {
        try { settlementService.createSettlementFromSalesData(item.id) }
        catch (error) { automaticErrors.push(error instanceof Error ? error.message : '정산 자동 생성 중 알 수 없는 오류가 발생했습니다.') }
      })
      const current = settlementService.getSettlements().filter((item) => item.status !== 'completed' && item.status !== 'canceled')
      const syncResults = await Promise.allSettled(current.map((item) => settlementService.syncProductRates(item.id)))
      syncResults.forEach((result) => { if (result.status === 'rejected') automaticErrors.push(result.reason instanceof Error ? result.reason.message : '상품 수수료 동기화에 실패했습니다.') })
      if (active && automaticErrors.length) setCreationError([...new Set(automaticErrors)].join('\n'))
      if (active) setSettlements(settlementService.getSettlements())
    })()
    return () => { active = false }
  }, [])

  const sync = () => setSettlements(settlementService.getSettlements())
  const eligibleSales = salesDataService.getSalesDataImports().filter((item) => item.reviewStatus === '확정 완료' && item.settlementStatus === '정산 가능')
  const filtered = quick === 'all' ? settlements : settlements.filter((item) => item.status === quick)
  const calendarItems = buildSettlementCalendarItems(settlements.filter((item) => item.status !== 'canceled'))
  const totalUnrequested = calculateUnrequestedAmount(settlements)
  const assertion = runSettlementAssertions()

  const kpis = [
    ['정산 생성 대기', eligibleSales.length],
    ['작성 중', settlements.filter((item) => item.status === 'draft').length],
    ['검토 대기', settlements.filter((item) => item.status === 'review_pending').length],
    ['수정 필요', settlements.filter((item) => item.status === 'revision_required').length],
    ['대표 승인 대기', settlements.filter((item) => item.status === 'approval_pending').length],
    ['지급 준비', settlements.filter((item) => item.status === 'payment_ready').length],
    ['최종 완료', settlements.filter((item) => item.status === 'completed').length],
  ] as const

  const weekEnd = addCalendarDays(koreaToday(), 6)
  const dueThisWeek = calendarItems.filter((item) => item.dueDate >= koreaToday() && item.dueDate <= weekEnd).reduce((total, item) => total + item.remainingAmount, 0)
  const sellerDue = settlements.filter((item) => item.status !== 'completed').reduce((total, item) => total + item.currentCalculation.finalSellerPaymentAmount, 0)
  const managerDue = settlements.filter((item) => item.status !== 'completed').reduce((total, item) => total + item.currentCalculation.finalPaymentAmount, 0)
  const evidenceMissing = settlements.filter((item) => item.evidenceStatus !== 'confirmed').length
  const calculationErrors = settlements.filter((item) => !validateSettlement(item).valid).length

  const createFirstReadySettlement = () => {
    setCreationError('')
    try {
      const created = eligibleSales.map((item) => settlementService.createSettlementFromSalesData(item.id)).find(Boolean)
      sync()
      if (!created) throw new Error('정산 가능한 판매데이터를 찾지 못했습니다. 판매데이터의 검수 상태와 정산 가능 상태를 확인해주세요.')
      onOpenDetail(created.id)
    } catch (error) {
      setCreationError(error instanceof Error ? error.message : '정산을 생성하지 못했습니다.')
    }
  }

  return (
    <section className="campaign-schedule-page settlement-page">
      <section className="schedule-summary">
        <div className="schedule-summary__title">
          <div>
            <p className="page-eyebrow">Settlement V2</p>
            <h2>정산 관리</h2>
          </div>
          {view === 'list' && <button className="primary-button" disabled={!eligibleSales.length} onClick={createFirstReadySettlement} type="button">정산 생성</button>}
        </div>
        <nav className="settlement-view-tabs" aria-label="정산 관리 화면 선택">
          {([['list', '정산 목록'], ['managers', '매니저별 KPI'], ['calendar', '정산 달력'], ['references', '매출 레퍼런스']] as const).map(([id, label]) => <button key={id} type="button" aria-pressed={view === id} className={view === id ? 'is-active' : ''} onClick={() => changeView(id)}>{label}</button>)}
        </nav>
        {view === 'list' && <>
        <div className="settlement-kpi-grid">
          {kpis.map(([label, value]) => (
            <button className="summary-count-card" key={label} onClick={() => {
              const target = settlements.find((item) => statusLabel(item.status) === label.replace('작성 중', '작성 중'))
              setQuick(target?.status ?? 'all')
            }} type="button">
              <span>{label}</span>
              <strong>{value}</strong>
            </button>
          ))}
        </div>
        <div className="settlement-money-kpis">
          <Metric label="이번 주 지급 예정액" value={money(dueThisWeek)} />
          <Metric label="셀러 지급 예정액" value={money(sellerDue)} />
          <Metric label="매니저 지급 예정액" value={money(managerDue)} />
          <Metric label="증빙 미확인 건수" value={`${evidenceMissing}건`} />
          <Metric label="계산 오류 건수" value={`${calculationErrors}건`} tone={calculationErrors ? 'danger' : 'complete'} />
        </div>
        </>}
      </section>

      {!assertion.passed && <div className="inline-notice settlement-warning"><strong>경계값 검증 실패</strong><span>정산 계산 유틸을 확인해야 합니다.</span></div>}
      {creationError && <div className="inline-notice settlement-warning settlement-creation-error"><strong>정산 생성 실패</strong><span>{creationError}</span><small>표시된 상품·구성의 총수수료율과 셀러수수료율을 상품 DB에서 확인해주세요.</small></div>}

      {view === 'references' && <SalesReferences settlements={settlements} onOpenDetail={onOpenDetail} />}
      <div className="settlement-view" hidden={view !== 'calendar'}><SettlementCalendar items={calendarItems} totalUnrequested={totalUnrequested} unpricedCount={eligibleSales.length} onOpenDetail={onOpenDetail} /></div>

      <div className="settlement-view" hidden={view !== 'managers'}><ManagerPerformance settlements={settlements} onOpenDetail={onOpenDetail} /></div>

      <section className="panel settlement-view" hidden={view !== 'list'}>
        <div className="panel__header">
          <div>
            <h2>정산 목록</h2>
            <p>확정된 판매 데이터에서 생성된 정산 초안과 승인 흐름을 확인합니다.</p>
          </div>
          <strong className="result-count">{filtered.length}건</strong>
        </div>
        <div className="schedule-panel__body">
          <div className="schedule-table-wrap settlement-table-wrap">
            <table className="schedule-table settlement-table">
              <thead>
                <tr>
                  <th>공동구매</th><th>셀러</th><th>브랜드</th><th>판매 기간</th><th>정산 버전</th><th>총매출</th><th>총수수료</th><th>벤더 수수료</th><th>차감 합계</th><th>최종 배분 대상 금액</th><th>매니저 지급액</th><th>회사 귀속액</th><th>셀러 지급액</th><th>증빙 상태</th><th>정산 상태</th><th>정산 담당자</th><th>지급 예정일</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((settlement) => {
                  const campaign = getCampaign(settlement)
                  const salesImport = salesDataService.getSalesDataImportById(settlement.salesDataImportId)
                  return (
                    <tr key={settlement.id}>
                      <td><button className="settlement-name-link" onClick={() => { sessionStorage.setItem('settlement-list-scroll', String(window.scrollY)); onOpenDetail(settlement.id) }} type="button"><strong>{campaign?.campaignName ?? settlement.campaignId}</strong><span>{campaign?.campaignCode}</span></button></td>
                      <td>{campaign?.sellerName ?? '-'}</td>
                      <td>{campaign?.brandName ?? '-'}</td>
                      <td>{formatKoreanDate(salesImport?.salesStartDate)} ~ {formatKoreanDate(salesImport?.salesEndDate)}</td>
                      <td>v{settlement.settlementVersion}</td>
                      <td className="amount-cell">{money(settlement.currentCalculation.grossSales)}</td>
                      <td className="amount-cell">{money(settlement.currentCalculation.grossCommission)}</td>
                      <td className="amount-cell">{money(settlement.currentCalculation.vendorCommission)}</td>
                      <td className="amount-cell">{money(settlement.currentCalculation.deductionTotal)}</td>
                      <td className="amount-cell">{money(settlement.currentCalculation.distributableVendorCommission)}</td>
                      <td className="amount-cell">{money(settlement.currentCalculation.managerAmount)}</td>
                      <td className="amount-cell">{money(settlement.currentCalculation.companyAmount)}</td>
                      <td className="amount-cell">{money(settlement.currentCalculation.finalSellerPaymentAmount)}</td>
                      <td>{settlement.evidenceStatus === 'confirmed' ? '확인 완료' : '미확인'}</td>
                      <td><Badge label={statusLabel(settlement.status)} tone={statusTone[settlement.status]} /></td>
                      <td>{settlement.assigneeName}</td>
                      <td>{formatKoreanDate(settlement.paymentDueDate)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <div className="schedule-mobile-list settlement-mobile-list">
            {filtered.map((settlement) => {
              const campaign = getCampaign(settlement)
              const salesImport = salesDataService.getSalesDataImportById(settlement.salesDataImportId)
              return <article className="settlement-mobile-card" key={settlement.id}>
                <button className="settlement-name-link" onClick={() => { sessionStorage.setItem('settlement-list-scroll', String(window.scrollY)); onOpenDetail(settlement.id) }} type="button"><strong>{campaign?.campaignName ?? settlement.campaignId}</strong><span>{campaign?.sellerName ?? '-'} · {campaign?.brandName ?? '-'}</span></button>
                <Badge label={statusLabel(settlement.status)} tone={statusTone[settlement.status]} />
                <dl><div><dt>판매 기간</dt><dd>{formatKoreanDate(salesImport?.salesStartDate)} ~ {formatKoreanDate(salesImport?.salesEndDate)}</dd></div><div><dt>셀러 지급 예정액</dt><dd>{money(settlement.currentCalculation.finalSellerPaymentAmount)}</dd></div><div><dt>매니저 지급 예정액</dt><dd>{money(settlement.currentCalculation.managerAmount)}</dd></div><div><dt>정산 담당자</dt><dd>{settlement.assigneeName} · v{settlement.settlementVersion}</dd></div></dl>
              </article>
            })}
          </div>
        </div>
      </section>
    </section>
  )
}

function Metric({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return <div className={`settlement-money-kpi ${tone ? `settlement-money-kpi--${tone}` : ''}`}><span>{label}</span><strong>{value}</strong></div>
}

type SellerBusinessDraft = {
  businessType: SellerBusinessType
  businessName: string
  realName: string
  residentNumber: string
}

function SellerBusinessEditor({
  hasStoredResidentNumber,
  initialBusinessName,
  initialBusinessType,
  initialRealName,
  onSave,
  sellerName,
}: {
  hasStoredResidentNumber: boolean
  initialBusinessName: string
  initialBusinessType: SellerBusinessType
  initialRealName: string
  onSave: (draft: SellerBusinessDraft) => Promise<void>
  sellerName: string
}) {
  const [draft, setDraft] = useState<SellerBusinessDraft>({ businessType: initialBusinessType, businessName: initialBusinessName, realName: initialRealName, residentNumber: '' })
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const isFreelancer = draft.businessType === 'freelancer'
  const canSave = isFreelancer
    ? Boolean(draft.realName.trim()) && (hasStoredResidentNumber || draft.residentNumber.replace(/\D/g, '').length === 13)
    : Boolean(draft.businessName.trim())

  const save = async () => {
    if (!canSave || saving) return
    setError('')
    setSaving(true)
    try {
      await onSave(draft)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '셀러 정보를 저장하지 못했습니다.')
      setSaving(false)
    }
  }

  return <>
    <h2>셀러 정보 등록</h2>
    <label className="form-field"><span>셀러명</span><input disabled value={sellerName} /></label>
    <label className="form-field"><span>사업자 유형</span><select onChange={(event) => setDraft((value) => ({ ...value, businessType: event.target.value as SellerBusinessType }))} value={draft.businessType}><option value="general_business">법인/개인사업자</option><option value="simplified_business">간이사업자</option><option value="freelancer">개인 프리랜서</option></select></label>
    {isFreelancer ? <>
      <label className="form-field"><span>실명</span><input autoComplete="name" onChange={(event) => setDraft((value) => ({ ...value, realName: event.target.value }))} value={draft.realName} /></label>
      <label className="form-field"><span>주민등록번호</span><ResidentRegistrationNumberInput onChange={(residentNumber) => setDraft((value) => ({ ...value, residentNumber }))} value={draft.residentNumber} /></label>
      <p>주민등록번호는 현재 로컬 저장소에 저장되지 않으며, 이 화면을 닫으면 폐기됩니다. 운영 연결 시 보안 서버에서 암호화·권한 기반으로 처리합니다.</p>
    </> : <>
      <label className="form-field"><span>사업자명</span><input autoFocus onChange={(event) => setDraft((value) => ({ ...value, businessName: event.target.value }))} placeholder="등록된 사업자명을 입력하세요" value={draft.businessName} /></label>
      <p>셀러명과 사업자명은 별도 정보로 저장됩니다. 증빙 유형은 사업자 유형에 따라 자동 결정됩니다.</p>
    </>}
    {error && <p className="settlement-readiness-modal__error">{error}</p>}
    <div className="modal-actions"><button className="primary-button" disabled={!canSave || saving} onClick={() => void save()} type="button">{saving ? '저장 중…' : '저장'}</button></div>
  </>
}

export function SettlementDetailPage({ settlementId, onBack, onOpenSalesData }: { settlementId: string; onBack: () => void; onOpenSalesData?: (importId: string, openEditor?: boolean) => void }) {
  const { profile: companyProfile } = useCompanyAuth()
  const [settlement, setSettlement] = useState<Settlement | null>(() => settlementService.getSettlementById(settlementId) ?? null)
  const [documentMode, setDocumentMode] = useState<DocumentMode>('셀러 전달용')
  const [documentNotice, setDocumentNotice] = useState('')
  const [compareOpen, setCompareOpen] = useState(false)
  const [sellerExportGeneratedAt, setSellerExportGeneratedAt] = useState('')
  const [managerExportGeneratedAt, setManagerExportGeneratedAt] = useState('')
  const [sellerExcelShare, setSellerExcelShare] = useState<{ url: string; expiresAt: string } | null>(null)
  const [sellerExcelBusy, setSellerExcelBusy] = useState(false)
  const [sellerExcelError, setSellerExcelError] = useState('')
  const requestedDocument = new URLSearchParams(window.location.search).get('document')
  const [vendorDocumentTab, setVendorDocumentTab] = useState<'seller' | 'manager' | 'company' | 'supplier'>('seller')
  const [expandedDocument, setExpandedDocument] = useState<'seller' | 'manager' | 'company' | 'supplier' | null>(requestedDocument === 'seller' || requestedDocument === 'manager' ? requestedDocument : null)
  const [paymentRequestTarget, setPaymentRequestTarget] = useState<EvidenceOwnerType | null>(null)
  const [paymentStatusTarget, setPaymentStatusTarget] = useState<EvidenceOwnerType | null>(null)
  const [revisionRequestOpen, setRevisionRequestOpen] = useState(false)
  const [revisionViewerOpen, setRevisionViewerOpen] = useState(false)
  const [revisionEditorOpen, setRevisionEditorOpen] = useState(false)
  const [revisionReason, setRevisionReason] = useState('')
  const [revisionRequestEditOpen, setRevisionRequestEditOpen] = useState(false)
  const [revisionRequestCancelOpen, setRevisionRequestCancelOpen] = useState(false)
  const [revisionRequestRejectOpen, setRevisionRequestRejectOpen] = useState(false)
  const [revisionRequestEditReason, setRevisionRequestEditReason] = useState('')
  const [revisionRequestRejectReason, setRevisionRequestRejectReason] = useState('')
  const [revisionRequestCancelReason, setRevisionRequestCancelReason] = useState('')
  const [confirmationModal, setConfirmationModal] = useState<'confirm' | 'release' | null>(null)
  const [confirmationReleaseReason, setConfirmationReleaseReason] = useState('')
  const [legacyCancellationTarget, setLegacyCancellationTarget] = useState<EvidenceOwnerType | null>(null)
  const [legacyCancellationReason, setLegacyCancellationReason] = useState('')
  const [readinessModal, setReadinessModal] = useState<ReadinessModal | null>(null)
  const [accountDraft, setAccountDraft] = useState({ bankName: '', accountNumber: '', accountHolder: '' })
  const [managerAccountDraft, setManagerAccountDraft] = useState({ bankName: '', accountNumber: '', accountHolder: '' })
  const [managerBusinessNameDraft, setManagerBusinessNameDraft] = useState('')
  const [managerRealNameDraft, setManagerRealNameDraft] = useState('')
  const [managerResidentNumberDraft, setManagerResidentNumberDraft] = useState('')
  const [managerBusinessTypeDraft, setManagerBusinessTypeDraft] = useState<SellerBusinessType>('general_business')
  const [clipboardToast, setClipboardToast] = useState<{ message: string; error?: boolean } | null>(null)
  const [, setMasterRevision] = useState(0)
  const [, setStorageRevision] = useState(0)
  const supplierDocumentRef = useRef<HTMLDivElement | null>(null)
  const sellerDocumentRef = useRef<HTMLDivElement | null>(null)
  const managerDocumentRef = useRef<HTMLDivElement | null>(null)
  const companyDocumentRef = useRef<HTMLDivElement | null>(null)
  const sellerExcelInputRef = useRef<HTMLInputElement | null>(null)
  const commissionSyncRef = useRef('')
  const confirmationRepairRef = useRef('')
  const sellerMasterLoadRef = useRef('')
  useEffect(() => {
    const refreshFromStorage = (event: Event) => {
      const key = (event as CustomEvent<{ key?: string }>).detail?.key
      if (key !== STORAGE_KEYS.salesDataRows && key !== STORAGE_KEYS.settlements) return
      setSettlement(settlementService.getSettlementById(settlementId) ?? null)
      setStorageRevision((value) => value + 1)
    }
    window.addEventListener('t3-storage-updated', refreshFromStorage)
    return () => window.removeEventListener('t3-storage-updated', refreshFromStorage)
  }, [settlementId])
  useEffect(() => {
    if (!settlement || commissionSyncRef.current === settlement.id) return
    commissionSyncRef.current = settlement.id
    void settlementService.syncProductRates(settlement.id).then((next) => {
      if (next) setSettlement({ ...next })
    })
  }, [settlement?.id])
  useEffect(() => {
    if (!settlement || confirmationRepairRef.current === settlement.id) return
    const targetImport = salesDataService.getSalesDataImportById(settlement.salesDataImportId)
    if (!targetImport || (targetImport.reviewStatus === '확정 완료' && targetImport.settlementStatus !== '정산 전')) return
    confirmationRepairRef.current = settlement.id
    salesDataService.markSettlementReady(targetImport.id)
    void cloudSyncService.syncKeys([STORAGE_KEYS.salesDataImports])
    queueMicrotask(() => setSettlement({ ...(settlementService.getSettlementById(settlement.id) ?? settlement) }))
  }, [settlement])
  useEffect(() => {
    if (!settlement) return
    const targetCampaign = getCampaign(settlement)
    if (!targetCampaign || sellerMasterLoadRef.current === targetCampaign.sellerId) return
    sellerMasterLoadRef.current = targetCampaign.sellerId
    void sellerMasterService.loadSellers(true).then(() => {
      setMasterRevision((value) => value + 1)
      setSettlement({ ...(settlementService.getSettlementById(settlement.id) ?? settlement) })
    }).catch(() => {
      sellerMasterLoadRef.current = ''
    })
  }, [settlement?.id])
  useEffect(() => {
    if (!expandedDocument) return
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') setExpandedDocument(null) }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [expandedDocument])
  useEffect(() => {
    if (!clipboardToast) return
    const timeout = window.setTimeout(() => setClipboardToast(null), 2000)
    return () => window.clearTimeout(timeout)
  }, [clipboardToast])
  useEffect(() => {
    if (!settlement) return
    const targetCampaign = getCampaign(settlement)
    const targetImport = salesDataService.getSalesDataImportById(settlement.salesDataImportId)
    const targetRows = salesDataService.getRowsByImportId(settlement.salesDataImportId)
    const targetRule = sellerSettlementService.getSellerSettlementRule(settlement.campaignId)
    const targetProfile = targetCampaign ? sellerMasterService.getSellerById(targetCampaign.sellerId) : undefined
    const targetDeductions = settlementService.getDeductionsBySettlementId(settlement.id).filter((item) => item.amount > 0)
    const hasCommissionIssues = (targetImport?.commissionSyncIssues?.length ?? 0) > 0
    const ratesValid = !hasCommissionIssues && targetRows.length > 0 && settlement.currentCalculation.totalCommissionRate >= settlement.currentCalculation.sellerCommissionRate && settlement.currentCalculation.sellerCommissionRate >= 0 && settlement.currentCalculation.totalCommissionRate <= 100
    const ownersResolved = targetDeductions.every((item) => item.costOwner !== 'undecided' && item.applyLocation !== 'needs_review')
    const accountRegistered = Boolean(targetProfile?.bankName?.trim() && targetProfile.accountNumber?.trim() && targetProfile.accountHolder?.trim())
    const automatic = {
      salesMatches: targetImport?.reviewStatus === '확정 완료' || settlement.reviewChecklist.salesMatches,
      commissionRateConfirmed: ratesValid || settlement.reviewChecklist.commissionRateConfirmed,
      costOwnersConfirmed: ownersResolved || settlement.reviewChecklist.costOwnersConfirmed,
      taxTypeConfirmed: Boolean(targetRule) || settlement.reviewChecklist.taxTypeConfirmed,
      evidenceConfirmed: Boolean(targetRule && getRecommendedEvidenceType(targetRule.businessType)) || settlement.reviewChecklist.evidenceConfirmed,
      paymentAccountConfirmed: accountRegistered || settlement.reviewChecklist.paymentAccountConfirmed,
    }
    const changed = Object.entries(automatic).some(([key, value]) => settlement.reviewChecklist[key as keyof typeof automatic] !== value)
    if (changed) queueMicrotask(() => setSettlement(settlementService.updateReviewChecklist(settlement.id, { ...settlement.reviewChecklist, ...automatic }) ?? null))
  }, [settlement])
  useEffect(() => {
    if (!settlement) return
    const targetCampaign = getCampaign(settlement)
    const targetProfile = targetCampaign ? sellerMasterService.getSellerById(targetCampaign.sellerId) : undefined
    const targetBusinessType = normalizeSellerBusinessType(targetProfile?.businessType)
    if (!targetBusinessType || sellerSettlementService.getSellerSettlementRule(settlement.campaignId)) return
    const rule = sellerSettlementService.ensureSellerSettlementRule(settlement.campaignId)
    if (!rule) return
    const evidenceType = getRecommendedEvidenceType(targetBusinessType)
    sellerSettlementService.saveRule({ ...rule, businessType: targetBusinessType, recommendedEvidenceType: evidenceType, confirmedEvidenceType: evidenceType, evidenceConfirmed: true, evidenceConfirmedBy: '허수정', evidenceConfirmedAt: new Date().toISOString(), updatedAt: new Date().toISOString() })
    queueMicrotask(() => { setMasterRevision((value) => value + 1); setSettlement({ ...(settlementService.getSettlementById(settlement.id) ?? settlement) }) })
  }, [settlement])
  if (!settlement) return <section className="settlement-detail-page"><button className="settlement-back-button" onClick={onBack} type="button">← 정산 관리로 돌아가기</button><div className="empty-state"><strong>정산을 찾을 수 없습니다.</strong><span>삭제되었거나 접근할 수 없는 정산입니다.</span></div></section>

  const campaign = getCampaign(settlement)
  const currentUser: AppUser = {
    id: companyProfile.id,
    name: companyProfile.display_name,
    role: companyProfile.role === 'ceo' || companyProfile.role === 'admin' ? '대표' : companyProfile.role === 'settlement_cs' ? '정산 담당자' : companyProfile.role === 'team_lead' ? '팀장' : companyProfile.role === 'md' ? 'MD' : '매니저',
  }
  const canEditCurrentSettlement = Boolean(currentUser && canEditSettlement(currentUser.role))
  const currentManagerIsAssigned = Boolean(campaign && isAssignedManager(currentUser, campaign.managerId, campaign.managerName))
  const canManageAllEvidence = companyProfile.role === 'ceo' || companyProfile.role === 'admin' || companyProfile.role === 'settlement_cs'
  const canUploadSellerEvidence = canManageAllEvidence
  const canUploadManagerEvidence = canManageAllEvidence || currentManagerIsAssigned
  const canAccessManagerDocument = Boolean(currentUser && canViewManagerSettlement(currentUser, campaign?.managerId, campaign?.managerName))
  const versions = settlementService.getSettlementVersionsBySettlementId(settlement.id)
  const logs = settlementService.getActivityLogsBySettlementId(settlement.id)
  const validation = validateSettlement(settlement)
  const salesImport = salesDataService.getSalesDataImportById(settlement.salesDataImportId)
  const salesRows = salesDataService.getRowsByImportId(settlement.salesDataImportId)
  const salesChannel = campaignChannel(campaign, salesImport)
  const sellerCollectsPayment = salesChannel === 'seller_checkout'
  const vendorSupply = salesImport?.supplyAudience === 'vendor'
  const hasThreePartyDocuments = vendorSupply || sellerCollectsPayment
  const transactionDocumentTabs: Array<{ id: 'seller' | 'manager' | 'company' | 'supplier'; label: string; requiresManagerAccess?: boolean }> = vendorSupply
    ? [{ id: 'seller', label: '벤더 전달용' }, { id: 'manager', label: '회사 내부용', requiresManagerAccess: true }, { id: 'supplier', label: '공급사 지급용' }]
    : sellerCollectsPayment
      ? [{ id: 'seller', label: '셀러 입금 요청' }, { id: 'manager', label: '매니저 정산서', requiresManagerAccess: true }, { id: 'company', label: '회사 내부용', requiresManagerAccess: true }, { id: 'supplier', label: '공급사 지급용' }]
      : []
  // A persisted settlement can only be created after sales confirmation. Treat it as
  // confirmation evidence while the repair effect above fixes an older split cloud state.
  const salesDataConfirmed = Boolean(salesImport)
  const sellerRule = sellerSettlementService.getSellerSettlementRule(settlement.campaignId)
  const sellerProfile = campaign ? sellerMasterService.getSellerById(campaign.sellerId) : undefined
  const effectiveSellerBusinessType = normalizeSellerBusinessType(sellerProfile?.businessType ?? sellerRule?.businessType)
  const managerProfile = campaign ? managerPaymentService.getProfile(campaign.managerId) : undefined
  const hasSellerAccount = Boolean(sellerProfile?.bankName?.trim() && sellerProfile.accountNumber?.trim() && sellerProfile.accountHolder?.trim())
  const hasManagerAccount = Boolean(managerProfile?.bankName?.trim() && managerProfile.accountNumber?.trim() && managerProfile.accountHolder?.trim())
  const managerBusinessType = managerPaymentService.getBusinessType(campaign?.managerName ?? '', campaign?.managerId)
  const companyDirectManager = Boolean((salesDataService.getSalesDataImportById(settlement.salesDataImportId)?.supplyAudience ?? campaign?.supplyAudience) === 'vendor' || (campaign && isCompanyDirectManager(campaign.managerId, campaign.managerName)))
  const sellerPaymentRequest = campaign ? paymentRequestService.getActivePaymentRequestForRecipient(settlement.id, 'seller', campaign.sellerId) : undefined
  const managerPaymentRequest = campaign ? paymentRequestService.getActivePaymentRequestForRecipient(settlement.id, 'manager', campaign.managerId) : undefined
  const settlementConfirmed = settlementService.isSettlementConfirmed(settlement)
  const hasLegacyPaymentConflict = !settlementConfirmed && Boolean(sellerPaymentRequest || managerPaymentRequest)
  const pendingRevisionRequest = settlementService.getPendingRevisionRequest(settlement.id)
  const hasUnresolvedRevision = Boolean(pendingRevisionRequest)
  const canReleaseConfirmation = currentUser?.role === '대표' || currentUser?.role === '정산 담당자'
  const sellerRequestEditable = Boolean(sellerPaymentRequest && paymentRequestService.canEditPaymentRequest(sellerPaymentRequest))
  const managerRequestEditable = Boolean(managerPaymentRequest && paymentRequestService.canEditPaymentRequest(managerPaymentRequest))
  const sellerRequestReasons = campaign && effectiveSellerBusinessType ? paymentRequestService.validateSellerPaymentRequest({
    settlementId: settlement.id, ownerId: campaign.sellerId, businessType: effectiveSellerBusinessType,
    evidenceTypeConfirmed: Boolean(sellerRule?.evidenceConfirmed && sellerRule.confirmedEvidenceType), accountConfirmed: hasSellerAccount,
    calculationCompleted: true, calculationErrors: validation.errors, amountConfirmed: true, sourceVersion: settlement.settlementVersion,
  }).reasons : ['셀러 사업자 유형이 등록되지 않았습니다.']
  const managerRequestReasons = !campaign ? ['담당 매니저 정보가 없습니다.'] : !managerProfile ? ['매니저 사업자 유형이 등록되지 않았습니다.'] : paymentRequestService.validateManagerPaymentRequest({
    settlementId: settlement.id, ownerId: campaign.managerId, businessType: managerBusinessType,
    evidenceTypeConfirmed: true, accountConfirmed: hasManagerAccount, calculationCompleted: true,
    calculationErrors: [], amountConfirmed: settlement.currentCalculation.managerAmount >= 0, sourceVersion: settlement.settlementVersion,
  }).reasons
  const paymentStateReason = (request: typeof sellerPaymentRequest, completed: boolean) => {
    if (completed || request?.status === 'payment_completed' || request?.status === 'remittance_confirmed') return '지급이 완료되었습니다.'
    if (request?.status === 'approved') return '지급 승인이 완료되었습니다.'
    if (request?.status === 'rejected') return '지급 요청이 반려되었습니다. 내용을 수정한 뒤 다시 요청해주세요.'
    if (request) return `지급 요청이 생성되었습니다. ${paymentStatusLabels[request.status]} 상태입니다.`
    return ''
  }
  const confirmationReason = '정산서를 먼저 확정해주세요.'
  const sellerPermissionReasons = canUploadSellerEvidence ? [] : ['셀러 증빙은 대표·정산 담당자만 등록할 수 있습니다.']
  const managerPermissionReasons = canUploadManagerEvidence ? [] : ['본인이 담당한 공동구매 정산 건에만 증빙을 등록할 수 있습니다.']
  const sellerButtonBlockReasons = [...sellerPermissionReasons, ...(sellerPaymentRequest || settlement.sellerPaymentCompleted ? sellerRequestEditable ? [] : [paymentStateReason(sellerPaymentRequest, settlement.sellerPaymentCompleted)] : settlementConfirmed ? sellerRequestReasons : [confirmationReason])]
  const managerButtonBlockReasons = companyDirectManager ? [] : [...managerPermissionReasons, ...(managerPaymentRequest || settlement.managerPaymentCompleted ? managerRequestEditable ? [] : [paymentStateReason(managerPaymentRequest, settlement.managerPaymentCompleted)] : settlementConfirmed ? managerRequestReasons : [confirmationReason])]
  const sellerActionReasons = [...sellerPermissionReasons, ...(sellerPaymentRequest || settlement.sellerPaymentCompleted ? [] : settlementConfirmed ? sellerRequestReasons : [confirmationReason])]
  const managerActionReasons = companyDirectManager ? [] : [...managerPermissionReasons, ...(managerPaymentRequest || settlement.managerPaymentCompleted ? [] : settlementConfirmed ? managerRequestReasons : [confirmationReason])]
  const sellerPaymentStatus = sellerPaymentRequest?.status ?? settlement.sellerPaymentRequestStatus
  const managerPaymentStatus = managerPaymentRequest?.status ?? settlement.managerPaymentRequestStatus
  const sellerStatusNotice = getPaymentPresentation(sellerPaymentStatus, settlement.sellerPaymentCompleted).notice
  const sellerCollectionStatusNotice: PayoutStatusNotice = settlementConfirmed
    ? { title: '셀러 입금 요청 정산서', detail: '셀러가 보유한 판매대금에서 셀러 수수료를 제외한 금액을 와이즈벤더가 수령합니다.', tone: 'waiting' }
    : { title: '해당 정산서는 아직 확정되지 않은 정산서입니다.', detail: '', tone: 'unconfirmed' }
  const managerStatusNotice: PayoutStatusNotice = companyDirectManager
    ? { title: '대표 직속 · 지급신청 불필요', detail: '매니저 지급 없이 회사 귀속 금액만 정산서에서 확인합니다.', tone: 'complete' }
    : getPaymentPresentation(managerPaymentStatus, settlement.managerPaymentCompleted).notice
  const unconfirmedStatusNotice: PayoutStatusNotice = { title: '해당 정산서는 아직 확정되지 않은 정산서입니다.', detail: '', tone: 'unconfirmed' }
  const checklist = settlement.reviewChecklist
  const deductions = settlementService.getDeductionsBySettlementId(settlement.id)
  const actualCosts = deductions.filter((item) => item.amount > 0)
  const unresolvedCostOwners = actualCosts.filter((item) => item.costOwner === 'undecided' || item.applyLocation === 'needs_review')
  const totalRate = settlement.currentCalculation.totalCommissionRate
  const sellerRate = settlement.currentCalculation.sellerCommissionRate
  const commissionRatesValid = salesRows.length > 0 && salesRows.every((row) => {
    const rowTotal = row.totalCommissionRate ?? totalRate
    const rowSeller = row.sellerCommissionRate ?? sellerRate
    const hasIssue = salesImport?.commissionSyncIssues?.some((issue) => issue.rowId === row.id)
    return !hasIssue && Number.isFinite(rowTotal) && Number.isFinite(rowSeller) && rowTotal >= rowSeller && rowSeller >= 0 && rowTotal <= 100
  })
  const managerShareTotal = settlement.currentCalculation.managerShareRate + settlement.currentCalculation.companyShareRate
  const managerShareValid = Math.abs(managerShareTotal - 100) < 0.001
  const settlementPreparationWarnings: ReadinessWarning[] = []
  if (!salesDataConfirmed) settlementPreparationWarnings.push({ id: 'sales', message: '판매 데이터 확정이 필요합니다.', actionLabel: '판매 데이터 확인', severity: 'blocking', action: () => onOpenSalesData?.(settlement.salesDataImportId) })
  if ((salesImport?.commissionSyncUnmatchedRows ?? 0) > 0) settlementPreparationWarnings.push({ id: 'sku-rate-match', message: `상품 DB 수수료와 연결되지 않은 판매행이 ${salesImport?.commissionSyncUnmatchedRows}개 있습니다.`, actionLabel: '판매 데이터 확인', severity: 'blocking', action: () => onOpenSalesData?.(settlement.salesDataImportId) })
  if (!commissionRatesValid) settlementPreparationWarnings.push({ id: 'commission', message: '수수료율 확인이 필요합니다.', actionLabel: '수수료율 확인', severity: 'blocking', action: () => setReadinessModal('commission') })
  const costsConfirmed = checklist.sampleCostReflected && checklist.eventCostReflected && checklist.otherDeductionsConfirmed && checklist.costOwnersConfirmed && unresolvedCostOwners.length === 0
  if (!costsConfirmed) settlementPreparationWarnings.push({ id: 'costs', message: '샘플비·차감·조정내역·기타 차감과 부담 주체를 한 번에 확인해주세요.', actionLabel: '비용/차감 확인', severity: 'non-blocking', action: () => setReadinessModal('costs') })
  if (!companyDirectManager && (!checklist.managerShareConfirmed || !managerShareValid)) settlementPreparationWarnings.push({ id: 'share', message: '매니저 배분율 확인이 필요합니다.', actionLabel: '배분율 확인', severity: managerShareValid ? 'non-blocking' : 'blocking', action: () => setReadinessModal('share') })
  if (salesImport?.supplyAudience !== 'vendor' && !effectiveSellerBusinessType) settlementPreparationWarnings.push({ id: 'business', message: '사업자 유형이 등록되지 않았습니다.', actionLabel: '셀러 정보 등록', severity: 'non-blocking', action: () => setReadinessModal('business') })
  if (salesImport?.supplyAudience !== 'vendor' && !effectiveSellerBusinessType) settlementPreparationWarnings.push({ id: 'evidence', message: '증빙 유형 확인이 필요합니다.', actionLabel: '증빙 확인', severity: 'non-blocking', action: () => setReadinessModal('business') })
  if (salesImport?.supplyAudience !== 'vendor' && !sellerCollectsPayment && !hasSellerAccount) settlementPreparationWarnings.push({ id: 'account', message: '셀러 지급 계좌가 등록되지 않았습니다.', actionLabel: '계좌 등록', severity: 'non-blocking', action: () => { setAccountDraft({ bankName: sellerProfile?.bankName ?? '', accountNumber: sellerProfile?.accountNumber ?? '', accountHolder: sellerProfile?.accountHolder ?? '' }); setReadinessModal('account') } })
  const blockingWarnings = settlementPreparationWarnings.filter((item) => item.severity === 'blocking')
  const nonBlockingWarnings = settlementPreparationWarnings.filter((item) => item.severity === 'non-blocking')

  const confirmChecklist = (values: Partial<typeof checklist>) => {
    settlementService.updateReviewChecklist(settlement.id, { ...checklist, ...values })
    setSettlement(settlementService.getSettlementById(settlement.id) ?? null)
  }

  const submitRevisionRequest = () => {
    const next = settlementService.requestRevision(settlement.id, revisionReason, currentUser?.name ?? '허수정')
    if (!next) return
    setSettlement({ ...next })
    setRevisionReason('')
    setRevisionRequestOpen(false)
    showClipboardToast('정산 수정 요청이 등록되었습니다.')
  }

  const refreshRevisionState = () => setSettlement({ ...(settlementService.getSettlementById(settlement.id) ?? settlement) })
  const updatePendingRevisionRequest = () => {
    if (!pendingRevisionRequest || !currentUser) return
    try { settlementService.updateRevisionRequest(pendingRevisionRequest.id, revisionRequestEditReason, currentUser.name); setRevisionRequestEditOpen(false); refreshRevisionState(); showClipboardToast('수정 요청 내용이 변경되었습니다.') }
    catch (error) { showClipboardToast(error instanceof Error ? error.message : '수정 요청을 변경하지 못했습니다.', true) }
  }
  const cancelPendingRevisionRequest = () => {
    if (!pendingRevisionRequest || !currentUser) return
    try { settlementService.cancelRevisionRequest(pendingRevisionRequest.id, currentUser.name, revisionRequestCancelReason); setRevisionRequestCancelOpen(false); setRevisionViewerOpen(false); setRevisionRequestCancelReason(''); refreshRevisionState(); showClipboardToast('수정 요청이 취소되었습니다.') }
    catch (error) { showClipboardToast(error instanceof Error ? error.message : '수정 요청을 취소하지 못했습니다.', true) }
  }
  const rejectPendingRevisionRequest = () => {
    if (!pendingRevisionRequest || !currentUser) return
    try { settlementService.rejectRevisionRequest(pendingRevisionRequest.id, revisionRequestRejectReason, currentUser.name, currentUser.role); setRevisionRequestRejectOpen(false); setRevisionViewerOpen(false); setRevisionRequestRejectReason(''); refreshRevisionState(); showClipboardToast('수정 요청이 반려되었습니다.') }
    catch (error) { showClipboardToast(error instanceof Error ? error.message : '수정 요청을 반려하지 못했습니다.', true) }
  }
  const cancelLegacyPaymentRequest = () => {
    if (!currentUser || !canEditCurrentSettlement || !legacyCancellationTarget) return
    const request = legacyCancellationTarget === 'seller' ? sellerPaymentRequest : managerPaymentRequest
    if (!request) return
    try {
      paymentRequestService.cancelLegacyPaymentRequest(request.id, legacyCancellationReason, currentUser.name, currentUser.role)
      setLegacyCancellationTarget(null)
      setLegacyCancellationReason('')
      refreshRevisionState()
      showClipboardToast('지급요청이 취소되었습니다.')
    } catch (error) { showClipboardToast(error instanceof Error ? error.message : '지급요청을 취소하지 못했습니다.', true) }
  }

  const confirmSettlementDocument = () => {
    try {
      if (blockingWarnings.length) throw new Error(`정산서를 확정할 수 없습니다. ${blockingWarnings.map((item) => item.message).join(' ')}`)
      const next = settlementService.confirmSettlement(settlement.id, currentUser?.name ?? '허수정')
      setSettlement({ ...next })
      void cloudSyncService.syncKeys([STORAGE_KEYS.settlements, STORAGE_KEYS.salesDataImports])
      setConfirmationModal(null)
      showClipboardToast('정산서가 확정되었습니다.')
    } catch (error) {
      showClipboardToast(error instanceof Error ? error.message : '정산서를 확정하지 못했습니다.', true)
    }
  }

  const releaseSettlementDocument = () => {
    try {
      if (settlement.sellerPaymentCompleted || settlement.managerPaymentCompleted) throw new Error('지급 완료된 정산서는 직접 수정할 수 없습니다.')
      if (sellerPaymentRequest || managerPaymentRequest) throw new Error('지급요청이 생성된 정산서입니다. 먼저 기존 지급요청을 취소하거나 정정해주세요.')
      const next = settlementService.releaseSettlementConfirmation(settlement.id, confirmationReleaseReason, currentUser?.name ?? '허수정', currentUser?.role ?? '정산 담당자')
      setSettlement({ ...next })
      setConfirmationReleaseReason('')
      setConfirmationModal(null)
      showClipboardToast('정산서 확정이 해제되었습니다.')
    } catch (error) {
      showClipboardToast(error instanceof Error ? error.message : '확정을 해제하지 못했습니다.', true)
    }
  }

  const saveSellerBusinessType = async (draft: SellerBusinessDraft) => {
    if (!campaign) return
    const normalizedMasterType = normalizeSellerBusinessType(draft.businessType) ?? 'general_business'
    const isFreelancer = normalizedMasterType === 'freelancer'
    if (isFreelancer && !draft.realName.trim()) throw new Error('실명을 입력해주세요.')
    if (isFreelancer && !sensitiveIdentityService.has('seller', campaign.sellerId) && draft.residentNumber.replace(/[^0-9]/g, '').length !== 13) throw new Error('주민등록번호 13자리를 입력해주세요.')
    if (!isFreelancer && !draft.businessName.trim()) throw new Error('사업자명을 입력해주세요.')
    try {
      await sellerMasterService.loadSellers(true)
      const currentSellerProfile = sellerMasterService.getSellerById(campaign.sellerId) ?? sellerProfile
      if (isFreelancer && draft.residentNumber) sensitiveIdentityService.stage('seller', campaign.sellerId, draft.residentNumber)
      const savedProfile = await sellerMasterService.saveSellerProfile({
        id: campaign.sellerId,
        name: campaign.sellerName,
        realName: isFreelancer ? draft.realName.trim() : currentSellerProfile?.realName,
        businessType: normalizedMasterType,
        businessName: isFreelancer ? undefined : draft.businessName.trim(),
        defaultMdId: campaign.mdId,
        defaultManagerId: campaign.managerId,
        bankName: currentSellerProfile?.bankName,
        accountNumber: currentSellerProfile?.accountNumber,
        accountHolder: currentSellerProfile?.accountHolder,
        active: currentSellerProfile?.active,
        instagramId: currentSellerProfile?.instagramId,
        contact: currentSellerProfile?.contact,
        businesses: currentSellerProfile?.businesses?.map((business) => business.isPrimary ? {
          ...business,
          businessName: isFreelancer ? business.businessName : draft.businessName.trim(),
          businessType: normalizedMasterType,
        } : business),
      })
      const rule = sellerSettlementService.ensureSellerSettlementRule(settlement.campaignId)
      if (!rule) throw new Error('셀러 정산 규칙을 생성하지 못했습니다.')
      const evidenceType = getRecommendedEvidenceType(normalizedMasterType)
      sellerSettlementService.saveRule({ ...rule, businessType: normalizedMasterType, recommendedEvidenceType: evidenceType, confirmedEvidenceType: evidenceType, evidenceConfirmed: true, evidenceConfirmedBy: '허수정', evidenceConfirmedAt: new Date().toISOString(), updatedAt: new Date().toISOString() })
      settlementService.updateReviewChecklist(settlement.id, { ...checklist, taxTypeConfirmed: true, evidenceConfirmed: true })
      const latestRule = sellerSettlementService.getSellerSettlementRule(settlement.campaignId)
      if (normalizeSellerBusinessType(savedProfile.businessType) !== normalizedMasterType || normalizeSellerBusinessType(latestRule?.businessType) !== normalizedMasterType) throw new Error('저장 결과를 확인하지 못했습니다.')
      setMasterRevision((value) => value + 1)
      setSettlement({ ...(settlementService.getSettlementById(settlement.id) ?? settlement) })
      showClipboardToast('셀러 정보가 저장되었습니다.')
      setReadinessModal(null)
    } catch (error) {
      const reason = error instanceof Error ? error.message : '셀러 정보를 저장하지 못했습니다.'
      showClipboardToast(reason, true)
      throw new Error(reason)
    }
  }

  const saveSellerAccount = async () => {
    if (!campaign || !accountDraft.bankName.trim() || !accountDraft.accountNumber.trim() || !accountDraft.accountHolder.trim()) return
    try {
      let currentSellerProfile = sellerMasterService.getSellerById(campaign.sellerId) ?? sellerProfile
      if (!currentSellerProfile) {
        await sellerMasterService.loadSellers(true)
        currentSellerProfile = sellerMasterService.getSellerById(campaign.sellerId)
      }
      await sellerMasterService.saveSellerProfile({
        id: campaign.sellerId,
        name: campaign.sellerName,
        businessType: currentSellerProfile?.businessType ?? (effectiveSellerBusinessType === 'freelancer' ? 'freelancer' : effectiveSellerBusinessType === 'simplified_business' ? 'simplified_business' : effectiveSellerBusinessType ? 'general_business' : undefined),
        businessName: currentSellerProfile?.businessName,
        realName: currentSellerProfile?.realName,
        defaultMdId: campaign.mdId,
        defaultManagerId: campaign.managerId,
        bankName: accountDraft.bankName.trim(),
        accountNumber: accountDraft.accountNumber.trim(),
        accountHolder: accountDraft.accountHolder.trim(),
        active: currentSellerProfile?.active,
        instagramId: currentSellerProfile?.instagramId,
        contact: currentSellerProfile?.contact,
        businesses: currentSellerProfile?.businesses?.map((business) => business.isPrimary ? {
          ...business,
          bankName: accountDraft.bankName.trim(),
          accountNumber: accountDraft.accountNumber.trim(),
          accountHolder: accountDraft.accountHolder.trim(),
        } : business),
      })
      settlementService.updateEvidence(settlement.id, settlement.evidenceStatus, settlement.taxEvidenceConfirmed, true)
      confirmChecklist({ paymentAccountConfirmed: true })
      setMasterRevision((value) => value + 1)
      setReadinessModal(null)
      showClipboardToast('셀러 계좌가 Supabase에 저장되었습니다.')
    } catch (error) {
      showClipboardToast(error instanceof Error ? error.message : '셀러 계좌를 저장하지 못했습니다.', true)
    }
  }

  const saveManagerProfileDraft = async (target: 'business' | 'account') => {
    if (!campaign) return
    const isFreelancer = managerBusinessTypeDraft === 'freelancer'
    if (target === 'business' && isFreelancer && (!managerRealNameDraft.trim() || (!sensitiveIdentityService.has('manager', campaign.managerId) && managerResidentNumberDraft.replace(/[^0-9]/g, '').length !== 13))) return
    if (target === 'business' && !isFreelancer && !managerBusinessNameDraft.trim()) return
    if (target === 'account' && (!managerAccountDraft.bankName.trim() || !managerAccountDraft.accountNumber.trim() || !managerAccountDraft.accountHolder.trim())) return
    if (target === 'business' && isFreelancer && managerResidentNumberDraft) sensitiveIdentityService.stage('manager', campaign.managerId, managerResidentNumberDraft)
    try {
      managerPaymentService.saveProfile({ id: campaign.managerId, name: campaign.managerName, realName: isFreelancer ? managerRealNameDraft.trim() : managerProfile?.realName, businessName: isFreelancer ? undefined : managerBusinessNameDraft.trim() || undefined, businessType: managerBusinessTypeDraft, bankName: managerAccountDraft.bankName.trim(), accountNumber: managerAccountDraft.accountNumber.trim(), accountHolder: managerAccountDraft.accountHolder.trim(), taxRegistrationNumber: managerProfile?.taxRegistrationNumber })
      await cloudSyncService.syncKeys([STORAGE_KEYS.managerMasters])
      settlementService.updateEvidence(settlement.id, settlement.evidenceStatus, settlement.taxEvidenceConfirmed, true)
      setSettlement(settlementService.getSettlementById(settlement.id) ?? null)
      setMasterRevision((value) => value + 1)
      setReadinessModal('manager-info')
      showClipboardToast('매니저 정보가 공용 DB에 저장되었습니다.')
    } catch (error) {
      showClipboardToast(error instanceof Error ? error.message : '매니저 정보를 공용 DB에 저장하지 못했습니다.', true)
    }
  }

  const showClipboardToast = (message: string, error = false) => setClipboardToast({ message, error })

  const sellerExcelShareText = (share: { url: string; expiresAt: string } | null = sellerExcelShare) => share
    ? `\n\n구매내역 원본 엑셀: ${share.url}\n다운로드 기한: ${new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', year: 'numeric', month: 'long', day: 'numeric' }).format(new Date(share.expiresAt))}까지 (14일)`
    : ''

  const buildSellerMessage = (share: { url: string; expiresAt: string } | null = sellerExcelShare) => {
    const excelText = sellerExcelShareText(share)
    if (salesImport?.supplyAudience === 'vendor') {
      const report = calculateVendorDocument(salesRows, salesImport, campaign)
      return `안녕하세요. ${salesImport.settlementVendorName} 벤더 정산서 전달드립니다. ${report.receivable ? `합의 수수료를 제외한 물품대금과 배송비 합계 ${report.finalAmount === undefined ? '(조건 확인 필요)' : money(report.finalAmount)}를 와이즈벤더로 입금 부탁드립니다.` : '품목별 합의 수수료와 정산금액을 확인해주세요.'}`
    }
    if (salesImport && campaignChannel(campaign, salesImport) === 'seller_checkout') {
      const report = calculateVendorDocument(salesRows, salesImport, campaign)
      const sellerAdjustment = settlement.currentCalculation.sellerDeductionTotal
      const finalReceivable = report.finalAmount === undefined ? undefined : report.finalAmount + sellerAdjustment
      return `안녕하세요, ${campaign?.sellerName || '셀러'}님.\n${campaign?.campaignName || settlement.campaignId || '공동구매'} 셀러 링크 정산서 전달드립니다.\n\n셀러 수수료를 제외한 물품대금과 배송비${sellerAdjustment > 0 ? ' 및 셀러 부담 차감·조정액' : ''} 합계 ${finalReceivable === undefined ? '(조건 확인 필요)' : money(finalReceivable)}를 와이즈벤더 계좌로 입금 부탁드립니다.\n입금 계좌: ${companySettlementProfile.settlementBankName} ${companySettlementProfile.settlementBankAccount} / ${companySettlementProfile.settlementAccountHolder}\n\n품목별 판매수량과 정산금액 확인 부탁드립니다.${excelText}\n감사합니다.`
    }
    const schedule = getSellerSettlementSchedule(settlement.createdAt)
    const evidenceName = sellerRule?.businessType === 'freelancer' ? '원천세 리스트 등록' : sellerRule?.businessType === 'simplified_business' ? '현금영수증 발행' : sellerRule ? '세금계산서 발행' : '데이터 미연결'
    const businessType = sellerRule?.businessType === 'corporation' || sellerRule?.businessType === 'general_business' ? 'general_business' : sellerRule?.businessType
    const productSubtotal = calculateSellerProductSubtotal(salesRows, settlement.currentCalculation.sellerCommissionRate)
    const finalDeposit = businessType
      ? calculateFinalSellerPayment(productSubtotal.commissionAmount, businessType, settlement.currentCalculation.sellerDeductionTotal).finalSellerPaymentAmount
      : Math.max(productSubtotal.commissionAmount - settlement.currentCalculation.sellerDeductionTotal, 0)
    const period = `${formatKoreanDate(salesImport?.salesStartDate || campaign?.startDate)} ~ ${formatKoreanDate(salesImport?.salesEndDate || campaign?.endDate)}`
    const evidenceRequest = sellerRule?.businessType === 'freelancer' ? '원천세 등록을 위해 필요한 정보를 확인해주세요.' : sellerRule?.businessType === 'simplified_business' ? '현금영수증 발행 부탁드립니다.' : sellerRule ? '세금계산서 발행 부탁드립니다.' : '필요 증빙 정보를 확인해주세요.'
    return `안녕하세요, ${campaign?.sellerName || '셀러'}님.\n${campaign?.campaignName || settlement.campaignId || '공동구매'} 정산서 전달드립니다.\n\n공구기간: ${period}\n총매출: ${money(productSubtotal.salesAmount)}\n최종 입금액: ${money(finalDeposit)}\n필요 증빙: ${evidenceName}\n증빙 마감일: ${formatKoreanDocumentDate(schedule.evidenceDeadline)}\n입금 예정일: ${formatKoreanDocumentDate(schedule.paymentDate)}\n\n${evidenceRequest}\n정산 내용 확인 부탁드립니다.${excelText}\n\n금요일까지 필요한 증빙자료 전달 및 발행이 완료된 경우,\n기재된 입금 예정일에 입금됩니다.\n입금 예정일이 휴일인 경우 다음 영업일에 지급됩니다.\n\n감사합니다.`
  }

  const createSellerExcelShare = async () => {
    if (!salesImport?.originalSalesFileStoragePath) {
      sellerExcelInputRef.current?.click()
      return null
    }
    setSellerExcelBusy(true)
    setSellerExcelError('')
    try {
      const share = await sellerSettlementFileService.createShareLink(salesImport.originalSalesFileStoragePath)
      setSellerExcelShare(share)
      showClipboardToast('14일 동안 열리는 구매내역 엑셀 링크를 만들었습니다.')
      return share
    } catch (error) {
      const message = error instanceof Error ? error.message : '구매내역 링크를 만들지 못했습니다.'
      setSellerExcelError(message)
      showClipboardToast(message, true)
      return null
    } finally { setSellerExcelBusy(false) }
  }

  const uploadSellerExcel = async (file?: File) => {
    if (!file || !salesImport) return
    setSellerExcelBusy(true)
    setSellerExcelError('')
    try {
      const path = await sellerSettlementFileService.uploadOriginal(file, {
        campaignId: salesImport.campaignId,
        salesDataImportId: salesImport.id,
        previousPath: salesImport.originalSalesFileStoragePath,
      })
      salesDataService.updateSalesDataImport({ ...salesImport, fileName: file.name, fileSize: file.size, originalSalesFileStoragePath: path, originalSalesFileStoredAt: new Date().toISOString() })
      await cloudSyncService.syncKeys([STORAGE_KEYS.salesDataImports])
      setStorageRevision((value) => value + 1)
      const share = await sellerSettlementFileService.createShareLink(path)
      setSellerExcelShare(share)
      showClipboardToast('원본 구매내역을 등록하고 14일 링크를 만들었습니다.')
    } catch (error) {
      const message = error instanceof Error ? error.message : '원본 엑셀을 등록하지 못했습니다.'
      setSellerExcelError(message)
      showClipboardToast(message, true)
    } finally {
      setSellerExcelBusy(false)
      if (sellerExcelInputRef.current) sellerExcelInputRef.current.value = ''
    }
  }

  const copySellerExcelLink = async () => {
    const share = sellerExcelShare ?? await createSellerExcelShare()
    if (!share) return
    try {
      await navigator.clipboard.writeText(share.url)
      showClipboardToast('구매내역 엑셀 링크를 복사했습니다.')
    } catch { showClipboardToast('링크를 복사하지 못했습니다.', true) }
  }

  const copySellerMessage = async () => {
    try {
      if (!navigator.clipboard?.writeText) throw new Error('Clipboard API unavailable')
      await navigator.clipboard.writeText(buildSellerMessage())
      showClipboardToast('클립보드로 복사되었습니다.')
    } catch { showClipboardToast('복사하지 못했습니다. 다시 시도해주세요.', true) }
  }

  const createDocumentPng = (target: RefObject<HTMLDivElement | null>, exportClass?: string, setGeneratedAt?: (value: string) => void): Promise<Blob> => {
    const node = target.current
    if (!node) return Promise.reject(new Error('정산서 영역을 찾을 수 없습니다.'))
    const existing = documentPngJobs.get(node)
    if (existing) return existing
    const job = (async () => {
      if (setGeneratedAt) flushSync(() => setGeneratedAt(formatKoreanExportTime()))
      if (exportClass) node.classList.add(exportClass)
      try {
        // Keep clipboard.write in the original tap; only defer the PNG work.
        await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
        const mobile = window.matchMedia('(max-width: 768px)').matches
        const blob = await toBlob(node, {
          backgroundColor: '#ffffff',
          cacheBust: false,
          preferredFontFormat: 'woff2',
          pixelRatio: mobile ? 1.5 : 2,
        })
        if (!blob) throw new Error('PNG 생성에 실패했습니다.')
        return blob
      } finally {
        if (exportClass) node.classList.remove(exportClass)
        if (setGeneratedAt) flushSync(() => setGeneratedAt(''))
      }
    })()
    documentPngJobs.set(node, job)
    void job.finally(() => documentPngJobs.delete(node)).catch(() => undefined)
    return job
  }
  const exportSupplierDocument = async (copy: boolean) => {
    try {
      const pending = createDocumentPng(supplierDocumentRef, 'seller-document--exporting')
      if (copy && navigator.clipboard?.write && typeof ClipboardItem !== 'undefined') {
        await navigator.clipboard.write([new ClipboardItem({ 'image/png': pending })])
        showClipboardToast('공급사 정산서 이미지를 복사했습니다.')
      } else {
        const blob = await pending
        const url = URL.createObjectURL(blob)
        const link = document.createElement('a'); link.href = url; link.download = `공급사정산서_${campaign?.campaignName ?? settlement.id}.png`; link.click(); URL.revokeObjectURL(url)
        showClipboardToast('공급사 정산서 이미지를 저장했습니다.')
      }
    } catch { showClipboardToast('이미지 생성에 실패했습니다. 다시 시도해주세요.', true) }
  }
  const createSellerDocumentPng = () => createDocumentPng(sellerDocumentRef, 'seller-document--exporting', setSellerExportGeneratedAt)

  const saveSellerDocumentImage = async () => {
    try {
      const blob = await createSellerDocumentPng()
      const pngUrl = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = pngUrl
      link.download = `정산서_${campaign?.sellerName ?? '셀러'}_${campaign?.campaignName ?? settlement.id}_${new Date().toISOString().slice(0, 10)}.png`
      link.click()
      URL.revokeObjectURL(pngUrl)
      setDocumentNotice('셀러용 정산서를 이미지로 저장했습니다.')
    } catch (error) {
      setDocumentNotice(error instanceof Error ? error.message : '이미지 저장에 실패했습니다.')
    }
  }

  const copySellerDocumentImage = async () => {
    if (!window.isSecureContext) {
      showClipboardToast('복사하지 못했습니다. 다시 시도해주세요.', true)
      return
    }
    if (!navigator.clipboard?.write || typeof ClipboardItem === 'undefined') {
      showClipboardToast('복사하지 못했습니다. 다시 시도해주세요.', true)
      return
    }
    try {
      const pngPromise = createSellerDocumentPng()
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': pngPromise })])
      showClipboardToast('클립보드로 복사되었습니다.')
    } catch (error) {
      if (error instanceof DOMException && error.name === 'NotAllowedError') {
        showClipboardToast('복사하지 못했습니다. 다시 시도해주세요.', true)
      } else {
        showClipboardToast('복사하지 못했습니다. 다시 시도해주세요.', true)
      }
    }
  }

  const copySellerDocumentImageAndMessage = async () => {
    if (!window.isSecureContext || !navigator.clipboard?.write || typeof ClipboardItem === 'undefined') {
      showClipboardToast('이 브라우저에서는 이미지와 문구를 함께 복사할 수 없습니다.', true)
      return
    }
    try {
      const png = await createSellerDocumentPng()
      const message = buildSellerMessage()
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => typeof reader.result === 'string' ? resolve(reader.result) : reject(new Error('이미지를 읽지 못했습니다.'))
        reader.onerror = () => reject(reader.error ?? new Error('이미지를 읽지 못했습니다.'))
        reader.readAsDataURL(png)
      })
      const escapedMessage = message
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#039;')
        .replaceAll('\n', '<br>')
      const html = `<div><img alt="셀러 정산서" src="${dataUrl}"><p>${escapedMessage}</p></div>`
      await navigator.clipboard.write([new ClipboardItem({
        'image/png': png,
        'text/html': new Blob([html], { type: 'text/html' }),
        'text/plain': new Blob([message], { type: 'text/plain' }),
      })])
      showClipboardToast('정산서 이미지와 전달 문구를 함께 복사했습니다.')
    } catch {
      showClipboardToast('이미지와 문구를 함께 복사하지 못했습니다. 다시 시도해주세요.', true)
    }
  }

  const saveManagerDocumentImage = async () => {
    try {
      const blob = await createDocumentPng(managerDocumentRef, 'seller-document--exporting', setManagerExportGeneratedAt)
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `매니저정산서_${campaign?.managerName ?? settlement.id}.png`
      link.click()
      URL.revokeObjectURL(url)
      setDocumentNotice('매니저 정산서를 이미지로 저장했습니다.')
    } catch (error) { setDocumentNotice(error instanceof Error ? error.message : '이미지 저장에 실패했습니다.') }
  }

  const copyManagerDocumentImage = async () => {
    if (!window.isSecureContext || !navigator.clipboard?.write || typeof ClipboardItem === 'undefined') { showClipboardToast('복사하지 못했습니다. 다시 시도해주세요.', true); return }
    try {
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': createDocumentPng(managerDocumentRef, 'seller-document--exporting', setManagerExportGeneratedAt) })])
      showClipboardToast('클립보드로 복사되었습니다.')
    } catch { showClipboardToast('복사하지 못했습니다. 다시 시도해주세요.', true) }
  }

  const exportCompanyDocument = async (copy: boolean) => {
    try {
      const pending = createDocumentPng(companyDocumentRef, 'seller-document--exporting')
      if (copy && navigator.clipboard?.write && typeof ClipboardItem !== 'undefined') {
        await navigator.clipboard.write([new ClipboardItem({ 'image/png': pending })])
        showClipboardToast('회사 내부 정산서 이미지를 복사했습니다.')
      } else {
        const blob = await pending
        const url = URL.createObjectURL(blob)
        const link = document.createElement('a')
        link.href = url
        link.download = `회사내부정산서_${campaign?.campaignName ?? settlement.id}.png`
        link.click()
        URL.revokeObjectURL(url)
        showClipboardToast('회사 내부 정산서 이미지를 저장했습니다.')
      }
    } catch { showClipboardToast('이미지 생성에 실패했습니다. 다시 시도해주세요.', true) }
  }

  const openDetailSection = (id: string) => {
    const target = document.getElementById(id) as HTMLDetailsElement | null
    if (!target) return
    target.open = true
    target.scrollIntoView({ behavior: 'smooth' })
  }

  const openSellerBusinessType = () => {
    setReadinessModal('business')
  }

  const openSellerAccount = () => {
    setAccountDraft({ bankName: sellerProfile?.bankName ?? '', accountNumber: sellerProfile?.accountNumber ?? '', accountHolder: sellerProfile?.accountHolder ?? '' })
    setReadinessModal('account')
  }

  const openSellerInfo = () => salesImport?.supplyAudience === 'vendor' ? setReadinessModal('vendor-info') : setReadinessModal('seller-info')

  const openManagerAccount = () => {
    setManagerAccountDraft({ bankName: managerProfile?.bankName ?? '', accountNumber: managerProfile?.accountNumber ?? '', accountHolder: managerProfile?.accountHolder ?? '' })
    setManagerBusinessNameDraft(managerProfile?.businessName ?? '')
    setManagerRealNameDraft(managerProfile?.realName ?? (managerBusinessType === 'freelancer' ? campaign?.managerName ?? '' : ''))
    setManagerResidentNumberDraft('')
    setManagerBusinessTypeDraft(managerProfile?.businessType ?? managerBusinessType)
    setReadinessModal('manager-info')
  }

  const openManagerBusinessEdit = () => { openManagerAccount(); setReadinessModal('manager-business-edit') }
  const openManagerAccountEdit = () => { openManagerAccount(); setReadinessModal('manager-account-edit') }

  const makePaymentWarningAction = (owner: EvidenceOwnerType, reason: string): PaymentWarningAction => {
    if (owner === 'seller' && (reason.includes('사업자 유형') || reason.includes('증빙 유형'))) return { reason, actionLabel: '사업자 유형 등록', action: openSellerBusinessType }
    if (reason.includes('지급 계좌')) return { reason, actionLabel: '계좌 등록', action: owner === 'seller' ? openSellerAccount : openManagerAccount }
    if (reason.includes('원천세')) return { reason, actionLabel: '원천세 확인', action: () => setPaymentRequestTarget(owner) }
    if (reason.includes('세금계산서') || reason.includes('현금영수증') || reason.includes('증빙')) return { reason, actionLabel: reason.includes('캡처본') ? '증빙 업로드' : '증빙 확인', action: () => setPaymentRequestTarget(owner) }
    if (reason.includes('정산금액') || reason.includes('최종 지급액') || reason.includes('계산') || reason.includes('정산서가 확정')) return { reason, actionLabel: '정산 계산 확인', action: () => openDetailSection('calculation-detail') }
    if (reason.includes('지급 요청이 생성') || reason.includes('지급 승인') || reason.includes('지급이 완료')) return { reason, actionLabel: '지급 요청 상태 보기', action: () => setPaymentStatusTarget(owner) }
    if (owner === 'manager' && reason.includes('담당 매니저')) return { reason, actionLabel: '매니저 정보 확인', action: () => campaign && openCampaignDetail(campaign.id, 'overview') }
    return { reason, actionLabel: '확인', action: () => openDetailSection('calculation-detail') }
  }

  const sellerWarningActions = sellerActionReasons.map((reason) => makePaymentWarningAction('seller', reason))
  const managerWarningActions = managerActionReasons.map((reason) => makePaymentWarningAction('manager', reason))
  return (
    <section className="settlement-detail-page">
        <button className="settlement-back-button" onClick={onBack} type="button">← 정산 관리로 돌아가기</button>
        <div className="settlement-detail-header">
          <div>
            <div className="settlement-title-row"><h1>{campaign?.campaignName ?? settlement.campaignId}</h1><Badge label={statusLabel(settlement.status)} tone={statusTone[settlement.status]} /></div>
            <p>{campaign?.sellerName ?? '-'} · {campaign?.brandName ?? '-'}</p>
            <p>{formatKoreanDate(salesImport?.salesStartDate)} ~ {formatKoreanDate(salesImport?.salesEndDate)}</p>
            <p>담당 매니저 {campaign?.managerName ?? '-'} · v{settlement.settlementVersion}</p>
          </div>
          <div className="settlement-header-actions">
            <button className="secondary-button" disabled={!canEditCurrentSettlement || settlementConfirmed} onClick={() => onOpenSalesData?.(settlement.salesDataImportId, true)} title={settlementConfirmed ? '정산서 확정 해제 후 직접 수정할 수 있습니다.' : sellerPaymentRequest || managerPaymentRequest ? '수정안 확인·임시 저장 가능. 실제 반영 전 지급요청 확인이 필요합니다.' : undefined} type="button">판매 수량·조건 수정</button>
            {hasUnresolvedRevision ? <><button className="secondary-button" onClick={() => setRevisionViewerOpen(true)} type="button">수정 요청 보기</button><button className="primary-button settlement-confirm-disabled" disabled type="button">정산서 확정하기</button></> : <><button className="secondary-button settlement-revision-request-button" disabled={settlementConfirmed} onClick={() => setRevisionRequestOpen(true)} title={settlementConfirmed ? '확정된 정산서는 확정 해제 후 수정 요청할 수 있습니다.' : undefined} type="button">정산서 수정요청</button>{!settlementConfirmed ? <button className="primary-button" disabled={blockingWarnings.length > 0} onClick={() => setConfirmationModal('confirm')} type="button">정산서 확정하기</button> : canReleaseConfirmation && <button className="danger-button settlement-release-button" onClick={() => setConfirmationModal('release')} type="button">확정 해제</button>}</>}
          </div>
        </div>

        {hasUnresolvedRevision ? <div className="settlement-confirmation-state is-revision"><strong>⚠ 정산서 수정 요청</strong><span>{pendingRevisionRequest?.reason}</span><small>수정 요청이 처리되어야 정산서를 확정할 수 있습니다.</small></div> : settlementConfirmed ? <div className="settlement-confirmation-state is-confirmed"><strong>✓ 정산서 확정 완료</strong><span>확정일 {formatKoreanDateTime(settlement.settlementConfirmedAt ?? settlement.updatedAt)} · 확정자 {settlement.settlementConfirmedBy ?? settlement.assigneeName}</span></div> : <div className="settlement-confirmation-state"><strong>정산서 검토 대기</strong><span>확정 후 셀러·매니저 지급 요청이 가능합니다.</span></div>}

        {hasLegacyPaymentConflict && <section className="legacy-payment-recovery"><div><strong>⚠ 이전 지급요청 정보가 남아 있습니다.</strong><p>현재 정산서는 미확정 상태입니다. 정산서를 수정하려면 기존 지급요청을 먼저 정리해주세요.</p></div><div className="legacy-payment-recovery__requests">{sellerPaymentRequest && <div><span>셀러 지급요청</span><strong>{paymentStatusLabels[sellerPaymentRequest.status]}</strong>{canEditCurrentSettlement ? <button className="danger-button" disabled={!paymentRequestService.canRecoverLegacyPaymentRequest(sellerPaymentRequest)} onClick={() => setLegacyCancellationTarget('seller')} type="button">기존 셀러 지급요청 취소</button> : <small>정산담당자 확인이 필요합니다.</small>}</div>}{managerPaymentRequest && <div><span>매니저 지급요청</span><strong>{paymentStatusLabels[managerPaymentRequest.status]}</strong>{canEditCurrentSettlement ? <button className="danger-button" disabled={!paymentRequestService.canRecoverLegacyPaymentRequest(managerPaymentRequest)} onClick={() => setLegacyCancellationTarget('manager')} type="button">기존 매니저 지급요청 취소</button> : <small>정산담당자 확인이 필요합니다.</small>}</div>}</div></section>}

        {settlement.hasSourceChanged && (
          <div className="inline-notice settlement-warning">
            <strong>원본 데이터 변경됨</strong>
            <span>이전 승인값과 현재 계산값 비교 후 재검토가 필요합니다.</span>
          </div>
        )}
        {!validation.valid && (
          <div className="settlement-error-list">
            {validation.errors.map((error) => <span key={error}>{error}</span>)}
          </div>
        )}

        <section className="settlement-page-section" id="basic-info"><div className="section-heading"><div><p className="page-eyebrow">1. 정산 요약</p><h2>정산 요약</h2></div><Badge label={statusLabel(settlement.status)} tone={statusTone[settlement.status]} /></div><div className="settlement-top-meta">
          <Summary label="공동구매명" value={campaign?.campaignName ?? settlement.campaignId} />
          <Summary label="셀러" value={campaign?.sellerName ?? '-'} />
          <Summary label="브랜드" value={campaign?.brandName ?? '-'} />
          <Summary label="판매 기간" value={`${formatKoreanDate(salesImport?.salesStartDate)} ~ ${formatKoreanDate(salesImport?.salesEndDate)}`} />
          <Summary label="버전" value={`v${settlement.settlementVersion}`} />
          <Summary label="담당 매니저" value={campaign?.managerName ?? '-'} />
          <Summary label="총매출" value={money(settlement.currentCalculation.grossSales)} amount />
        </div></section>

        {salesImport?.supplyAudience === 'vendor' && <div className="action-row"><button type="button" className="secondary-button" onClick={() => setReadinessModal('vendor-info')}>벤더 정보 등록·수정 · {salesImport.settlementVendorName}</button></div>}

        {blockingWarnings.length > 0 && <ReadinessWarningSection id="settlement-preparation" title="정산 계산 준비 필요" warnings={blockingWarnings} />}
        {nonBlockingWarnings.length > 0 && <ReadinessWarningSection title="지급 준비 필요" warnings={nonBlockingWarnings} />}

        {blockingWarnings.length === 0 && <section className="detail-card settlement-card settlement-document-tab settlement-page-section" id="settlement-documents">
          <div className="checklist-head">
            <div><p className="page-eyebrow">5. 정산서 보기</p><h2>정산서 비교</h2><p>{vendorSupply ? '벤더 전달용, 회사 내부용, 공급사 정산서를 구분해 확인합니다.' : sellerCollectsPayment ? '셀러 수금액, 매니저 배분액, 회사 귀속액, 공급사 지급액을 각각 확인합니다.' : '셀러 정산서와 매니저 정산서를 한 화면에서 비교합니다.'}</p></div>
            <div className="document-view-tabs" role="tablist" aria-label="정산서 종류">
              <button aria-selected={documentMode === '내부 검토용'} className={documentMode === '내부 검토용' ? 'is-active' : ''} onClick={() => setDocumentMode('내부 검토용')} role="tab" type="button">내부 검토용</button>
              <button aria-selected={documentMode !== '내부 검토용'} className={documentMode !== '내부 검토용' ? 'is-active' : ''} onClick={() => setDocumentMode('셀러 전달용')} role="tab" type="button">{vendorSupply ? '벤더 / 회사 / 공급사 정산서' : sellerCollectsPayment ? '셀러 / 매니저 / 회사 / 공급사' : '셀러 / 매니저 비교'}</button>
            </div>
          </div>
          {documentMode === '내부 검토용' ? (
            <InternalSettlementDocument campaignName={campaign?.campaignName ?? settlement.campaignId} rows={salesRows} settlement={settlement} />
          ) : (
            <div className={`settlement-document-comparison ${hasThreePartyDocuments ? 'vendor-document-tabs-layout' : ''}`}>
              {hasThreePartyDocuments && <div className="document-view-tabs vendor-document-selector" role="tablist" aria-label="거래 정산서 선택">{transactionDocumentTabs.filter((tab) => !tab.requiresManagerAccess || canAccessManagerDocument).map((tab) => <button key={tab.id} role="tab" type="button" aria-selected={vendorDocumentTab === tab.id} className={vendorDocumentTab === tab.id ? 'is-active' : ''} onClick={() => { setExpandedDocument(null); setVendorDocumentTab(tab.id) }}>{tab.label}</button>)}</div>}
              <article hidden={hasThreePartyDocuments && vendorDocumentTab !== 'seller'} className={`settlement-document-column ${expandedDocument === 'seller' ? 'is-expanded' : ''}`} id="seller-settlement-document">
                <div className="settlement-document-column__heading"><h3>{vendorSupply ? '벤더 전달용 정산서' : sellerCollectsPayment ? '셀러 입금 요청 정산서' : '셀러 정산서'}</h3>{expandedDocument === 'seller' && <button aria-label="닫기" className="settlement-expanded-close no-print" onClick={() => setExpandedDocument(null)} type="button">×</button>}</div>
                <SettlementDocumentActions receivableDocument={sellerCollectsPayment} vendorDocument={vendorSupply} hasRequest={settlementConfirmed && !hasUnresolvedRevision && Boolean(sellerPaymentRequest)} statusNotice={sellerCollectsPayment ? sellerCollectionStatusNotice : settlementConfirmed && !hasUnresolvedRevision ? sellerStatusNotice : unconfirmedStatusNotice} warnings={settlementConfirmed && !hasUnresolvedRevision ? sellerWarningActions : []} onCopyImage={copySellerDocumentImage} onCopyImageAndMessage={copySellerDocumentImageAndMessage} onCopyMessage={copySellerMessage} onInfo={openSellerInfo} onPreview={() => setExpandedDocument('seller')} onRequestPayment={() => setPaymentRequestTarget('seller')} onSaveImage={saveSellerDocumentImage} paymentDisabled={!settlementConfirmed || hasUnresolvedRevision || sellerButtonBlockReasons.length > 0} />
                {!vendorSupply && salesImport && <div className="seller-excel-share no-print">
                  <div><strong>구매내역 원본 엑셀</strong><span>{salesImport.originalSalesFileStoragePath ? `${salesImport.fileName || '원본 파일'} · 링크 생성 후 14일간 다운로드 가능` : '기존 정산 건은 원본 엑셀을 한 번 등록해주세요.'}</span><small>원본 파일에는 구매자 개인정보가 포함될 수 있습니다. 링크를 셀러 외 다른 사람에게 전달하지 마세요.</small></div>
                  <input ref={sellerExcelInputRef} hidden type="file" accept=".xlsx,.xls,.csv" onChange={(event) => void uploadSellerExcel(event.target.files?.[0])} />
                  <div className="action-row"><button className="secondary-button" disabled={sellerExcelBusy} onClick={() => sellerExcelInputRef.current?.click()} type="button">{salesImport.originalSalesFileStoragePath ? '원본 엑셀 교체' : '원본 엑셀 등록'}</button><button className="primary-button" disabled={sellerExcelBusy} onClick={() => void createSellerExcelShare()} type="button">{sellerExcelBusy ? '처리 중…' : sellerExcelShare ? '14일 링크 다시 발급' : '14일 링크 만들기'}</button>{sellerExcelShare && <><button className="secondary-button" onClick={() => void copySellerExcelLink()} type="button">링크 복사</button><a className="secondary-button" href={sellerExcelShare.url} rel="noreferrer" target="_blank">엑셀 다운로드</a></>}</div>
                  {sellerExcelShare && <p className="seller-excel-share__status">다운로드 기한: {new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', year: 'numeric', month: 'long', day: 'numeric' }).format(new Date(sellerExcelShare.expiresAt))}까지 · 전달 문구 복사 시 링크가 자동 포함됩니다.</p>}
                  {sellerExcelError && <p className="seller-excel-share__error" role="alert">{sellerExcelError}</p>}
                </div>}
                <SellerSettlementDocument exportGeneratedAt={sellerExportGeneratedAt} rows={salesRows} sellerDocumentRef={sellerDocumentRef} settlement={settlement} />
              </article>
              {canAccessManagerDocument && <article hidden={hasThreePartyDocuments && vendorDocumentTab !== 'manager'} className={`settlement-document-column ${expandedDocument === 'manager' ? 'is-expanded' : ''}`} id="manager-settlement-document">
                <div className="settlement-document-column__heading"><h3>{companyDirectManager ? '회사 귀속 정산서' : '매니저 정산서'}</h3>{expandedDocument === 'manager' && <button aria-label="닫기" className="settlement-expanded-close no-print" onClick={() => setExpandedDocument(null)} type="button">×</button>}</div>
                <ManagerDocumentActions companyDirect={companyDirectManager} hasRequest={settlementConfirmed && !hasUnresolvedRevision && Boolean(managerPaymentRequest)} statusNotice={settlementConfirmed && !hasUnresolvedRevision ? managerStatusNotice : unconfirmedStatusNotice} warnings={settlementConfirmed && !hasUnresolvedRevision ? managerWarningActions : []} onAccount={openManagerAccount} onCopy={copyManagerDocumentImage} onPreview={() => setExpandedDocument('manager')} onRequestPayment={() => setPaymentRequestTarget('manager')} onSave={saveManagerDocumentImage} paymentDisabled={!settlementConfirmed || hasUnresolvedRevision || managerButtonBlockReasons.length > 0} />
                <ManagerSettlementDocument documentRef={managerDocumentRef} exportGeneratedAt={managerExportGeneratedAt} rows={salesRows} settlement={settlement} />
              </article>}
              {sellerCollectsPayment && salesImport && canAccessManagerDocument && <article hidden={vendorDocumentTab !== 'company'} className={`settlement-document-column ${expandedDocument === 'company' ? 'is-expanded' : ''}`} id="company-settlement-document">
                <div className="settlement-document-column__heading"><h3>회사 내부 정산서</h3>{expandedDocument === 'company' && <button aria-label="닫기" className="settlement-expanded-close no-print" onClick={() => setExpandedDocument(null)} type="button">×</button>}</div>
                <div className="action-row no-print"><button className="secondary-button" onClick={() => setExpandedDocument('company')} type="button">확대 보기</button><button className="secondary-button" onClick={() => void exportCompanyDocument(false)} type="button">PNG 저장</button><button className="primary-button" onClick={() => void exportCompanyDocument(true)} type="button">이미지 복사</button></div>
                <CompanyCollectionSettlementDocument documentRef={companyDocumentRef} rows={salesRows} settlement={settlement} source={salesImport} />
              </article>}
              {hasThreePartyDocuments && salesImport && <article hidden={vendorDocumentTab !== 'supplier'} className={`settlement-document-column ${expandedDocument === 'supplier' ? 'is-expanded' : ''}`}>
                <div className="settlement-document-column__heading"><h3>{sellerCollectsPayment ? '공급사 지급 정산서' : '공급사 정산서'}</h3>{expandedDocument === 'supplier' && <button className="secondary-button no-print" onClick={() => setExpandedDocument(null)}>닫기</button>}</div>
                <div className="action-row no-print"><button className="secondary-button" onClick={() => setExpandedDocument('supplier')}>확대 보기</button><button className="secondary-button" onClick={() => void exportSupplierDocument(false)}>PNG 저장</button><button className="primary-button" onClick={() => void exportSupplierDocument(true)}>이미지 복사</button></div>
                <SupplierSettlementDocument source={salesImport} rows={salesRows} campaign={campaign} documentRef={supplierDocumentRef} />
              </article>}
              {expandedDocument && <button aria-label="닫기" className="settlement-document-expanded-backdrop no-print" onClick={() => setExpandedDocument(null)} type="button" />}
              {documentNotice && <p className="mock-notice settlement-document-comparison__notice">{documentNotice}</p>}
            </div>
          )}
        </section>}

        <SettlementProgress managerStatus={managerPaymentStatus} sellerStatus={sellerPaymentStatus} settlement={settlement} />

        <details className="detail-card settlement-card settlement-page-section settlement-collapsible" id="calculation-detail"><summary><div><h2>정산 계산 상세</h2><p>정산 금액의 계산식과 계산 근거를 확인합니다.</p></div><span className="settlement-collapse-label">펼쳐보기</span></summary><div className="settlement-collapsible__content"><div className="calculation-detail-actions"><p>계산값에 확인이 필요하면 기존 데이터를 보존한 채 수정 요청을 등록합니다.</p><button className="secondary-button" onClick={() => setRevisionRequestOpen(true)} type="button">수정 요청</button></div><CalculationTable settlement={settlement} /><RevisionRequestHistory logs={logs} /><details className="settlement-internal-validation"><summary>내부 검증 항목 관리</summary><div className="settlement-checklist">{Object.entries(checklistLabels).map(([key, label]) => <label className="checklist-item" key={key}><input checked={settlement.reviewChecklist[key as keyof typeof settlement.reviewChecklist]} disabled={settlementConfirmed} onChange={(event) => { settlementService.updateReviewChecklist(settlement.id, { ...settlement.reviewChecklist, [key]: event.target.checked }); setSettlement(settlementService.getSettlementById(settlement.id) ?? null) }} type="checkbox" />{label}</label>)}</div></details></div></details>

        <details className="detail-card settlement-card settlement-page-section settlement-collapsible" id="payment-history"><summary><div><h2>지급 요청 및 승인 이력</h2><p>계산, 상태 변경, 승인, 지급 및 버전 이력을 확인합니다.</p></div><span className="settlement-collapse-label">펼쳐보기</span></summary><div className="settlement-collapsible__content"><HistoryContent logs={logs} settlement={settlement} />
          <div className="checklist-head">
            <div><h3>버전 관리</h3><p>승인본은 직접 덮어쓰지 않고 버전을 증가시켜 비교합니다.</p></div>
            <button className="secondary-button" disabled={versions.length < 2} onClick={() => setCompareOpen(true)} type="button">버전 비교</button>
          </div>
          <div className="version-list">
            {versions.map((version) => (
              <article key={version.id}>
                <strong>v{version.version}</strong>
                <span>{formatKoreanDateTime(version.changedAt)} · {version.changedBy}</span>
                <p>{version.reason}</p>
                <dl><div><dt>변경 전</dt><dd>{money(version.beforeAmount)}</dd></div><div><dt>변경 후</dt><dd>{money(version.afterAmount)}</dd></div><div><dt>승인 상태</dt><dd>{statusLabel(version.status)}</dd></div></dl>
              </article>
            ))}
          </div>
        </div></details>

        {compareOpen && <VersionCompareModal versions={versions} onClose={() => setCompareOpen(false)} />}
        {revisionViewerOpen && pendingRevisionRequest && <div className="settlement-modal-backdrop" onMouseDown={(event) => { if (event.currentTarget === event.target) setRevisionViewerOpen(false) }}><section aria-modal="true" className="settlement-readiness-modal revision-request-viewer" role="dialog"><button aria-label="닫기" className="settlement-expanded-close" onClick={() => setRevisionViewerOpen(false)} type="button">×</button><h2>정산서 수정 요청</h2><dl className="settlement-readiness-summary"><div><dt>요청자</dt><dd>{pendingRevisionRequest.requestedBy}</dd></div><div><dt>요청일시</dt><dd>{formatKoreanDateTime(pendingRevisionRequest.requestedAt)}</dd></div><div><dt>요청 사유</dt><dd>{pendingRevisionRequest.reason}</dd></div><div><dt>현재 상태</dt><dd>처리 대기</dd></div></dl><div className="revision-request-viewer-actions">{currentUser?.name === pendingRevisionRequest.requestedBy && <div><button className="secondary-button" onClick={() => { setRevisionRequestEditReason(pendingRevisionRequest.reason); setRevisionRequestEditOpen(true) }} type="button">요청 내용 수정</button><button className="danger-button" onClick={() => setRevisionRequestCancelOpen(true)} type="button">수정 요청 취소</button></div>}{canEditCurrentSettlement && <div><button className="primary-button" onClick={() => { setRevisionViewerOpen(false); setRevisionEditorOpen(true) }} type="button">정산서 수정하기</button><button className="danger-button" onClick={() => setRevisionRequestRejectOpen(true)} type="button">수정 요청 반려</button></div>}</div></section></div>}
        {revisionRequestEditOpen && pendingRevisionRequest && <div className="nested-modal-backdrop"><section aria-modal="true" className="helper-modal reason-modal" role="dialog"><div className="reason-modal__header"><h3>수정 요청 내용 변경</h3><button aria-label="닫기" className="icon-button" onClick={() => setRevisionRequestEditOpen(false)} type="button">×</button></div><ReasonInput onChange={(event) => setRevisionRequestEditReason(event.target.value)} placeholder="변경할 수정 요청 내용을 입력해주세요." value={revisionRequestEditReason} /><div className="modal-actions reason-modal__actions"><button className="secondary-button" onClick={() => setRevisionRequestEditOpen(false)} type="button">취소</button><button className="primary-button" disabled={!revisionRequestEditReason.trim()} onClick={updatePendingRevisionRequest} type="button">변경 저장</button></div></section></div>}
        <ReasonModal actionLabel="수정 요청 취소" description="취소 후 해당 정산서는 다시 검토 가능한 상태로 돌아갑니다." onChange={setRevisionRequestCancelReason} onClose={() => { setRevisionRequestCancelOpen(false); setRevisionRequestCancelReason('') }} onSubmit={cancelPendingRevisionRequest} open={revisionRequestCancelOpen} placeholder="수정 요청 취소 사유를 입력해주세요." title="수정 요청을 취소하시겠습니까?" value={revisionRequestCancelReason} />
        <ReasonModal actionLabel="반려" onChange={setRevisionRequestRejectReason} onClose={() => { setRevisionRequestRejectOpen(false); setRevisionRequestRejectReason('') }} onSubmit={rejectPendingRevisionRequest} open={revisionRequestRejectOpen} placeholder="수정 요청 반려 사유를 입력해주세요." title="수정 요청을 반려하시겠습니까?" value={revisionRequestRejectReason} />
        {revisionEditorOpen && campaign && currentUser && <SettlementRevisionModal campaign={campaign} currentUser={currentUser} deductions={deductions} legacyManagerRequest={hasLegacyPaymentConflict ? managerPaymentRequest : undefined} legacySellerRequest={hasLegacyPaymentConflict ? sellerPaymentRequest : undefined} managerBusinessType={managerBusinessType} onClose={() => setRevisionEditorOpen(false)} onRecoverLegacyRequest={setLegacyCancellationTarget} onSaved={(next) => { setRevisionEditorOpen(false); setSettlement({ ...next }); showClipboardToast('정산서 수정이 저장되었습니다. 재확정 전 변경 내용을 확인해주세요.') }} rows={salesRows} sellerBusinessType={effectiveSellerBusinessType} settlement={settlement} />}
        {revisionRequestOpen && <div className="settlement-modal-backdrop" onMouseDown={(event) => { if (event.currentTarget === event.target) setRevisionRequestOpen(false) }}><section aria-modal="true" className="settlement-readiness-modal settlement-revision-request-modal" role="dialog"><button aria-label="닫기" className="settlement-expanded-close" onClick={() => setRevisionRequestOpen(false)} type="button">×</button><h2>정산 수정 요청</h2><ReasonInput ariaLabel="정산 수정 요청 내용" onChange={(event) => setRevisionReason(event.target.value)} placeholder="수정이 필요한 내용을 입력해주세요." value={revisionReason} /><p className="settlement-revision-request-guide">현재 v{settlement.settlementVersion} 계산 데이터는 삭제하지 않고, 수정 후 재계산 시 새 버전으로 관리합니다.</p><div className="modal-actions"><button className="secondary-button" onClick={() => setRevisionRequestOpen(false)} type="button">취소</button><button className="primary-button" disabled={!revisionReason.trim()} onClick={submitRevisionRequest} type="button">수정 요청</button></div></section></div>}
        {confirmationModal && <div className="settlement-modal-backdrop" onMouseDown={(event) => { if (event.currentTarget === event.target) setConfirmationModal(null) }}><section aria-modal="true" className="settlement-readiness-modal" role="dialog"><button aria-label="닫기" className="settlement-expanded-close" onClick={() => setConfirmationModal(null)} type="button">×</button>{confirmationModal === 'confirm' ? <><h2>정산서를 확정하시겠습니까?</h2><p>확정 후 셀러/매니저 지급 요청이 가능해집니다.</p><p>확정 이후 정산 내용을 수정하려면 권한자가 정산서 확정을 해제해야 합니다.</p><div className="modal-actions"><button className="secondary-button" onClick={() => setConfirmationModal(null)} type="button">취소</button><button className="primary-button" onClick={confirmSettlementDocument} type="button">정산서 확정</button></div></> : <><h2>정산서 확정을 해제하시겠습니까?</h2><p>확정 해제 후 정산 내용을 수정하고 재확정해야 합니다.</p>{(sellerPaymentRequest || managerPaymentRequest) && <div className="settlement-unlock-payment-warning"><strong>지급요청이 존재하여 확정 해제할 수 없습니다.</strong><p>지급요청을 자동 취소하지 않습니다. 아래에서 각 요청을 명시적으로 취소해주세요.</p>{sellerPaymentRequest && <button className="secondary-button" onClick={() => { setConfirmationModal(null); setPaymentRequestTarget('seller') }} type="button">셀러 지급요청 수정/취소하기</button>}{managerPaymentRequest && <button className="secondary-button" onClick={() => { setConfirmationModal(null); setPaymentRequestTarget('manager') }} type="button">매니저 지급요청 수정/취소하기</button>}</div>}<ReasonInput onChange={(event) => setConfirmationReleaseReason(event.target.value)} placeholder="정산서 확정 해제 사유를 입력해주세요." value={confirmationReleaseReason} /><div className="modal-actions"><button className="secondary-button" onClick={() => setConfirmationModal(null)} type="button">취소</button><button className="danger-button settlement-release-button" disabled={!confirmationReleaseReason.trim() || Boolean(sellerPaymentRequest || managerPaymentRequest)} onClick={releaseSettlementDocument} type="button">확정 해제</button></div></>}</section></div>}
        <ReasonModal actionLabel="지급요청 취소" description="현재 정산서는 미확정 상태입니다. 이 지급요청을 취소하면 정산서를 다시 수정할 수 있습니다." onChange={setLegacyCancellationReason} onClose={() => { setLegacyCancellationTarget(null); setLegacyCancellationReason('') }} onSubmit={cancelLegacyPaymentRequest} open={Boolean(legacyCancellationTarget)} placeholder="지급요청 취소 사유를 입력해주세요." title="기존 지급요청을 취소하시겠습니까?" value={legacyCancellationReason} />
        {paymentRequestTarget && campaign && <PaymentRequestEvidenceModal actorProfile={companyProfile} campaign={campaign} existingRequest={paymentRequestTarget === 'seller' ? sellerPaymentRequest : managerPaymentRequest} managerBusinessType={managerBusinessType} onCanceled={() => { setPaymentRequestTarget(null); setSettlement({ ...(settlementService.getSettlementById(settlement.id) ?? settlement) }); showClipboardToast('지급요청이 취소되었습니다.') }} onClose={() => setPaymentRequestTarget(null)} onFailed={(message) => showClipboardToast(message, true)} onRequested={(message) => { setPaymentRequestTarget(null); setSettlement({ ...(settlementService.getSettlementById(settlement.id) ?? settlement) }); showClipboardToast(message) }} ownerType={paymentRequestTarget} sellerBusinessType={effectiveSellerBusinessType ?? 'general_business'} settlement={settlement} />}
        {paymentStatusTarget && campaign && <PaymentRequestStatusModal accountConfirmed={paymentStatusTarget === 'seller' ? hasSellerAccount : hasManagerAccount} campaign={campaign} completed={paymentStatusTarget === 'seller' ? settlement.sellerPaymentCompleted : settlement.managerPaymentCompleted} onClose={() => setPaymentStatusTarget(null)} ownerType={paymentStatusTarget} request={paymentStatusTarget === 'seller' ? sellerPaymentRequest : managerPaymentRequest} settlement={settlement} />}
        {clipboardToast && <div aria-live="polite" className={`clipboard-toast ${clipboardToast.error ? 'is-error' : ''}`}>{clipboardToast.error ? '!' : '✓'} {clipboardToast.message}</div>}
        {readinessModal && campaign && <div className="settlement-modal-backdrop" onMouseDown={(event) => { if (event.currentTarget === event.target) setReadinessModal(null) }}><section aria-modal="true" className="settlement-readiness-modal" role="dialog"><button aria-label="닫기" className="settlement-expanded-close" onClick={() => setReadinessModal(null)} type="button">×</button>
          {readinessModal === 'commission' && <><h2>수수료율 확인</h2><p>상품 DB의 SKU와 판매행을 연결해 적용한 제품별 수수료율입니다.</p><div className="table-scroll"><table className="data-table"><thead><tr><th>상품 / SKU</th><th>총수수료율</th><th>셀러 수수료율</th></tr></thead><tbody>{salesRows.map((row) => <tr key={row.id}><td>{campaign.productName} / {row.optionName}</td><td>{Number(row.totalCommissionRate ?? totalRate).toFixed(1)}%</td><td>{Number(row.sellerCommissionRate ?? sellerRate).toFixed(1)}%</td></tr>)}</tbody></table></div>{!commissionRatesValid && <p className="settlement-readiness-modal__error">유효한 수수료율이 없습니다. 상품 정보를 수정해주세요.</p>}<div className="modal-actions">{!commissionRatesValid && <button className="secondary-button" onClick={() => openCampaignDetail(campaign.id, 'overview')} type="button">상품 정보 수정</button>}<button className="primary-button" disabled={!commissionRatesValid} onClick={() => { confirmChecklist({ commissionRateConfirmed: true }); setReadinessModal(null) }} type="button">확인 완료</button></div></>}
          {readinessModal === 'costs' && <><h2>정산 비용/차감 확인</h2><p>등록한 이벤트별 금액과 부담 주체, 실제 정산 반영 여부를 확인합니다.</p><div className="table-scroll settlement-cost-review"><table className="data-table settlement-cost-review__table"><thead><tr><th>항목</th><th>금액</th><th>부담 주체</th><th>정산 반영</th></tr></thead><tbody>{(['sample', 'other'] as const).map((type) => { const items = deductions.filter((item) => item.type === type); const amount = items.reduce((sum, item) => sum + item.amount, 0); return <tr key={type}><td>{type === 'sample' ? '샘플비' : '기타 차감'}</td><td>{amount ? money(amount) : '0원 · 없음'}</td><td>{items.length ? [...new Set(items.map((item) => costOwnerLabel[item.costOwner] ?? item.costOwner))].join(', ') : '비용 없음'}</td><td>{items.some((item) => item.reflected) ? '✅ 반영 완료' : items.length ? '기록만' : '해당 없음'}</td></tr> })}{deductions.filter((item) => item.type === 'event' || item.type === 'promotion').map((item) => <tr key={item.id}><td>이벤트비 · {item.title}</td><td>{money(item.amount)}</td><td>{costOwnerLabel[item.costOwner] ?? item.costOwner}</td><td>{item.reflected ? '✅ 반영 완료' : item.applyLocation === 'record_only' ? '기록만' : '⚠️ 미반영'}</td></tr>)}{!deductions.some((item) => item.type === 'event' || item.type === 'promotion') && <tr><td>이벤트비</td><td>0원 · 없음</td><td>비용 없음</td><td>해당 없음</td></tr>}</tbody></table></div>{unresolvedCostOwners.length > 0 && <p className="settlement-readiness-modal__error">부담 주체가 지정되지 않은 비용이 있습니다. 정산 계산 상세에서 비용 정보를 확인해주세요.</p>}<div className="modal-actions"><button className="primary-button" disabled={unresolvedCostOwners.length > 0} onClick={() => { confirmChecklist({ sampleCostReflected: true, eventCostReflected: true, otherDeductionsConfirmed: true, costOwnersConfirmed: true }); setReadinessModal(null) }} type="button">확인 완료</button></div></>}
          {readinessModal === 'share' && <><h2>매니저 배분율 확인</h2><p>총매출을 기준으로 적용된 매니저·회사 배분율입니다.</p><dl className="settlement-readiness-summary"><div><dt>총매출</dt><dd>{money(settlement.currentCalculation.grossSales)}</dd></div><div><dt>매니저</dt><dd>{campaign.managerName}</dd></div><div><dt>매니저 배분율</dt><dd>{settlement.currentCalculation.managerShareRate}%</dd></div><div><dt>회사 배분율</dt><dd>{settlement.currentCalculation.companyShareRate}%</dd></div><div><dt>합계</dt><dd>{managerShareTotal}%</dd></div></dl>{!managerShareValid && <p className="settlement-readiness-modal__error">배분율 합계가 100%가 아닙니다.</p>}<div className="modal-actions">{!managerShareValid && <button className="secondary-button" onClick={() => openCampaignDetail(campaign.id, 'settlement')} type="button">기존 설정 확인</button>}<button className="primary-button" disabled={!managerShareValid} onClick={() => { confirmChecklist({ managerShareConfirmed: true }); setReadinessModal(null) }} type="button">확인 완료</button></div></>}
          {readinessModal === 'business' && <SellerBusinessEditor hasStoredResidentNumber={sensitiveIdentityService.has('seller', campaign.sellerId)} initialBusinessName={sellerProfile?.businessName ?? ''} initialBusinessType={effectiveSellerBusinessType ?? 'general_business'} initialRealName={sellerProfile?.realName ?? (effectiveSellerBusinessType === 'freelancer' ? campaign.sellerName : '')} onSave={saveSellerBusinessType} sellerName={campaign.sellerName} />}
          {readinessModal === 'account' && <><h2>셀러 지급 계좌 등록</h2><div className="settlement-readiness-form"><label className="form-field"><span>은행명</span><input onChange={(event) => setAccountDraft((value) => ({ ...value, bankName: event.target.value }))} value={accountDraft.bankName} /></label><label className="form-field"><span>계좌번호</span><input inputMode="text" placeholder="예: 110-123-456789" onChange={(event) => setAccountDraft((value) => ({ ...value, accountNumber: sanitizeAccountNumberInput(event.target.value) }))} value={accountDraft.accountNumber} /></label><label className="form-field"><span>예금주명</span><input onChange={(event) => setAccountDraft((value) => ({ ...value, accountHolder: event.target.value }))} value={accountDraft.accountHolder} /></label></div><div className="modal-actions"><button className="primary-button" disabled={!accountDraft.bankName.trim() || !accountDraft.accountNumber.trim() || !accountDraft.accountHolder.trim()} onClick={saveSellerAccount} type="button">저장</button></div></>}
          {readinessModal === 'vendor-info' && salesImport && <VendorPartnerDetails key={salesImport.id} source={salesImport} canEdit={canEditCurrentSettlement} onSaved={() => { setMasterRevision(value => value + 1); refreshRevisionState(); setReadinessModal(null) }} />}
          {readinessModal === 'seller-info' && <><h2>셀러 정보 확인하기</h2><dl className="settlement-readiness-summary"><div><dt>셀러명</dt><dd>{campaign.sellerName}</dd></div>{effectiveSellerBusinessType === 'freelancer' ? <><div><dt>실명</dt><dd>{sellerProfile?.realName || campaign.sellerName}</dd></div><div><dt>주민등록번호</dt><dd>{sensitiveIdentityService.getMasked('seller', campaign.sellerId) || '보안 서버 연동 필요'}</dd></div></> : <div><dt>사업자명</dt><dd>{sellerProfile?.businessName || '미등록'}</dd></div>}<div><dt>사업자 유형</dt><dd>{effectiveSellerBusinessType ? businessTypeLabels[effectiveSellerBusinessType] : '미등록'}</dd></div><div><dt>은행명</dt><dd>{sellerProfile?.bankName || '미등록'}</dd></div><div><dt>계좌번호</dt><dd>{sellerProfile?.accountNumber || '미등록'}</dd></div><div><dt>예금주명</dt><dd>{sellerProfile?.accountHolder || '미등록'}</dd></div></dl><div className="modal-actions"><button className="secondary-button" onClick={openSellerBusinessType} type="button">사업자 정보 수정</button><button className="secondary-button" onClick={openSellerAccount} type="button">계좌 수정</button><button className="primary-button" onClick={() => setReadinessModal(null)} type="button">확인</button></div></>}
          {readinessModal === 'manager-info' && <><h2>매니저 정보 확인하기</h2><dl className="settlement-readiness-summary"><div><dt>매니저명</dt><dd>{campaign.managerName}</dd></div>{managerBusinessType === 'freelancer' ? <><div><dt>실명</dt><dd>{managerProfile?.realName || campaign.managerName}</dd></div><div><dt>주민등록번호</dt><dd>{sensitiveIdentityService.getMasked('manager', campaign.managerId) || '보안 서버 연동 필요'}</dd></div></> : <div><dt>사업자명</dt><dd>{managerProfile?.businessName || '미등록'}</dd></div>}<div><dt>사업자 유형</dt><dd>{businessTypeLabels[managerBusinessType]}</dd></div><div><dt>은행명</dt><dd>{managerProfile?.bankName || '미등록'}</dd></div><div><dt>계좌번호</dt><dd>{managerProfile?.accountNumber || '미등록'}</dd></div><div><dt>예금주명</dt><dd>{managerProfile?.accountHolder || '미등록'}</dd></div></dl><div className="modal-actions"><button className="secondary-button" onClick={openManagerBusinessEdit} type="button">사업자 정보 수정</button><button className="secondary-button" onClick={openManagerAccountEdit} type="button">계좌 수정</button><button className="primary-button" onClick={() => setReadinessModal(null)} type="button">확인</button></div></>}
          {readinessModal === 'manager-business-edit' && <><h2>매니저 사업자 정보 수정</h2><label className="form-field"><span>매니저명</span><input disabled value={campaign.managerName} /></label><label className="form-field"><span>사업자 유형</span><select onChange={(event) => setManagerBusinessTypeDraft(event.target.value as SellerBusinessType)} value={managerBusinessTypeDraft}><option value="corporation">법인</option><option value="general_business">일반 개인사업자</option><option value="simplified_business">간이사업자</option><option value="freelancer">개인 프리랜서</option></select></label>{managerBusinessTypeDraft === 'freelancer' ? <><label className="form-field"><span>실명</span><input autoComplete="name" onChange={(event) => setManagerRealNameDraft(event.target.value)} value={managerRealNameDraft} /></label><label className="form-field"><span>주민등록번호</span><ResidentRegistrationNumberInput onChange={setManagerResidentNumberDraft} value={managerResidentNumberDraft} /></label><p>주민등록번호는 현재 로컬 저장소에 저장되지 않으며, 운영 연결 시 보안 서버에서 처리합니다.</p></> : <label className="form-field"><span>사업자명</span><input onChange={(event) => setManagerBusinessNameDraft(event.target.value)} value={managerBusinessNameDraft} /></label>}<div className="modal-actions"><button className="secondary-button" onClick={() => setReadinessModal('manager-info')} type="button">취소</button><button className="primary-button" disabled={managerBusinessTypeDraft === 'freelancer' ? !managerRealNameDraft.trim() || (!sensitiveIdentityService.has('manager', campaign.managerId) && managerResidentNumberDraft.replace(/\D/g, '').length !== 13) : !managerBusinessNameDraft.trim()} onClick={() => saveManagerProfileDraft('business')} type="button">저장</button></div></>}
          {readinessModal === 'manager-account-edit' && <><h2>매니저 계좌 수정</h2><div className="settlement-readiness-form"><label className="form-field"><span>은행명</span><input onChange={(event) => setManagerAccountDraft((value) => ({ ...value, bankName: event.target.value }))} value={managerAccountDraft.bankName} /></label><label className="form-field"><span>계좌번호</span><input inputMode="text" placeholder="예: 110-123-456789" onChange={(event) => setManagerAccountDraft((value) => ({ ...value, accountNumber: sanitizeAccountNumberInput(event.target.value) }))} value={managerAccountDraft.accountNumber} /></label><label className="form-field"><span>예금주명</span><input onChange={(event) => setManagerAccountDraft((value) => ({ ...value, accountHolder: event.target.value }))} value={managerAccountDraft.accountHolder} /></label></div><div className="modal-actions"><button className="secondary-button" onClick={() => setReadinessModal('manager-info')} type="button">취소</button><button className="primary-button" disabled={!managerAccountDraft.bankName.trim() || !managerAccountDraft.accountNumber.trim() || !managerAccountDraft.accountHolder.trim()} onClick={() => saveManagerProfileDraft('account')} type="button">저장</button></div></>}
        </section></div>}
    </section>
  )
}

function SettlementRevisionModal({ campaign, currentUser, deductions, legacyManagerRequest, legacySellerRequest, managerBusinessType, onClose, onRecoverLegacyRequest, onSaved, rows, sellerBusinessType, settlement }: { campaign: Campaign; currentUser: AppUser; deductions: SettlementDeduction[]; legacyManagerRequest?: ReturnType<typeof paymentRequestService.getActivePaymentRequestForRecipient>; legacySellerRequest?: ReturnType<typeof paymentRequestService.getActivePaymentRequestForRecipient>; managerBusinessType: SellerBusinessType; onClose: () => void; onRecoverLegacyRequest: (target: EvidenceOwnerType) => void; onSaved: (settlement: Settlement) => void; rows: SalesDataRow[]; sellerBusinessType?: SellerBusinessType; settlement: Settlement }) {
  const revisionRows = rows.map((row) => {
    const snapshot = campaign.proposalSnapshots?.find((item) => item.salePrice === row.unitPrice) ?? campaign.proposalSnapshots?.[0]
    return { ...row, totalCommissionRate: row.totalCommissionRate ?? snapshot?.totalCommissionRate ?? settlement.currentCalculation.totalCommissionRate, sellerCommissionRate: row.sellerCommissionRate ?? snapshot?.sellerCommissionRate ?? settlement.currentCalculation.sellerCommissionRate }
  })
  const [draft, setDraft] = useState<SettlementRevisionDraft>(() => ({ settlementId: settlement.id, reason: settlement.sourceChangeReason || '정산 수정 요청 반영', rows: revisionRows.map((row) => ({ ...row })), totalCommissionRate: settlement.currentCalculation.totalCommissionRate, sellerCommissionRate: settlement.currentCalculation.sellerCommissionRate, deductions: deductions.map((item) => ({ ...item })) }))
  const [preview, setPreview] = useState<SettlementCalculationSnapshot | null>(null)
  const [error, setError] = useState('')
  const [eventRevision, setEventRevision] = useState(0)
  const [eventCounts, setEventCounts] = useState<Record<string, number>>(() => Object.fromEntries(campaignEventOperationService.getByCampaignId(campaign.id).map((event) => [event.id, event.confirmedQuantity ?? event.winners?.length ?? 0])))
  const events = campaignEventOperationService.getByCampaignId(campaign.id)
  const updateRow = (id: string, patch: Partial<SalesDataRow>) => { setPreview(null); setDraft((value) => ({ ...value, rows: value.rows.map((row) => row.id === id ? { ...row, ...patch } : row) })) }
  const updateDeduction = (id: string, patch: Partial<SettlementDeduction>) => { setPreview(null); setDraft((value) => ({ ...value, deductions: value.deductions.map((item) => item.id === id ? { ...item, ...patch } : item) })) }
  const addOtherDeduction = () => { const createdAt = new Date().toISOString(); setPreview(null); setDraft((value) => ({ ...value, deductions: [...value.deductions, { id: `deduction-manual-${Date.now()}`, settlementId: settlement.id, campaignId: campaign.id, type: 'other', title: '기타비용', amount: 0, costOwner: 'company', linkedData: 'manual:revision', evidenceStatus: 'pending', applyLocation: 'net_company_commission', reflected: true, memo: '', createdAt, updatedAt: createdAt }] })) }
  const calculate = () => { try { setError(''); setPreview(settlementService.previewRevision(draft, currentUser.name)) } catch (caught) { setError(caught instanceof Error ? caught.message : '재계산하지 못했습니다.') } }
  const save = () => { try { if (!preview) throw new Error('변경 후 다시 계산을 먼저 실행해주세요.'); setError(''); onSaved(settlementService.saveRevision(draft, currentUser.name, currentUser.role)) } catch (caught) { setError(caught instanceof Error ? caught.message : '수정 내용을 저장하지 못했습니다.') } }
  const confirmEvent = (event: (typeof events)[number]) => {
    try {
      const confirmed = campaignEventOperationService.confirmWinnerCount(campaign.id, event.id, eventCounts[event.id] ?? 0)
      const amount = campaignEventOperationService.getConfirmedSettlementCost(confirmed) ?? 0
      const existing = draft.deductions.find((item) => item.linkedData === `event:${event.id}`)
      const isCompanyDirect = confirmed.costHandling === 'company_direct'
      const isManagerReimbursement = confirmed.costHandling === 'manager_prepaid' && amount > 0
      const applyLocation = isCompanyDirect ? 'net_company_commission' : isManagerReimbursement ? 'manager_reimbursement' : 'record_only'
      const eventDeduction: SettlementDeduction = existing ? { ...existing, amount: isCompanyDirect || isManagerReimbursement ? amount : 0, costOwner: isCompanyDirect ? 'company' : confirmed.costHandling === 'vendor_free' ? 'brand' : 'manager', applyLocation, reflected: isCompanyDirect || isManagerReimbursement, updatedAt: new Date().toISOString() } : { id: `deduction-event-${event.id}`, settlementId: settlement.id, campaignId: campaign.id, type: 'event', title: confirmed.eventName || '이벤트 비용', amount: isCompanyDirect || isManagerReimbursement ? amount : 0, costOwner: isCompanyDirect ? 'company' : confirmed.costHandling === 'vendor_free' ? 'brand' : 'manager', linkedData: `event:${event.id}`, evidenceStatus: 'confirmed', applyLocation, reflected: isCompanyDirect || isManagerReimbursement, memo: `${confirmed.plannedQuantity}명 예정 · ${confirmed.confirmedQuantity ?? 0}명 확정${confirmed.costHandling === 'manager_prepaid' ? ` · 승인형 매니저 선결제 환급 ${amount.toLocaleString('ko-KR')}원` : ''}`, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }
      setDraft((value) => ({ ...value, deductions: existing ? value.deductions.map((item) => item.id === existing.id ? eventDeduction : item) : [...value.deductions, eventDeduction] }))
      setPreview(null)
      setEventRevision((value) => value + 1)
    } catch (caught) { setError(caught instanceof Error ? caught.message : '이벤트 인원을 확정하지 못했습니다.') }
  }
  void eventRevision
  type RevisionComparisonRow = { category: string; item: string; before: string; after: string; difference: string; changeType: 'direct' | 'derived'; changed: boolean }
  const signed = (value: number, unit: 'money' | 'count' | 'rate') => {
    if (value === 0) return '-'
    const prefix = value > 0 ? '+' : '-'
    const absolute = Math.abs(value).toLocaleString('ko-KR')
    return unit === 'money' ? `${prefix}${absolute}원` : unit === 'count' ? `${prefix}${absolute}개` : `${prefix}${absolute}%p`
  }
  const numericComparison = (category: string, item: string, beforeValue: number, afterValue: number, unit: 'money' | 'count' | 'rate', changeType: 'direct' | 'derived'): RevisionComparisonRow => ({
    category, item,
    before: unit === 'money' ? money(beforeValue) : unit === 'count' ? `${beforeValue.toLocaleString('ko-KR')}개` : `${beforeValue}%`,
    after: unit === 'money' ? money(afterValue) : unit === 'count' ? `${afterValue.toLocaleString('ko-KR')}개` : `${afterValue}%`,
    difference: signed(afterValue - beforeValue, unit), changeType, changed: beforeValue !== afterValue,
  })
  const textComparison = (category: string, item: string, before: string, after: string): RevisionComparisonRow => ({ category, item, before, after, difference: '-', changeType: 'direct', changed: before !== after })
  const currentManagerFinal = managerBusinessType === 'freelancer' ? calculateWithholding(settlement.currentCalculation.managerBaseShareAmount, settlement.currentCalculation.managerDeductionTotal).finalPaymentAmount + settlement.currentCalculation.managerReimbursementTotal : settlement.currentCalculation.finalPaymentAmount
  const previewManagerFinal = preview ? managerBusinessType === 'freelancer' ? calculateWithholding(preview.managerBaseShareAmount, preview.managerDeductionTotal).finalPaymentAmount + preview.managerReimbursementTotal : preview.finalPaymentAmount : currentManagerFinal
  const comparison: RevisionComparisonRow[] = preview ? [
    ...draft.rows.flatMap((row) => { const before = revisionRows.find((item) => item.id === row.id); const label = `${campaign.productName} / ${row.optionName}`; return before ? [
      numericComparison('기본정보', `${label} / 판매수량`, before.quantity, row.quantity, 'count', 'direct'),
      numericComparison('기본정보', `${label} / 공구가`, before.unitPrice, row.unitPrice, 'money', 'direct'),
      numericComparison('수수료', `${label} / 총수수료율`, before.totalCommissionRate ?? 0, row.totalCommissionRate ?? 0, 'rate', 'direct'),
      numericComparison('수수료', `${label} / 셀러수수료율`, before.sellerCommissionRate ?? 0, row.sellerCommissionRate ?? 0, 'rate', 'direct'),
    ] : [] }),
    ...draft.deductions.flatMap((item) => { const before = deductions.find((deduction) => deduction.id === item.id); const ownerLabels: Record<SettlementDeduction['costOwner'], string> = { company: '회사', seller: '셀러', manager: '매니저', brand: '업체', undecided: '미정' }; return [
      numericComparison('비용', `${item.title} / 금액`, before?.amount ?? 0, item.amount, 'money', 'direct'),
      textComparison('비용', `${item.title} / 부담 주체`, before ? ownerLabels[before.costOwner] : '-', ownerLabels[item.costOwner]),
      textComparison('비용', `${item.title} / 메모`, before?.memo || '-', item.memo || '-'),
    ] }),
    numericComparison('결과', '총매출', settlement.currentCalculation.grossSales, preview.grossSales, 'money', 'derived'),
    numericComparison('결과', '총 판매 수수료', settlement.currentCalculation.grossCommission, preview.grossCommission, 'money', 'derived'),
    numericComparison('결과', '셀러 수수료', settlement.currentCalculation.sellerCommissionAmount, preview.sellerCommissionAmount, 'money', 'derived'),
    numericComparison('비용', '정산 반영 차감·조정', settlement.currentCalculation.companyEventDeduction, preview.companyEventDeduction, 'money', 'derived'),
    numericComparison('배분', '최종 배분 대상 수수료', settlement.currentCalculation.distributableVendorCommission, preview.distributableVendorCommission, 'money', 'derived'),
    numericComparison('배분', '매니저 지급액', settlement.currentCalculation.managerAmount, preview.managerAmount, 'money', 'derived'),
    numericComparison('배분', '회사 귀속액', settlement.currentCalculation.companyAmount, preview.companyAmount, 'money', 'derived'),
    numericComparison('결과', '셀러 최종 입금액', settlement.currentCalculation.finalSellerPaymentAmount, preview.finalSellerPaymentAmount, 'money', 'derived'),
    numericComparison('결과', '매니저 최종 정산금액', currentManagerFinal, previewManagerFinal, 'money', 'derived'),
  ].filter((item) => item.changed) : []
  const displayedCalculation = preview ?? settlement.currentCalculation
  const managerDisplayedFinal = managerBusinessType === 'freelancer' ? calculateWithholding(displayedCalculation.managerBaseShareAmount, displayedCalculation.managerDeductionTotal).finalPaymentAmount + displayedCalculation.managerReimbursementTotal : displayedCalculation.finalPaymentAmount
  return <div className="settlement-modal-backdrop"><section aria-modal="true" className="settlement-revision-modal" role="dialog"><button aria-label="닫기" className="settlement-expanded-close" onClick={onClose} type="button">×</button><header><div><span>v{settlement.settlementVersion} 수정</span><h2>정산서 수정하기</h2><p>현재 적용값을 기준으로 재계산하며, 저장 시 기존 버전은 보존됩니다.</p></div></header>
    {(legacySellerRequest || legacyManagerRequest) && <div className="legacy-payment-recovery legacy-payment-recovery--revision"><div><strong>⚠ 이전 지급요청 정보가 남아 있습니다.</strong><p>입력 중인 수정값은 유지됩니다. 기존 지급요청을 취소한 뒤 수정 저장을 계속해주세요.</p></div><div className="legacy-payment-recovery__requests">{legacySellerRequest && <div><span>셀러 지급요청</span><strong>{paymentStatusLabels[legacySellerRequest.status]}</strong><button className="danger-button" disabled={!paymentRequestService.canRecoverLegacyPaymentRequest(legacySellerRequest)} onClick={() => onRecoverLegacyRequest('seller')} type="button">기존 셀러 지급요청 취소</button></div>}{legacyManagerRequest && <div><span>매니저 지급요청</span><strong>{paymentStatusLabels[legacyManagerRequest.status]}</strong><button className="danger-button" disabled={!paymentRequestService.canRecoverLegacyPaymentRequest(legacyManagerRequest)} onClick={() => onRecoverLegacyRequest('manager')} type="button">기존 매니저 지급요청 취소</button></div>}</div></div>}
    <section><h3>상품/SKU별 수정</h3><div className="table-scroll"><table className="data-table settlement-revision-sku-table"><thead><tr><th>상품명</th><th>SKU</th><th>판매수량</th><th>공구가</th><th>매출액</th><th>총수수료율</th><th>총수수료</th><th>셀러수수료율</th><th>셀러수수료</th></tr></thead><tbody>{draft.rows.map((row) => { const sales = row.quantity * row.unitPrice; return <tr key={row.id}><td>{campaign.productName}</td><td>{row.optionName}</td><td><input min="0" onChange={(event) => updateRow(row.id, { quantity: Number(event.target.value) })} type="number" value={row.quantity} /></td><td><input min="0" onChange={(event) => updateRow(row.id, { unitPrice: Number(event.target.value) })} type="number" value={row.unitPrice} /></td><td>{money(sales)}</td><td><input max="100" min="0" onChange={(event) => updateRow(row.id, { totalCommissionRate: Number(event.target.value) })} type="number" value={row.totalCommissionRate} /></td><td>{money(Math.round(sales * (row.totalCommissionRate ?? draft.totalCommissionRate) / 100))}</td><td><input max="100" min="0" onChange={(event) => updateRow(row.id, { sellerCommissionRate: Number(event.target.value) })} type="number" value={row.sellerCommissionRate} /></td><td>{money(Math.round(sales * (row.sellerCommissionRate ?? draft.sellerCommissionRate) / 100))}</td></tr>})}</tbody></table></div></section>
        <section><h3>비용/차감</h3><div className="section-heading-actions"><p>연결된 차감·조정내역은 판매 데이터에서 자동 계산하며 결과 금액을 직접 수정하지 않습니다.</p><button className="secondary-button" onClick={addOtherDeduction} type="button">기타 비용 추가</button></div><div className="table-scroll"><table className="data-table"><thead><tr><th>항목</th><th>구분</th><th>금액</th><th>부담 주체</th><th>메모</th></tr></thead><tbody>{draft.deductions.map((item) => { const linkedEvent = item.linkedData.startsWith('event:') || item.linkedData.includes(':event:'); return <tr key={item.id}><td><input disabled={linkedEvent} onChange={(event) => updateDeduction(item.id, { title: event.target.value })} value={item.title} /></td><td>{item.applyLocation === 'net_company_commission_credit' ? '공급가 차이 가산' : item.type === 'sample' ? '샘플비' : item.type === 'event' || item.type === 'promotion' ? '차감·조정' : item.type === 'purchase' ? '스룩페이/구매비' : '기타비용·차감'}</td><td><input disabled={linkedEvent} min="0" onChange={(event) => updateDeduction(item.id, { amount: Number(event.target.value) })} title={linkedEvent ? '연결된 차감·조정내역에서 자동 계산됩니다.' : undefined} type="number" value={item.amount} /></td><td><select disabled={linkedEvent} onChange={(event) => updateDeduction(item.id, { costOwner: event.target.value as SettlementDeduction['costOwner'], applyLocation: event.target.value === 'company' ? 'net_company_commission' : event.target.value === 'seller' ? 'seller_payment' : event.target.value === 'manager' ? 'manager_payment' : 'record_only' })} value={item.costOwner}><option value="company">회사</option><option value="seller">셀러</option><option value="manager">매니저</option><option value="brand">업체</option></select></td><td><input onChange={(event) => updateDeduction(item.id, { memo: event.target.value })} value={item.memo} /></td></tr>})}</tbody></table></div></section>
    {events.length > 0 && <section><h3>연결 이벤트</h3><div className="settlement-event-summary-list">{events.map((event) => { const confirmedCost = campaignEventOperationService.getConfirmedSettlementCost(event); const actualCount = eventCounts[event.id] ?? 0; return <article key={event.id}><strong>{event.eventName}</strong><dl><div><dt>경품</dt><dd>{event.rewardProductName || '-'}</dd></div><div><dt>처리 방식</dt><dd>{event.costHandling === 'company_direct' ? '회사 직접 발송' : event.costHandling === 'vendor_free' ? '업체 무상 제공' : '매니저 선결제 · 승인형'}</dd></div><div><dt>경품 단가</dt><dd>{money(event.rewardUnitPrice)}</dd></div><div><dt>예정</dt><dd>{event.plannedQuantity}명 / {money(event.estimatedTotalAmount)}</dd></div><div><dt>실제 확정</dt><dd>{event.winnerCountConfirmed ? `${event.confirmedQuantity ?? 0}명 / ${money(confirmedCost ?? 0)}` : '당첨자 인원 미확정'}</dd></div><div><dt>정산 반영액</dt><dd>{event.winnerCountConfirmed ? money(confirmedCost ?? 0) : '확정 필요'}</dd></div><div><dt>발송 상태</dt><dd>{event.shippingStatus}</dd></div></dl>{(!event.winnerCountConfirmed || event.plannedQuantity !== (event.confirmedQuantity ?? 0)) && <><p className="settlement-readiness-modal__error">이벤트 당첨자 등록 인원이 예정 인원과 다릅니다.</p><div className="event-confirm-actions"><input aria-label={`${event.eventName} 실제 당첨자 수`} min="0" onChange={(change) => { setPreview(null); setEventCounts({ ...eventCounts, [event.id]: Number(change.target.value) }) }} type="number" value={actualCount} /><button className="secondary-button" onClick={() => { setPreview(null); setEventCounts({ ...eventCounts, [event.id]: actualCount + 1 }) }} type="button">1명 추가 등록</button><button className="primary-button" onClick={() => confirmEvent(event)} type="button">{actualCount}명으로 이벤트 확정</button></div></>}</article> })}</div></section>}
    <section><h3>배분 및 세무/지급</h3><div className="settlement-revision-grid"><Summary label="최종 배분 대상 수수료" value={money(displayedCalculation.distributableVendorCommission)} /><Summary label="매니저 배분율" value={`${displayedCalculation.managerShareRate}%`} /><Summary label="매니저 배분액" value={money(displayedCalculation.managerAmount)} /><Summary label="회사 귀속액" value={money(displayedCalculation.companyAmount)} /><Summary label="셀러 사업자 유형" value={sellerBusinessType ? businessTypeLabels[sellerBusinessType] : '미등록'} /><Summary label="매니저 사업자 유형" value={businessTypeLabels[managerBusinessType]} /><Summary label="셀러 최종 입금액" value={money(displayedCalculation.finalSellerPaymentAmount)} /><Summary label="매니저 최종 정산금액" value={money(managerDisplayedFinal)} /></div></section>
    {preview && <section><h3>변경 전/후 비교</h3>{comparison.length ? <table className="data-table settlement-revision-comparison"><thead><tr><th>구분</th><th>항목</th><th>변경 전</th><th>변경 후</th><th>차이</th></tr></thead><tbody>{comparison.map((item) => <tr className={`is-changed is-${item.changeType}`} key={`${item.category}-${item.item}`}><td>{item.category}</td><th>{item.item}</th><td>{item.before}</td><td className="revision-comparison-after">{item.after}</td><td className="revision-comparison-difference">{item.difference}</td></tr>)}</tbody></table> : <p className="settlement-revision-no-change">변경된 입력값이나 계산 결과가 없습니다.</p>}</section>}
    <ReasonInput autoFocus={false} onChange={(event) => setDraft({ ...draft, reason: event.target.value })} placeholder="정산서 수정 사유를 입력해주세요." value={draft.reason} />{error && <p className="settlement-readiness-modal__error">{error}</p>}<div className="modal-actions"><button className="secondary-button" onClick={onClose} type="button">취소</button><button className="secondary-button" onClick={calculate} type="button">변경 후 다시 계산</button><button className="primary-button" disabled={!preview || !draft.reason.trim()} onClick={save} type="button">수정 저장</button></div></section></div>
}

function ReadinessWarningSection({ id, title, warnings }: { id?: string; title: string; warnings: ReadinessWarning[] }) {
  return <section className="settlement-preparation-warning" id={id}><div><span aria-hidden="true">!</span><h2>{title}</h2><small>{warnings.length}개</small></div><ul>{warnings.map((warning) => <li key={warning.id}><span>{warning.message}</span><button className="secondary-button" onClick={warning.action} type="button">{warning.actionLabel}</button></li>)}</ul></section>
}

const costOwnerLabel: Record<string, string> = { seller: '셀러', company: '회사', brand: '벤더', manager: '매니저', undecided: '미정' }

function formatKoreanDateTime(value: string) {
  return formatKoreanDateTimeCommon(value)
}

function CalculationTable({ settlement }: { settlement: Settlement }) {
  return <div className="settlement-work-table-wrap"><table className="settlement-work-table settlement-calculation-table"><thead><tr><th>항목</th><th>계산식</th><th>결과</th><th>계산 근거</th></tr></thead><tbody>{settlement.calculationSteps.map((step) => (
    <tr key={step.id}><td><strong>{step.label}</strong>{step.modified && <span className="manual-modified">⚠ 수동 수정</span>}</td><td>{step.formula}</td><td className="amount-cell">{typeof step.result === 'number' ? money(step.result) : step.result}</td><td><details className="calculation-evidence"><summary>계산 근거 보기</summary><dl><div><dt>입력값</dt><dd>{step.inputValues.length ? step.inputValues.join(' / ') : '-'}</dd></div><div><dt>값의 출처</dt><dd>{step.source}</dd></div><div><dt>수정 여부</dt><dd>{step.modified ? '담당자 수정' : '자동 계산'}</dd></div><div><dt>계산 시각</dt><dd>{formatKoreanDateTime(step.calculatedAt)}</dd></div></dl></details></td></tr>
  ))}</tbody></table></div>
}

function Summary({ label, value, amount, emphasis }: { label: string; value: string; amount?: boolean; emphasis?: boolean }) {
  return <div className={`settlement-summary-item${emphasis ? ' settlement-summary-item--emphasis' : ''}`}><span>{label}</span><strong className={amount ? 'amount-cell' : ''}>{value}</strong></div>
}

const workflowSteps = ['정산서 작성 완료', '지급 요청', '지급 요청 검수', '입금 완료'] as const
const requestedPaymentStatuses: PaymentRequestStatus[] = ['evidence_pending', 'request_ready', 'approval_pending', 'approved', 'sent', 'payment_completed', 'remittance_confirmed', 'on_hold']
const approvedPaymentStatuses: PaymentRequestStatus[] = ['approved', 'sent', 'payment_completed', 'remittance_confirmed']

function getPaymentPresentation(status: PaymentRequestStatus | undefined, completed: boolean) {
  const paid = completed || status === 'payment_completed' || status === 'remittance_confirmed'
  const approved = paid || Boolean(status && approvedPaymentStatuses.includes(status))
  const requested = approved || Boolean(status && requestedPaymentStatuses.includes(status))
  let notice: PayoutStatusNotice
  if (paid) notice = { title: '지급이 완료되었습니다.', detail: '', tone: 'complete' }
  else if (approved) notice = { title: '증빙자료 검수가 완료되었습니다.', detail: '입금 대기 중입니다.', tone: 'approved' }
  else if (status === 'rejected') notice = { title: '지급 요청이 반려되었습니다.', detail: '수정 후 다시 요청해주세요.', tone: 'pending' }
  else if (requested) notice = { title: '지급 요청이 완료되었습니다.', detail: '증빙 검수 대기 중입니다.', tone: 'waiting' }
  else notice = { title: '해당 정산서는 아직 지급신청이 되지 않은 정산서입니다.', detail: '', tone: 'pending' }
  return { requested, approved, paid, notice }
}

function SettlementProgress({ managerStatus, sellerStatus, settlement }: { managerStatus?: PaymentRequestStatus; sellerStatus?: PaymentRequestStatus; settlement: Settlement }) {
  const seller = getPaymentPresentation(sellerStatus, settlement.sellerPaymentCompleted)
  const manager = getPaymentPresentation(managerStatus, settlement.managerPaymentCompleted)
  const both = (key: keyof typeof seller) => seller[key] && manager[key]
  const completedStepCount = both('paid') ? 4 : both('approved') ? 3 : both('requested') ? 2 : 1
  const statusText = (value: boolean, completeText: string, waitingText: string) => value ? completeText : waitingText
  return <section className="settlement-page-section settlement-progress-section" id="progress">
    <div className="section-heading"><div><p className="page-eyebrow">3. 정산 진행상황</p><h2>정산 진행상황</h2></div></div>
    <ol className="settlement-stepper settlement-stepper--four">{workflowSteps.map((step, index) => <li className={index < completedStepCount ? 'is-complete' : index === completedStepCount ? 'is-current' : ''} key={step}><span>{index < completedStepCount ? '✓' : index + 1}</span><strong>{step}</strong></li>)}</ol>
    <div className="recipient-payment-progress"><div className="recipient-payment-progress__head"><span>대상</span><span>지급 요청</span><span>증빙자료 검수</span><span>입금</span></div>{([['셀러', seller], ['매니저', manager]] as const).map(([label, state]) => <div className="recipient-payment-progress__row" key={label}><strong>{label}</strong><span className={state.requested ? 'is-complete' : ''}>{statusText(state.requested, '완료', '대기')}</span><span className={state.approved ? 'is-complete' : ''}>{state.approved ? '완료' : state.requested ? '대기' : '-'}</span><span className={state.paid ? 'is-complete' : ''}>{state.paid ? '완료' : state.approved ? '대기' : '-'}</span></div>)}</div>
  </section>
}

function RevisionRequestHistory({ logs }: { logs: ReturnType<typeof settlementService.getActivityLogsBySettlementId> }) {
  const requests = logs.filter((log) => log.action === 'revision_requested')
  if (!requests.length) return null
  return <section className="revision-request-history"><h3>수정 요청 이력</h3>{requests.map((log) => <article key={log.id}><strong>수정 요청 · v{log.version}</strong><time>{formatKoreanDateTime(log.at)}</time><span>요청자: {log.actor}</span><p>사유: {log.reason}</p></article>)}</section>
}

const checklistLabels = {
  salesMatches: '총매출이 Sales Data와 일치함',
  commissionRateConfirmed: '수수료율이 정확함',
  sampleCostReflected: '샘플비가 반영됨',
  eventCostReflected: '차감·조정내역이 반영됨',
  otherDeductionsConfirmed: '기타 차감이 확인됨',
  costOwnersConfirmed: '비용 부담자가 정확함',
  managerShareConfirmed: '매니저 배분율이 정확함',
  taxTypeConfirmed: '세무 유형이 정확함',
  evidenceConfirmed: '증빙 상태가 확인됨',
  paymentAccountConfirmed: '지급 계좌 정보가 확인됨',
}

function InternalSettlementDocument({ campaignName, rows, settlement }: { campaignName: string; rows: SalesDataRow[]; settlement: Settlement }) {
  const calculation = settlement.currentCalculation
  const campaign = getCampaign(settlement)
  const snapshots = campaign?.proposalSnapshots ?? []
  const managerBusinessType = managerPaymentService.getBusinessType(campaign?.managerName ?? '', campaign?.managerId)
  const productRows = rows.map((row) => {
    const snapshot = snapshots.find((item) => item.salePrice === row.unitPrice) ?? snapshots[0]
    const totalRate = row.totalCommissionRate ?? snapshot?.totalCommissionRate ?? calculation.totalCommissionRate
    const sellerRate = row.sellerCommissionRate ?? snapshot?.sellerCommissionRate ?? calculation.sellerCommissionRate
    const sellerAmount = calculateSellerProductRow(row, sellerRate)
    const internalAmount = calculateManagerProductRow(row, totalRate)
    const productName = campaign?.campaignProducts?.find((item) => item.productId === snapshot?.productId)?.productName ?? campaign?.productName ?? '-'
    return { row, totalRate, sellerRate, sellerAmount, internalAmount, productName }
  })
  const sellerSubtotal = productRows.reduce((total, item) => ({
    quantity: total.quantity + item.sellerAmount.quantity,
    supply: total.supply + item.sellerAmount.supplyTotal,
    sales: total.sales + item.sellerAmount.salesAmount,
    commission: total.commission + item.sellerAmount.commissionAmount,
  }), { quantity: 0, supply: 0, sales: 0, commission: 0 })
  const internalSubtotal = productRows.reduce((total, item) => ({
    quantity: total.quantity + item.internalAmount.quantity,
    supply: total.supply + item.internalAmount.supplyPrice * item.internalAmount.quantity,
    sales: total.sales + item.sellerAmount.salesAmount,
    commission: total.commission + item.internalAmount.salesCommission,
  }), { quantity: 0, supply: 0, sales: 0, commission: 0 })
  const companyDeductions = calculation.deductions.filter((item) => item.reflected && item.applyLocation === 'net_company_commission')
  const sumCosts = (predicate: (item: SettlementDeduction) => boolean) => companyDeductions.filter(predicate).reduce((sum, item) => sum + item.amount, 0)
  const srookPayCost = sumCosts((item) => item.type === 'purchase' || /스룩|PG/i.test(item.title))
  const eventDetail = (campaign?.campaignEvents ?? []).filter((event) => event.winnerCountConfirmed).map((event) => {
    const count = event.confirmedQuantity ?? 0
    const handling = event.costHandling === 'company_direct' ? '회사 직접 발송' : event.costHandling === 'vendor_free' ? '업체 무상 제공' : '매니저 선결제'
    return `${event.rewardProductName || event.eventName} ${event.rewardUnitPrice.toLocaleString('ko-KR')}원 × 확정 ${count}명 · ${handling}`
  }).join(' / ')
  const costRows = [
    { label: '샘플비', amount: calculation.companySampleDeduction, items: companyDeductions.filter((item) => item.type === 'sample') },
    { label: '차감·조정', amount: calculation.companyEventDeduction, items: companyDeductions.filter((item) => item.type === 'event' || item.type === 'promotion') },
    { label: '기타비용', amount: Math.max(calculation.companyOtherDeduction - srookPayCost, 0), items: companyDeductions.filter((item) => item.type !== 'sample' && item.type !== 'event' && item.type !== 'promotion' && item.type !== 'purchase' && !/스룩|PG/i.test(item.title)) },
    { label: '스룩페이 수수료', amount: srookPayCost, items: companyDeductions.filter((item) => item.type === 'purchase' || /스룩|PG/i.test(item.title)) },
  ]
  const ownerText = (items: SettlementDeduction[]) => items.length ? [...new Set(items.map((item) => costOwnerLabel[item.costOwner] ?? item.costOwner))].join(', ') : '-'
  const memoText = (label: string, items: SettlementDeduction[]) => label === '차감·조정' && eventDetail ? eventDetail : items.map((item) => item.memo || item.title).filter(Boolean).join(' / ') || '-'
  const grossManagerAmount = calculation.managerBaseShareAmount
  const withholding = calculateWithholding(grossManagerAmount, calculation.managerDeductionTotal)
  const managerFinalPayment = managerBusinessType === 'freelancer' ? withholding.finalPaymentAmount + calculation.managerReimbursementTotal : calculation.finalPaymentAmount
  const validationItems = [
    { label: 'SKU 매출 합계 = 총매출', valid: sellerSubtotal.sales === calculation.grossSales },
    { label: 'SKU 셀러 수수료 합계 = 셀러 수수료', valid: sellerSubtotal.commission === calculation.sellerCommissionAmount },
    { label: 'SKU 총 판매 수수료 합계 = 총수수료', valid: internalSubtotal.commission === calculation.grossCommission },
    { label: '총수수료 - 셀러수수료 + 가산조정 - 비용/차감 - 선결제 환급 = 최종 배분 대상', valid: calculation.grossCommission - calculation.sellerCommissionAmount + (calculation.companyAdjustmentCredit ?? 0) - calculation.companySampleDeduction - calculation.companyEventDeduction - calculation.companyOtherDeduction - calculation.managerReimbursementTotal === calculation.distributableVendorCommission },
    { label: '매니저 기본 배분 + 회사 귀속 = 최종 배분 대상', valid: calculation.managerBaseShareAmount + calculation.companyAmount === calculation.distributableVendorCommission },
  ]
  const validationFailures = validationItems.filter((item) => !item.valid)
  return (
    <div className="internal-settlement-document">
      <div className="checklist-head">
        <div><h4>{campaignName} 내부 검토용 정산서</h4><p>내부 수수료, 벤더 배분, 승인 상태를 포함합니다.</p></div>
        <Badge label={statusLabel(settlement.status)} tone={statusTone[settlement.status]} />
      </div>
      <div className="settlement-summary-grid">
        <Summary label="총매출" value={money(settlement.currentCalculation.grossSales)} amount />
        <Summary label="총수수료율" value={`${settlement.currentCalculation.totalCommissionRate}%`} />
        <Summary label="총수수료" value={money(settlement.currentCalculation.grossCommission)} amount />
        <Summary label="셀러 수수료율" value={`${settlement.currentCalculation.sellerCommissionRate}%`} />
        <Summary label="셀러 지급액" value={money(settlement.currentCalculation.finalSellerPaymentAmount)} amount />
        <Summary label="벤더 수수료" value={money(settlement.currentCalculation.vendorCommission)} amount />
        <Summary label="샘플비" value={money(settlement.currentCalculation.companySampleDeduction)} amount />
        <Summary label="차감·조정" value={money(settlement.currentCalculation.companyEventDeduction)} amount />
        <Summary label="기타 차감" value={money(settlement.currentCalculation.companyOtherDeduction)} amount />
        <Summary label="최종 배분 대상 금액" value={money(settlement.currentCalculation.distributableVendorCommission)} amount />
        <Summary label="매니저 선결제 환급" value={money(settlement.currentCalculation.managerReimbursementTotal)} amount />
        <Summary label="매니저 지급액" value={money(settlement.currentCalculation.managerAmount)} amount />
        <Summary label="회사 귀속액" value={money(settlement.currentCalculation.companyAmount)} amount />
      </div>
      <div className="internal-excel-grid">
        <section className="internal-excel-panel"><h3>셀러 정산</h3><table className="internal-excel-table internal-excel-table--seller"><thead><tr><th>상품명</th><th>구분/SKU</th><th>판매수량</th><th>공구가</th><th>매출액</th><th>셀러<br />수수료율</th><th>셀러 수수료</th><th>비고</th></tr></thead><tbody>{productRows.map(({ row, sellerRate, sellerAmount, productName }) => <tr key={row.id}><td>{productName}</td><td>{row.optionName}</td><td className="amount-cell">{sellerAmount.quantity.toLocaleString('ko-KR')}개</td><td className="amount-cell">{money(row.unitPrice)}</td><td className="amount-cell">{money(sellerAmount.salesAmount)}</td><td className="rate-cell">{sellerRate}%</td><td className="amount-cell">{money(sellerAmount.commissionAmount)}</td><td>{row.validationStatus === 'valid' ? '-' : row.validationMessage}</td></tr>)}</tbody><tfoot><tr><th colSpan={2}>판매 소계</th><td>{sellerSubtotal.quantity.toLocaleString('ko-KR')}개</td><td><small>셀러 공급가 합계</small>{money(sellerSubtotal.supply)}</td><td>{money(sellerSubtotal.sales)}</td><td></td><td>{money(sellerSubtotal.commission)}</td><td></td></tr></tfoot></table></section>
        <section className="internal-excel-panel"><h3>와이즈벤더 내부 정산</h3><table className="internal-excel-table internal-excel-table--vendor"><thead><tr><th>상품명</th><th>구분/SKU</th><th>공급가</th><th>공구가</th><th>총수수료율</th><th>상품당<br />수수료</th><th>판매수량</th><th>총 판매<br />수수료</th><th>차감</th><th>비고</th></tr></thead><tbody>{productRows.map(({ row, totalRate, internalAmount, productName }) => <tr key={row.id}><td>{productName}</td><td>{row.optionName}</td><td className="amount-cell">{money(internalAmount.supplyPrice)}</td><td className="amount-cell">{money(row.unitPrice)}</td><td className="rate-cell">{totalRate}%</td><td className="amount-cell">{money(internalAmount.unitCommission)}</td><td className="amount-cell">{internalAmount.quantity.toLocaleString('ko-KR')}개</td><td className="amount-cell">{money(internalAmount.salesCommission)}</td><td>-</td><td>{row.validationStatus === 'valid' ? '-' : row.validationMessage}</td></tr>)}</tbody><tfoot><tr><th colSpan={2}>내부 수수료 소계</th><td>{money(internalSubtotal.supply)}</td><td>{money(internalSubtotal.sales)}</td><td></td><td></td><td>{internalSubtotal.quantity.toLocaleString('ko-KR')}개</td><td>{money(internalSubtotal.commission)}</td><td></td><td></td></tr></tfoot></table></section>
      </div>
      <div className="internal-commission-flow"><span>총 판매 수수료 <strong>{money(calculation.grossCommission)}</strong></span><b>−</b><span>셀러 수수료 <strong>{money(calculation.sellerCommissionAmount)}</strong></span><b>=</b><span>벤더 수수료 <strong>{money(calculation.vendorCommission)}</strong></span></div>
      <div className="internal-excel-bottom-grid">
        <section className="internal-unified-settlement"><h3>비용 / 차감</h3><table className="internal-review-table internal-cost-table"><thead><tr><th>항목</th><th>금액</th><th>부담 주체</th><th>메모</th></tr></thead><tbody>{costRows.map((row) => <tr key={row.label}><td>{row.label}</td><td>{money(row.amount)}</td><td>{ownerText(row.items)}</td><td>{memoText(row.label, row.items)}</td></tr>)}</tbody></table></section>
        <section className="internal-unified-settlement"><h3>수수료 배분</h3><table className="internal-review-table"><thead><tr><th>구분</th><th>배분율</th><th>금액</th></tr></thead><tbody><tr><td>매니저</td><td>{calculation.managerShareRate}%</td><td>{money(calculation.managerAmount)}</td></tr><tr><td>회사</td><td>{calculation.companyShareRate}%</td><td>{money(calculation.companyAmount)}</td></tr></tbody></table></section>
      </div>
      <table className="internal-review-table internal-distributable-total"><tbody><tr><th>최종 배분 대상 수수료</th><td>{money(calculation.distributableVendorCommission)}</td></tr></tbody></table>
      {managerBusinessType === 'freelancer' && <section className="internal-unified-settlement internal-tax-settlement"><h3>매니저 세무처리</h3><table className="internal-review-table"><tbody><tr><th>매니저 배분액</th><td>{money(grossManagerAmount)}</td></tr><tr><th>원천세 신고금액</th><td>{money(withholding.withholdingBaseAmount)}</td></tr><tr><th>소득세 3%</th><td>- {money(withholding.incomeTaxAmount)}</td></tr><tr><th>지방소득세 0.3%</th><td>- {money(withholding.localIncomeTaxAmount)}</td></tr><tr><th>총 원천세</th><td>- {money(withholding.totalWithholdingTaxAmount)}</td></tr><tr className="internal-manager-final"><th>최종 매니저 지급액</th><td>{money(managerFinalPayment)}</td></tr></tbody></table></section>}
      <div className={`internal-validation ${validationFailures.length ? 'is-mismatch' : 'is-match'}`}><strong>{validationFailures.length ? '⚠ 내부 검산 불일치' : '✓ 내부 검산 일치'}</strong>{validationFailures.length > 0 && <ul>{validationFailures.map((item) => <li key={item.label}>{item.label}</li>)}</ul>}</div>
    </div>
  )
}

function eventAmount(event: CampaignEvent) {
  return event.confirmedTotalAmount ?? event.estimatedTotalAmount
}

type SellerCostRow = { id: string; label: string; amount?: number; direction: 'deduction' | 'payment'; owner: string; memo: string }

function getSellerCostRows(campaign: ReturnType<typeof getCampaign>, deductions: SettlementDeduction[]): SellerCostRow[] {
  const sellerDeductions = deductions.filter((item) => item.applyLocation === 'seller_payment')
  const adjustmentRows = sellerDeductions
    .filter((item) => item.amount > 0 || item.memo)
    .map((item): SellerCostRow => {
      const isPayment = item.type === 'promotion'
      const isPaymentFee = isPayment && item.title.includes('수수료')
      const label = item.type === 'purchase' ? '개인구매비용'
        : item.type === 'event' ? '셀러 부담 이벤트'
          : isPaymentFee ? '기타 지급 수수료'
            : isPayment ? '기타 지급'
              : item.type === 'other' && item.title.includes('비용') ? '기타 비용' : '기타 차감'
      return { id: item.id, label, amount: item.amount, direction: isPayment ? 'payment' : 'deduction', owner: costOwnerLabel[item.costOwner] ?? item.costOwner, memo: item.memo || item.title || '-' }
    })
  const linkedEventIds = new Set(sellerDeductions.flatMap((item) => campaign?.campaignEvents?.filter((event) => item.linkedData.includes(event.id)).map((event) => event.id) ?? []))
  const campaignEventRows = (campaign?.campaignEvents ?? [])
    .filter((event) => (event.payer === 'seller' || event.payer === 'shared') && !linkedEventIds.has(event.id))
    .map((event): SellerCostRow => {
      const sellerShare = event.payer === 'seller' ? eventAmount(event) : event.costShares?.find((share) => share.owner === 'seller')?.amount
      return { id: event.id, label: event.payer === 'shared' ? '공동 부담 이벤트 중 셀러 부담분' : '셀러 부담 이벤트', amount: sellerShare, direction: 'deduction', owner: event.payer === 'shared' ? '공동 부담' : '셀러', memo: `${getCampaignEventTypeLabel(event.eventType)} · ${event.memo || event.rewardProductName || '-'}` }
    })
  return [...adjustmentRows, ...campaignEventRows]
}

function SellerAdditionalCosts({ rows }: { rows: SellerCostRow[] }) {
  if (!rows.length) return null
  return <section className="seller-document__section seller-document__costs"><h3>추가 비용 및 차감</h3><table className="seller-document__table"><thead><tr><th>항목</th><th>금액</th><th>부담 주체</th></tr></thead><tbody>
    {rows.map((row) => <tr className={row.direction === 'deduction' && row.amount !== undefined && row.amount > 0 ? 'seller-cost-deduction' : undefined} key={row.id}><td>{row.label}</td><td className={`amount-cell ${row.direction === 'payment' ? 'seller-positive-amount' : ''}`}>{row.amount === undefined ? '등록 정보 없음' : `${row.direction === 'payment' ? '+' : '-'} ${money(row.amount)}`}</td><td>{row.owner}</td></tr>)}
  </tbody></table></section>
}

const paymentStatusLabels: Record<PaymentRequestStatus, string> = {
  draft: '지급 대기', evidence_pending: '증빙 검수 대기', request_ready: '지급 요청 준비', approval_pending: '대표 승인 대기',
  approved: '지급 승인', sent: '전달 완료', payment_completed: '지급 완료', remittance_confirmed: '입금 확인 완료',
  on_hold: '보류', rejected: '반려', canceled: '취소',
}

const businessTypeLabels: Record<SellerBusinessType, string> = {
  corporation: '법인', general_business: '일반 개인사업자', simplified_business: '간이사업자', freelancer: '개인 프리랜서',
}

const formatRate = (value: number) => Number.isInteger(value) ? `${value}%` : `${Number(value.toFixed(4))}%`
const formatFloorRate = (value: number) => `${Math.floor(value)}%`

function managerCostLabel(item: SettlementDeduction) {
  if (item.type === 'sample') return item.title.includes('추가') ? '샘플 추가비용' : '샘플 비용'
  if (item.type === 'event') return item.costOwner === 'manager' ? '매니저 부담 이벤트' : item.costOwner === 'company' ? '회사 부담 이벤트' : '공동 부담 이벤트'
  if (item.type === 'promotion') return '기타 추가 지급'
  if (item.type === 'purchase' && item.costOwner === 'manager') return '매니저 선결제'
  if (item.type === 'other' && item.title.includes('비용')) return '기타 비용'
  return '기타 차감'
}

// Presentation-only aggregation; retain source rows for exact rounded totals.
function groupStatementRows(rows: SalesDataRow[], fallbackName: string, separateRowIds = new Set<string>()) {
  const groups = new Map<string, SalesDataRow[]>()
  for (const row of rows) {
    const name = row.productName?.trim() || fallbackName
    const additional = /추가\s*(옵션|상품)/.test(row.optionName) || (/에어건/.test(name + fallbackName) && /필터/.test(row.optionName))
    const label = additional ? '추가옵션' : name
    const group = groups.get(label) ?? []
    group.push(row)
    groups.set(label, group)
  }
  return [...groups.entries()].sort(([a], [b]) => Number(a === '추가옵션') - Number(b === '추가옵션') || a.localeCompare(b, 'ko', { numeric: true })).flatMap(([productName, items]) => {
    const options = new Map<string, SalesDataRow[]>()
    for (const row of items) {
      const key = JSON.stringify([row.productId, row.skuId, row.optionName.trim().replace(/\s+/g, ' '), row.unitPrice, row.sellerCommissionRate, row.totalCommissionRate, row.validationStatus, row.validationMessage, separateRowIds.has(row.id) ? row.id : null])
      const sources = options.get(key) ?? []
      sources.push(row)
      options.set(key, sources)
    }
    return [...options.values()].sort((a, b) => a[0].optionName.localeCompare(b[0].optionName, 'ko', { numeric: true })).map((sourceRows, index) => ({
      row: { ...sourceRows[0], netQuantity: sourceRows.reduce((sum, row) => sum + Math.round(row.netQuantity), 0) },
      sourceRows, productName, productRowSpan: index === 0 ? options.size : 0,
    }))
  })
}

function CompanyCollectionSettlementDocument({ documentRef, rows, settlement, source }: { documentRef: RefObject<HTMLDivElement | null>; rows: SalesDataRow[]; settlement: Settlement; source: SalesDataImport }) {
  const campaign = getCampaign(settlement)
  const calculation = settlement.currentCalculation
  const sellerReport = calculateVendorDocument(rows, source, campaign)
  const sellerAdjustment = calculation.sellerDeductionTotal
  const sellerReceivable = sellerReport.finalAmount === undefined ? undefined : sellerReport.finalAmount + sellerAdjustment
  const supplierProductAmount = rows.every((row) => row.totalCommissionRate !== undefined)
    ? rows.reduce((sum, row) => sum + calculateManagerProductRow(row, row.totalCommissionRate!).supplyPrice * Math.round(row.netQuantity), 0)
    : undefined
  const supplierShipping = source.fileAnalysis?.supplierShippingCost ?? sellerReport.shipping
  const supplierPayable = source.fileAnalysis?.supplierPayableTotal
    ?? (supplierProductAmount !== undefined && supplierShipping !== undefined ? supplierProductAmount + supplierShipping : undefined)

  return <div className="seller-document-shell"><div className="seller-document seller-statement manager-document" ref={documentRef}>
    <header className="seller-document__header"><h2>[와이즈벤더 회사 내부 정산서]</h2><p><span>정산 버전</span><strong>v{settlement.settlementVersion}</strong></p></header>
    <table className="seller-document__table seller-document__meta-table"><tbody><tr><th>공구기간</th><td>{formatKoreanDate(source.salesStartDate ?? campaign?.startDate)} ~ {formatKoreanDate(source.salesEndDate ?? campaign?.endDate)}</td></tr><tr><th>진행 물품</th><td>{campaign?.productName ?? '-'}</td></tr><tr><th>판매 셀러</th><td>{campaign?.sellerName ?? '-'}</td></tr><tr><th>판매 링크</th><td>셀러 링크 · 판매대금 셀러 수령</td></tr><tr><th>담당 매니저</th><td>{campaign?.managerName ?? '-'}</td></tr></tbody></table>
    <section className="manager-document__section"><h3>셀러에게 받을 금액</h3><table className="seller-document__table"><tbody><tr><th>상품 판매금액</th><td className="amount-cell">{money(sellerReport.salesTotal)}</td></tr><tr><th>− 셀러 보유 수수료</th><td className="amount-cell">{sellerReport.commissionTotal === undefined ? '조건 확인 필요' : `− ${money(sellerReport.commissionTotal)}`}</td></tr><tr><th>+ 판매 배송비</th><td className="amount-cell">{sellerReport.shipping === undefined ? '배송비 확인 필요' : `+ ${money(sellerReport.shipping)}`}</td></tr>{sellerAdjustment > 0 && <tr><th>+ 셀러 부담 차감·조정</th><td className="amount-cell">+ {money(sellerAdjustment)}</td></tr>}<tr className="manager-final-row"><th>셀러 입금 요청액</th><td className="amount-cell"><strong>{sellerReceivable === undefined ? '조건 확인 필요' : money(sellerReceivable)}</strong></td></tr></tbody></table></section>
    <section className="manager-document__section"><h3>공급사 지급 예정액</h3><table className="seller-document__table"><tbody><tr><th>공급사 물품대금</th><td className="amount-cell">{supplierProductAmount === undefined ? '총수수료 조건 확인 필요' : money(supplierProductAmount)}</td></tr><tr><th>공급사 배송비</th><td className="amount-cell">{supplierShipping === undefined ? '배송비 확인 필요' : money(supplierShipping)}</td></tr><tr className="manager-final-row"><th>공급사 지급 예정액</th><td className="amount-cell"><strong>{supplierPayable === undefined ? '조건 확인 필요' : money(supplierPayable)}</strong></td></tr></tbody></table></section>
    <section className="manager-document__section"><h3>수수료 배분 및 회사 귀속</h3><table className="seller-document__table"><tbody><tr><th>총수수료</th><td className="amount-cell">{money(calculation.grossCommission)}</td></tr><tr><th>− 셀러 수수료</th><td className="amount-cell">− {money(calculation.sellerCommissionAmount)}</td></tr><tr><th>− 회사 부담 비용·차감 및 환급</th><td className="amount-cell">− {money(calculation.companySampleDeduction + calculation.companyEventDeduction + calculation.companyOtherDeduction + calculation.managerReimbursementTotal)}</td></tr><tr><th>최종 배분 대상 수수료</th><td className="amount-cell">{money(calculation.distributableVendorCommission)}</td></tr><tr><th>매니저 배분액</th><td className="amount-cell">{money(calculation.managerBaseShareAmount)}</td></tr><tr className="manager-final-row"><th>회사 귀속액</th><td className="amount-cell"><strong>{money(calculation.companyAmount)}</strong></td></tr></tbody></table></section>
  </div></div>
}

function ManagerSettlementDocument({ documentRef, exportGeneratedAt, rows, settlement }: { documentRef: RefObject<HTMLDivElement | null>; exportGeneratedAt: string; rows: SalesDataRow[]; settlement: Settlement }) {
  const campaign = getCampaign(settlement)
  const companyDirect = Boolean((salesDataService.getSalesDataImportById(settlement.salesDataImportId)?.supplyAudience ?? campaign?.supplyAudience) === 'vendor' || (campaign && isCompanyDirectManager(campaign.managerId, campaign.managerName)))
  const snapshots = campaign?.proposalSnapshots ?? []
  const report = managerSettlementReportService.getReport(settlement)
  const managerBusinessType = managerPaymentService.getBusinessType(campaign?.managerName ?? '', campaign?.managerId)
  const managerProfile = campaign ? managerPaymentService.getProfile(campaign.managerId) : undefined
  const grossManagerAmount = settlement.currentCalculation.managerBaseShareAmount
  const withholdingCalculation = calculateWithholding(grossManagerAmount, settlement.currentCalculation.managerDeductionTotal)
  const managerPayout = calculateManagerPayoutBreakdown(grossManagerAmount, managerBusinessType, settlement.currentCalculation.managerDeductionTotal, settlement.currentCalculation.managerReimbursementTotal)
  const managerFinalPayment = managerBusinessType === 'freelancer' ? withholdingCalculation.finalPaymentAmount + settlement.currentCalculation.managerReimbursementTotal
    : managerPayout.finalPaymentAmount
  const finalCompanyAttribution = companyDirect ? settlement.currentCalculation.distributableVendorCommission : managerFinalPayment
  const srookSnapshots = snapshots.filter((item) => item.actualSalesChannel === 'wise_shop_link')
  const isSrookPayCampaign = srookSnapshots.length > 0 || (!snapshots.length && report.actualSalesChannel === 'wise_shop_link')
  const srookPayDeductions = report.companyCosts.filter((item) => item.type === 'purchase' || /스룩|PG/i.test(item.title))
  const snapshotSrookPayAmounts = srookSnapshots.map((item) => item.actualPgCost).filter((amount): amount is number => amount !== undefined)
  const srookPayAmount = srookPayDeductions.length
    ? srookPayDeductions.reduce((sum, item) => sum + item.amount, 0)
    : snapshotSrookPayAmounts.length ? snapshotSrookPayAmounts.reduce((sum, amount) => sum + amount, 0) : undefined
  const preDistributionCosts = report.companyCosts.filter((item) => item.amount > 0 && item.type !== 'event' && item.type !== 'promotion' && item.type !== 'purchase' && !/스룩|PG/i.test(item.title))
  const preDistributionCredits = settlement.currentCalculation.deductions.filter((item) => item.reflected && item.applyLocation === 'net_company_commission_credit' && item.amount > 0)
  const eventCosts = settlement.currentCalculation.deductions.filter((item) => item.amount > 0 && (item.type === 'event' || item.type === 'promotion'))
  const eventDistributionCosts = eventCosts.filter((item) => item.reflected && (item.applyLocation === 'net_company_commission' || item.applyLocation === 'manager_reimbursement'))
  const managerProductRows = groupStatementRows(rows, campaign?.productName ?? '-').map(({ row, productName, productRowSpan }) => {
    const snapshot = snapshots.find((item) => item.salePrice === row.unitPrice) ?? snapshots[0]
    const totalRate = row.totalCommissionRate ?? snapshot?.totalCommissionRate ?? settlement.currentCalculation.totalCommissionRate
    const productAmount = calculateManagerProductRow(row, totalRate)
    return { row, totalRate, productAmount, productName, productRowSpan, salesAmount: row.unitPrice * productAmount.quantity, supplyAmount: productAmount.supplyPrice * productAmount.quantity }
  })
  const managerProductSubtotal = managerProductRows.reduce((total, item) => ({
    quantity: total.quantity + item.productAmount.quantity,
    supplyAmount: total.supplyAmount + item.supplyAmount,
    salesAmount: total.salesAmount + item.salesAmount,
    salesCommission: total.salesCommission + item.productAmount.salesCommission,
  }), { quantity: 0, supplyAmount: 0, salesAmount: 0, salesCommission: 0 })
  return <div className="seller-document-shell"><div className="seller-document seller-statement manager-document manager-statement" ref={documentRef}>
    <header className="seller-document__header"><h2>[와이즈벤더 {companyDirect ? '회사 귀속' : '매니저'} 정산서]</h2><p><span>정산 버전</span><strong>v{settlement.settlementVersion}</strong></p></header>
    <table className="seller-document__table seller-document__meta-table"><tbody><tr><th>공구기간</th><td>{formatKoreanDate(campaign?.startDate)} ~ {formatKoreanDate(campaign?.endDate)}</td></tr><tr><th>진행 물품</th><td>{campaign?.productName ?? '-'}</td></tr><tr><th>셀러명</th><td>{campaign?.sellerName ?? '-'}</td></tr><tr><th>사업자명 / 유형</th><td>{managerProfile?.businessName || '사업자명 미등록'} / {businessTypeLabels[managerBusinessType]}</td></tr><tr><th>담당 매니저</th><td>{campaign?.managerName ?? '-'}</td></tr></tbody></table>
    <section className="manager-document__section"><h3>상품별 내부 정산표</h3><p className="manager-product-table-notice">* 본 정산서의 금액은 부가세 포함 금액을 기준으로 합니다. 수수료율은 소수점 이하를 버려 표시합니다.</p><div className="settlement-work-table-wrap"><table className="seller-document__table manager-product-table"><thead><tr><th>상품명</th><th>구분</th><th>판매수량</th><th>공급가</th><th>공구가</th><th>총수수료율</th><th>상품당 수수료</th><th>총 판매 수수료<br />(셀러+벤더)</th><th>비고</th></tr></thead><tbody>{managerProductRows.length ? <>{managerProductRows.map(({ row, totalRate, productAmount, productName, productRowSpan }) => <tr key={row.id}>{productRowSpan > 0 && <td rowSpan={productRowSpan}>{productName}</td>}<td>{row.optionName}</td><td className="amount-cell">{productAmount.quantity.toLocaleString('ko-KR')}</td><td className="amount-cell">{money(productAmount.supplyPrice)}</td><td className="amount-cell">{money(row.unitPrice)}</td><td className="amount-cell">{formatFloorRate(totalRate)}</td><td className="amount-cell">{money(productAmount.unitCommission)}</td><td className="amount-cell">{money(productAmount.salesCommission)}</td><td>{row.validationStatus === 'valid' ? '-' : row.validationMessage}</td></tr>)}<tr className="seller-subtotal-row manager-subtotal-row"><th colSpan={2}>판매 소계</th><td className="amount-cell">{managerProductSubtotal.quantity.toLocaleString('ko-KR')}개</td><td className="amount-cell">{money(managerProductSubtotal.supplyAmount)}</td><td className="amount-cell">{money(managerProductSubtotal.salesAmount)}</td><td></td><td></td><td className="amount-cell">{money(managerProductSubtotal.salesCommission)}</td><td></td></tr></> : <tr><td colSpan={9}>SKU별 판매 데이터가 아직 연결되지 않았습니다.</td></tr>}</tbody></table></div></section>
    <section className="manager-document__section"><h3>정산 계산</h3><table className="seller-document__table manager-calculation-table"><tbody>
      <tr className="manager-calculation-total"><th>총수수료</th><td className="amount-cell">{money(settlement.currentCalculation.grossCommission)}</td></tr>
      <tr className="manager-calculation-deduction"><th>- 셀러 수수료</th><td className="amount-cell">- {money(settlement.currentCalculation.sellerCommissionAmount)}</td></tr>
      {preDistributionCredits.map((item) => <tr key={item.id}><th>+ {item.title}</th><td className="amount-cell">+ {money(item.amount)}</td></tr>)}
      {preDistributionCosts.map((item) => <tr className="manager-calculation-deduction" key={item.id}><th>- {managerCostLabel(item)}{item.title && ` · ${item.title}`}</th><td className="amount-cell">- {money(item.amount)}</td></tr>)}
      {isSrookPayCampaign && <tr className={srookPayAmount && srookPayAmount > 0 ? 'manager-calculation-deduction' : undefined}><th>- 스룩페이 수수료</th><td className="amount-cell">{srookPayAmount === undefined ? '실제 비용 데이터 미연결' : `- ${money(srookPayAmount)}`}</td></tr>}
      {eventDistributionCosts.map((item) => <tr className="manager-calculation-deduction" key={item.id}><th>- 이벤트 비용 · {item.title}</th><td className="amount-cell">- {money(item.amount)}</td></tr>)}
      <tr className="manager-distributable-row"><th>최종 배분 대상 수수료</th><td className="amount-cell">{money(settlement.currentCalculation.distributableVendorCommission)}</td></tr>
    </tbody></table></section>
    {eventCosts.length > 0 && <section className="manager-document__section"><h3>차감·조정 반영 내역</h3><table className="seller-document__table"><thead><tr><th>항목</th><th>부담 주체</th><th>반영 위치</th><th>금액</th></tr></thead><tbody>{eventCosts.map((item) => { const credit = item.applyLocation === 'net_company_commission_credit'; const reimbursement = item.applyLocation === 'manager_reimbursement'; return <tr key={item.id}><td>{item.title}</td><td>{costOwnerLabel[item.costOwner] ?? item.costOwner}</td><td>{reimbursement ? '이벤트 비용 차감 후 배분 · 매니저 선지급액 별도 환급' : credit ? '매니저 배분 전 가산' : item.applyLocation === 'net_company_commission' ? '배분 전 수수료에서 차감' : item.applyLocation === 'manager_payment' ? '매니저 지급액에서 차감' : item.applyLocation === 'seller_payment' ? '셀러 지급액에서 차감' : '기록만 · 정산 차감 없음'}</td><td className="amount-cell">{credit ? `+ ${money(item.amount)}` : item.reflected ? `- ${money(item.amount)}` : money(item.amount)}</td></tr> })}</tbody></table></section>}
    <section className="manager-document__section"><h3>{companyDirect ? '회사 귀속' : '수수료 배분'}</h3><table className="seller-document__table manager-allocation-table"><tbody><tr><th>{companyDirect ? '최종 회사 귀속 대상 수수료' : '최종 배분 대상 수수료'}</th><td className="amount-cell">{money(settlement.currentCalculation.distributableVendorCommission)}</td></tr>{companyDirect ? <tr><th>회사 귀속액</th><td className="amount-cell">{money(settlement.currentCalculation.distributableVendorCommission)}</td></tr> : <><tr><th>매니저 배분율</th><td className="amount-cell">{formatFloorRate(settlement.currentCalculation.managerShareRate)}</td></tr><tr><th>매니저 배분액</th><td className="amount-cell">{money(report.managerBaseShare)}</td></tr></>}</tbody></table></section>
    <section className="manager-document__section"><h3>{companyDirect ? '회사 귀속 확인' : '매니저 최종 지급'}</h3><table className="seller-document__table"><tbody>{companyDirect ? <tr><th>VAT 포함 회사 귀속액</th><td className="amount-cell">{money(finalCompanyAttribution)}</td></tr> : <><tr><th>VAT 포함 매니저 배분금액</th><td className="amount-cell">{money(grossManagerAmount)}</td></tr>{managerBusinessType === 'simplified_business' && <tr><th>- 부가세</th><td className="amount-cell">- {money(managerPayout.vatAmount)}</td></tr>}{managerBusinessType === 'freelancer' && <><tr><th>원천세 신고금액</th><td className="amount-cell">{money(withholdingCalculation.withholdingBaseAmount)}</td></tr><tr><th>소득세 3%</th><td className="amount-cell">- {money(withholdingCalculation.incomeTaxAmount)}</td></tr><tr><th>지방소득세 0.3%</th><td className="amount-cell">- {money(withholdingCalculation.localIncomeTaxAmount)}</td></tr><tr><th>총 원천세</th><td className="amount-cell">- {money(withholdingCalculation.totalWithholdingTaxAmount)}</td></tr></>}{managerBusinessType !== 'freelancer' && report.managerDeductions.map((item) => <tr key={item.id}><th>{managerCostLabel(item)}</th><td className="amount-cell">- {money(item.amount)}</td></tr>)}</>}{!companyDirect && settlement.currentCalculation.managerReimbursementTotal > 0 && <tr><th>+ 선지급 환급액(이벤트 등)</th><td className="amount-cell">+ {money(settlement.currentCalculation.managerReimbursementTotal)}</td></tr>}<tr className="manager-final-row"><th>{companyDirect ? '최종 회사 귀속액' : '최종 매니저 정산금액'}</th><td className="amount-cell"><strong>{money(finalCompanyAttribution)}</strong></td></tr></tbody></table></section>
    {!companyDirect && <section className="manager-document__section manager-payment-account"><h3>지급 계좌</h3><p><strong>{managerProfile?.bankName || '은행명 미등록'} / {managerProfile?.accountNumber || '계좌번호 미등록'} / {managerProfile?.accountHolder || '예금주명 미등록'}</strong></p></section>}
    {exportGeneratedAt && <p className="seller-export-timestamp">이미지 생성: {exportGeneratedAt} (Asia/Seoul)</p>}
  </div></div>
}

function PaymentBlockReasons({ ownerLabel, warnings }: { ownerLabel: string; warnings: PaymentWarningAction[] }) {
  if (!warnings.length) return null
  return <div className="payment-action-blockers"><div className="payment-action-blockers__heading"><strong>{ownerLabel} 지급 요청을 위해 다음 정보가 필요합니다.</strong><span>{warnings.length}개 미완료</span></div><ul>{warnings.map((warning) => <li key={warning.reason}><span>{warning.reason}</span><button className="secondary-button" onClick={warning.action} type="button">{warning.actionLabel}</button></li>)}</ul></div>
}

function PayoutStatusBanner({ notice }: { notice?: PayoutStatusNotice }) {
  if (!notice) return null
  return <div className={`payout-status-banner ${notice.tone ? `is-${notice.tone}` : ''}`}><strong>{notice.tone === 'pending' || notice.tone === 'unconfirmed' ? '!' : '✓'} {notice.title}</strong>{notice.detail && <span>{notice.detail}</span>}</div>
}

function ManagerDocumentActions({ companyDirect, hasRequest, statusNotice, warnings, onAccount, onCopy, onPreview, onRequestPayment, onSave, paymentDisabled }: { companyDirect: boolean; hasRequest: boolean; statusNotice: PayoutStatusNotice; warnings: PaymentWarningAction[]; onAccount: () => void; onCopy: () => void; onPreview: () => void; onRequestPayment: () => void; onSave: () => void; paymentDisabled: boolean }) {
  return <div className="document-action-bar no-print"><div className="action-row seller-document-actions"><button className="secondary-button" onClick={onPreview}>확대 보기</button><button className="secondary-button" onClick={onSave}>PNG 저장</button><button className="primary-button" onClick={onCopy}>이미지 복사</button><button className="secondary-button" onClick={onAccount}>매니저 정보 확인하기</button>{companyDirect && !hasRequest ? <span className="status-badge done">회사 직속 · 매니저 배분·지급 없음</span> : <button className={`${hasRequest ? 'payment-edit-button' : 'primary-button'} document-payment-action`} disabled={paymentDisabled} onClick={onRequestPayment} type="button">{hasRequest ? '매니저 지급요청 수정하기' : '매니저 지급 요청'}</button>}</div><div className={`document-status-region ${statusNotice.tone === 'unconfirmed' ? 'is-unconfirmed' : ''}`}><PayoutStatusBanner notice={statusNotice} /><PaymentBlockReasons ownerLabel="매니저" warnings={warnings} /></div></div>
}

function SellerSettlementDocument({ exportGeneratedAt, rows, sellerDocumentRef, settlement }: { exportGeneratedAt: string; rows: SalesDataRow[]; sellerDocumentRef: RefObject<HTMLDivElement | null>; settlement: Settlement }) {
  const campaign = getCampaign(settlement)
  const sellerProfile = campaign ? sellerMasterService.getSellerById(campaign.sellerId) : undefined
  const salesImport = salesDataService.getSalesDataImportById(settlement.salesDataImportId)
  const vendorSupply = salesImport?.supplyAudience === 'vendor'
  const sellerCollectsPayment = campaignChannel(campaign, salesImport) === 'seller_checkout'
  if (salesImport && (vendorSupply || sellerCollectsPayment)) {
    const report = calculateVendorDocument(rows, salesImport, campaign)
    const vendor = salesImport.settlementVendorName || campaign?.settlementVendorName || '벤더'
    const counterparty = vendorSupply ? vendor : campaign?.sellerName || '셀러'
    const commissionOwner = vendorSupply ? '벤더' : '셀러'
    const vendorPartner = storageService.getItem<SupplierPilotRow[]>('t3-suppliers-v1', []).find(item => item.id === salesImport.settlementVendorId)
    const sellerAdjustment = !vendorSupply && report.receivable ? settlement.currentCalculation.sellerDeductionTotal : 0
    const finalAmount = report.finalAmount === undefined ? undefined : report.finalAmount + sellerAdjustment
    return <div className="seller-document-shell"><div className="seller-document seller-statement vendor-statement" ref={sellerDocumentRef}>
      <header className="seller-document__header"><h2>{sellerCollectsPayment && !vendorSupply ? '셀러 링크 공동구매 입금 정산서' : '공동구매 거래 정산서'}</h2><p>{counterparty} 귀중 · {companySettlementProfile.legalName}</p></header>
      <table className="seller-document__table"><tbody><tr><th>정산 대상</th><td>{counterparty}</td></tr>{vendorSupply && vendorPartner?.legalName && <tr><th>벤더 사업자명</th><td>{vendorPartner.legalName}</td></tr>}{vendorSupply && vendorPartner?.businessNumber && <tr><th>벤더 사업자등록번호</th><td>{vendorPartner.businessNumber}</td></tr>}{!vendorSupply && sellerProfile?.businessName && <tr><th>셀러 사업자명</th><td>{sellerProfile.businessName}</td></tr>}<tr><th>판매 셀러</th><td>{campaign?.sellerName}</td></tr><tr><th>진행 상품</th><td>{campaign?.productName}</td></tr><tr><th>판매 기간</th><td>{salesImport.salesStartDate ?? campaign?.startDate} ~ {salesImport.salesEndDate ?? campaign?.endDate}</td></tr><tr><th>정산 방향</th><td>{report.receivable ? `${counterparty} → 와이즈벤더 · 물품대금 및 배송비 입금` : report.channel ? `와이즈벤더 → ${counterparty} · 수수료 지급` : '판매대금 수령 주체 확인 필요'}</td></tr></tbody></table>
      <table className="seller-document__table"><thead><tr><th>품목</th><th>판매가</th><th>공급가</th><th>수량</th><th>{commissionOwner} 수수료율</th><th>{report.receivable ? '물품대금' : '수수료'}</th></tr></thead><tbody>{report.items.map(({row,quantity,rate,commission,supplyAmount}) => <tr key={row.id}><td>{row.optionName}</td><td>{money(row.unitPrice)}</td><td>{commission === undefined ? '조건 확인 필요' : money(row.unitPrice - Math.round(row.unitPrice * rate! / 100))}</td><td>{quantity}</td><td>{commission === undefined ? '조건 확인 필요' : `${Number(rate!.toFixed(2))}%`}</td><td>{commission === undefined ? '조건 확인 필요' : money(report.receivable ? supplyAmount! : commission)}</td></tr>)}</tbody>{report.receivable && <tfoot><tr className="seller-subtotal-row"><th colSpan={5}>물품대금 합계 (A)</th><td className="amount-cell">{report.supplyTotal === undefined ? '조건 확인 필요' : money(report.supplyTotal)}</td></tr></tfoot>}</table>
      {report.receivable && <section className="seller-document__section"><h3>배송비 명세 (VAT 포함)</h3><table className="seller-document__table"><thead><tr><th>구분</th><th>건수</th><th>단가</th><th>금액</th></tr></thead><tbody>{salesImport.shippingDetails?.length ? salesImport.shippingDetails.map((item, index) => <tr key={index}><td>{item.label}</td><td>{item.quantity}건</td><td className="amount-cell">{money(item.unitPrice)}</td><td className="amount-cell">{money(item.quantity * item.unitPrice)}</td></tr>) : <tr><td colSpan={3}>배송비 (상세 내역 미등록)</td><td>{report.shipping === undefined ? '확인 필요' : money(report.shipping)}</td></tr>}<tr><th colSpan={3}>배송비 합계 (B)</th><td className="amount-cell">{report.shipping === undefined ? '확인 필요' : money(report.shipping)}</td></tr></tbody></table></section>}
      <h3>정산금액 (VAT 포함)</h3>
      <table className="seller-document__table"><tbody>
        <tr><th>상품 판매금액</th><td>{money(report.salesTotal)}</td></tr>
        <tr><th>{report.receivable ? `− ${commissionOwner} 측 보유 수수료` : `${commissionOwner} 수수료`}</th><td>{report.commissionTotal === undefined ? '조건 확인 필요' : `${report.receivable ? '− ' : ''}${money(report.commissionTotal)}`}</td></tr>
        {report.receivable && <><tr><th>물품대금 합계 (A)</th><td>{report.supplyTotal === undefined ? '조건 확인 필요' : money(report.supplyTotal)}</td></tr><tr><th>배송비 합계 (B · 도서산간 포함)</th><td>{report.shipping === undefined ? '배송비 확인 필요' : money(report.shipping)}</td></tr></>}
        {sellerAdjustment > 0 && <tr><th>+ 셀러 부담 차감·조정</th><td>+ {money(sellerAdjustment)}</td></tr>}
        <tr className="manager-final-row"><th>{report.receivable ? `최종 입금 요청액 (A+B${sellerAdjustment > 0 ? '+조정' : ''})` : `${commissionOwner} 수수료 지급액`}</th><td><strong>{finalAmount === undefined ? '조건 확인 필요' : money(finalAmount)}</strong></td></tr>
      </tbody></table>
      {!report.receivable && <p>품목별 합의 수수료 기준</p>}
      {report.receivable && report.shipping === undefined && <p>판매 데이터에서 실제 수령 배송비를 입력해주세요. 무료배송인 경우 0원을 입력합니다.</p>}
      <section className="seller-document__section"><h3>공급 회사 및 입금 안내</h3><table className="seller-document__table"><tbody><tr><th>회사명</th><td>{companySettlementProfile.legalName}</td><th>대표자</th><td>{companySettlementProfile.representativeName}</td></tr><tr><th>사업자등록번호</th><td colSpan={3}>{companySettlementProfile.businessRegistrationNumber}</td></tr><tr><th>주소</th><td colSpan={3}>{companySettlementProfile.businessAddress}</td></tr><tr><th>정산 문의</th><td colSpan={3}>{companySettlementProfile.taxInvoiceEmail}</td></tr><tr><th>입금 계좌</th><td colSpan={3}>{companySettlementProfile.settlementBankName} {companySettlementProfile.settlementBankAccount}<br />예금주: {companySettlementProfile.settlementAccountHolder}</td></tr></tbody></table></section>
      {exportGeneratedAt && <p className="seller-export-timestamp">이미지 생성: {exportGeneratedAt}</p>}
    </div></div>
  }

  const deductions = settlementService.getDeductionsBySettlementId(settlement.id)
  const sellerRule = sellerSettlementService.getSellerSettlementRule(settlement.campaignId)
  const sellerBusinessType = normalizeSellerBusinessType(sellerProfile?.businessType ?? sellerRule?.businessType)
  const sellerDeductions = settlement.currentCalculation.sellerDeductionTotal
  const costRows = getSellerCostRows(campaign, deductions)
  const displayCostRows = costRows.filter((item) => item.amount !== undefined && item.amount > 0)
  const additionalPayments = costRows.filter((item) => item.direction === 'payment' && item.amount !== undefined).reduce((sum, item) => sum + item.amount!, 0)
  const sellerRate = settlement.currentCalculation.sellerCommissionRate
  const productSubtotal = calculateSellerProductSubtotal(rows, sellerRate)
  const sellerDocumentPayout = (businessType: SellerBusinessType) => {
    const calculation = calculateFinalSellerPayment(productSubtotal.commissionAmount, businessType, sellerDeductions)
    return { ...calculation, finalSellerPaymentAmount: calculation.finalSellerPaymentAmount + additionalPayments }
  }
  const businessAmounts = [
    { type: 'general_business', label: '법인/개인사업자', evidence: '세금계산서 발행금액', ...sellerDocumentPayout('general_business') },
    { type: 'simplified_business', label: '간이사업자', evidence: '현금영수증 발행금액', ...sellerDocumentPayout('simplified_business') },
    { type: 'freelancer', label: '개인 프리랜서', evidence: '3.3% 원천세 공제 후 입금액', ...sellerDocumentPayout('freelancer') },
  ] as const
  const statementDate = formatKoreanDocumentDate(settlement.createdAt)
  const schedule = getSellerSettlementSchedule(settlement.createdAt)
  const evidenceDeadline = formatKoreanDocumentDate(schedule.evidenceDeadline)
  const calculatedPaymentDate = formatKoreanDocumentDate(schedule.paymentDate)
  const currentBusinessAmount = businessAmounts.find((item) => item.type === sellerBusinessType)
  const sellerBusinessLabel = currentBusinessAmount?.label ?? '사업자 유형 등록 정보 없음'
  const settlementAmount = businessAmounts[0].finalSellerPaymentAmount
  const commissionIssueByRow = new Map((salesImport?.commissionSyncIssues ?? []).map((issue) => [issue.rowId, issue]))

  return (
    <div className="seller-document-shell">
      <div className="seller-document seller-statement" ref={sellerDocumentRef}>
        <header className="seller-document__header">
          <h2>[{companySettlementProfile.statementBrandName} 공동구매 정산서]</h2>
          <p><span>정산서 작성일</span><strong>{statementDate}</strong></p>
        </header>

        <table className="seller-document__table seller-document__meta-table"><tbody>
          <tr><th>공구기간</th><td>{formatKoreanDate(salesImport?.salesStartDate ?? campaign?.startDate)} ~ {formatKoreanDate(salesImport?.salesEndDate ?? campaign?.endDate)}</td></tr>
          <tr><th>진행 물품</th><td>{campaign?.productName ?? '-'}</td></tr>
          <tr><th>셀러명</th><td>{campaign?.sellerName ?? '-'}</td></tr>
          <tr><th>사업자명 / 유형</th><td>{sellerProfile?.businessName || '사업자명 미등록'} / {sellerBusinessLabel}</td></tr>
          <tr><th>담당 매니저</th><td>{campaign?.managerName ?? '데이터 미연결'}</td></tr>
        </tbody></table>

        <section className="seller-document__section seller-document__products"><h3>1. 상품 정산표</h3><p className="seller-document__vat-notice">* 본 정산서의 금액은 부가세 포함 금액을 기준으로 합니다.</p>
        <table className="seller-document__table">
          <thead><tr><th>상품명</th><th>구분</th><th>판매수량</th><th>셀러 공급가</th><th>공구가</th><th>매출액</th><th>수수료율</th><th>수수료</th><th>비고</th></tr></thead>
          <tbody>
            {rows.length ? groupStatementRows(rows, campaign?.productName ?? '-', new Set(commissionIssueByRow.keys())).map(({ row, sourceRows, productName, productRowSpan }) => {
              const productAmount = { ...calculateSellerProductRow(row, sellerRate), ...calculateSellerProductSubtotal(sourceRows, sellerRate) }
              const commissionIssue = commissionIssueByRow.get(row.id)
              return <tr key={row.id}>
                <>{productRowSpan > 0 && <td rowSpan={productRowSpan}>{productName}</td>}</>
                <td>{row.optionName}</td>
                <td className="amount-cell">{productAmount.quantity.toLocaleString('ko-KR')}</td>
                <td className="amount-cell">{commissionIssue ? '확인 필요' : money(productAmount.supplyPrice)}</td>
                <td className="amount-cell">{money(row.unitPrice)}</td>
                <td className="amount-cell">{money(productAmount.salesAmount)}</td>
                <td className="amount-cell">{commissionIssue ? '확인 필요' : formatRate(Number(row.sellerCommissionRate ?? sellerRate))}</td>
                <td className="amount-cell">{commissionIssue ? '확인 필요' : money(productAmount.commissionAmount)}</td>
                <td>{commissionIssue?.message ?? (row.validationStatus === 'valid' ? '' : row.validationMessage)}</td>
              </tr>
            }) : <tr><td colSpan={9}>SKU별 판매 데이터가 아직 연결되지 않았습니다.</td></tr>}
          </tbody>
          <tfoot><tr className="seller-subtotal-row"><th colSpan={2}>판매 소계</th><td className="amount-cell">{productSubtotal.quantity.toLocaleString('ko-KR')}개</td><td className="amount-cell">{money(productSubtotal.supplyTotal)}</td><td></td><td className="amount-cell">{money(productSubtotal.salesAmount)}</td><td></td><td className="amount-cell">{money(productSubtotal.commissionAmount)}</td><td></td></tr></tfoot>
        </table></section>

        <SellerAdditionalCosts rows={displayCostRows} />

        <section className="seller-document__section seller-document__totals seller-compact-settlement"><h3>2. 정산금액</h3><table className="seller-document__table"><tbody>
          <tr><th>총 판매수량</th><td className="amount-cell">{productSubtotal.quantity.toLocaleString('ko-KR')}개</td><th>총매출</th><td className="amount-cell">{money(productSubtotal.salesAmount)}</td></tr>
          <tr><th>셀러 수수료</th><td className="amount-cell">{money(productSubtotal.commissionAmount)}</td>{sellerDeductions > 0 ? <><th>추가 차감</th><td className="amount-cell seller-cost-deduction-cell">- {money(sellerDeductions)}</td></> : <><th>추가 지급</th><td className="amount-cell seller-positive-amount">{additionalPayments ? `+ ${money(additionalPayments)}` : '-'}</td></>}</tr>
          {sellerDeductions > 0 && additionalPayments > 0 && <tr><th>추가 지급</th><td className="amount-cell seller-positive-amount">+ {money(additionalPayments)}</td><td colSpan={2}></td></tr>}
          <tr className="seller-summary-total"><th colSpan={3}>정산금액 <small>(부가세 포함)</small></th><td className="amount-cell">{money(settlementAmount)}</td></tr>
        </tbody></table></section>

        <section className="seller-document__section seller-document__tax seller-business-payment"><h3>3. 사업자 유형별 최종 입금액</h3><table className="seller-document__table"><thead><tr><th>구분</th><th>증빙 / 지급 기준</th><th>최종 입금액</th><th>적용</th></tr></thead><tbody>
          {businessAmounts.map((item) => <tr className={`seller-business-payment__${item.type} ${item.type === sellerBusinessType ? 'is-current' : ''}`} key={item.type}><td>{item.label}</td><td>{item.evidence}</td><td className="amount-cell">{money(item.finalSellerPaymentAmount)}</td><td>{item.type === sellerBusinessType ? '현재 적용' : '참고'}</td></tr>)}
        </tbody></table>{!currentBusinessAmount && <p className="seller-business-unregistered">현재 셀러 사업자 유형: 등록 정보 없음</p>}</section>

        <section className="seller-document__section seller-document__schedule seller-compact-schedule"><h3>4. 증빙 및 입금일정</h3><div className="seller-compact-schedule__dates"><p><span>지급 계좌</span><strong>{sellerProfile?.bankName?.trim() && sellerProfile.accountNumber?.trim() && sellerProfile.accountHolder?.trim() ? `${sellerProfile.bankName} ${sellerProfile.accountNumber} / ${sellerProfile.accountHolder}` : '지급계좌 미등록'}</strong></p><p><span>증빙 마감</span><strong>{evidenceDeadline}</strong></p><p className="seller-payment-date"><span>입금 예정</span><strong>{calculatedPaymentDate}</strong></p></div><p className="seller-compact-schedule__notice">금요일까지 필요한 증빙자료 전달 및 발행이 완료된 경우 기재된 입금 예정일에 입금됩니다. 입금 예정일이 휴일인 경우 다음 영업일에 지급됩니다.</p></section>

        <footer className="seller-document__section seller-document__footer">
          <h3>5. 회사정보 / 정산안내</h3>
          <table className="seller-document__table seller-company-table"><tbody><tr><th>회사명</th><td>{companySettlementProfile.legalName}</td><th>대표자</th><td>{companySettlementProfile.representativeName}</td></tr><tr><th>사업자등록번호</th><td>{companySettlementProfile.businessRegistrationNumber}</td><th>업태 / 종목</th><td>{companySettlementProfile.businessType} / {companySettlementProfile.businessItem}</td></tr><tr><th>주소</th><td colSpan={3}>{companySettlementProfile.businessAddress}</td></tr><tr><th>세금계산서 발행 메일</th><td colSpan={3}><a href={`mailto:${companySettlementProfile.taxInvoiceEmail}`}>{companySettlementProfile.taxInvoiceEmail}</a></td></tr><tr><th>회사 정산 계좌</th><td colSpan={3}>{companySettlementProfile.settlementBankName} {companySettlementProfile.settlementBankAccount} · 예금주 {companySettlementProfile.settlementAccountHolder}</td></tr></tbody></table>
          {exportGeneratedAt && <p className="seller-export-timestamp">이미지 생성: {exportGeneratedAt} (Asia/Seoul)</p>}
        </footer>
      </div>
    </div>
  )
}

function SettlementDocumentActions({ receivableDocument = false, vendorDocument = false, hasRequest, statusNotice, warnings, onCopyImage, onCopyImageAndMessage, onCopyMessage, onInfo, onPreview, onRequestPayment, onSaveImage, paymentDisabled }: { receivableDocument?: boolean; vendorDocument?: boolean; hasRequest: boolean; statusNotice: PayoutStatusNotice; warnings: PaymentWarningAction[]; onCopyImage: () => void; onCopyImageAndMessage: () => void; onCopyMessage: () => void; onInfo: () => void; onPreview: () => void; onRequestPayment: () => void; onSaveImage: () => void; paymentDisabled: boolean }) {
  return (
    <div className="document-action-bar no-print">
      <div className="action-row seller-document-actions"><button className="secondary-button" onClick={onPreview} type="button">확대 보기</button><button className="secondary-button" onClick={onSaveImage} type="button">PNG 저장</button><button className="primary-button" onClick={onCopyImage} type="button">이미지 복사</button><button className="primary-button" onClick={onCopyImageAndMessage} type="button">이미지 + 문구 복사</button><button className="secondary-button" onClick={onCopyMessage} type="button">전달 문구 복사</button><button className="secondary-button" onClick={onInfo} type="button">{vendorDocument ? '벤더 정보 등록·수정' : '셀러 정보 확인하기'}</button>{!receivableDocument && (!vendorDocument || hasRequest) && <button className={`${hasRequest ? 'payment-edit-button' : 'primary-button'} document-payment-action`} disabled={paymentDisabled} onClick={onRequestPayment} type="button">{hasRequest ? '셀러 지급요청 수정하기' : '셀러 지급 요청'}</button>}</div>
      <div className={`document-status-region ${statusNotice.tone === 'unconfirmed' ? 'is-unconfirmed' : ''}`}><PayoutStatusBanner notice={statusNotice} /><PaymentBlockReasons ownerLabel="셀러" warnings={vendorDocument || receivableDocument ? [] : warnings} /></div>
    </div>
  )
}

function HistoryContent({ logs, settlement }: { logs: ReturnType<typeof settlementService.getActivityLogsBySettlementId>; settlement: Settlement }) {
  return (
    <div className="preview-text-list">
      {settlement.calculationSteps.map((step) => <p key={step.id}>계산 · {step.order}. {step.label}: {typeof step.result === 'number' ? money(step.result) : step.result}</p>)}
      {logs.map((log) => <p key={log.id}>{formatKoreanDateTime(log.at)} · {actionLabels[log.action]} · {log.previousStatus ? statusLabel(log.previousStatus) : '-'} → {log.nextStatus ? statusLabel(log.nextStatus) : '-'} · v{log.version}</p>)}
    </div>
  )
}

function PaymentRequestStatusModal({ accountConfirmed, campaign, completed, onClose, ownerType, request, settlement }: {
  accountConfirmed: boolean
  campaign: NonNullable<ReturnType<typeof getCampaign>>
  completed: boolean
  onClose: () => void
  ownerType: EvidenceOwnerType
  request: ReturnType<typeof paymentRequestService.getPaymentRequestForRecipient>
  settlement: Settlement
}) {
  const isSeller = ownerType === 'seller'
  const ownerName = isSeller ? campaign.sellerName : campaign.managerName
  const ownerId = isSeller ? campaign.sellerId : campaign.managerId
  const businessType = request?.businessType ?? (isSeller ? sellerSettlementService.getSellerSettlementRule(settlement.campaignId)?.businessType : managerPaymentService.getBusinessType(campaign.managerName, campaign.managerId)) ?? 'general_business'
  const evidenceName = businessType === 'freelancer' ? '원천세 리스트' : businessType === 'simplified_business' ? '현금영수증' : '세금계산서'
  const evidence = paymentEvidenceService.getEvidenceBySettlementId(settlement.id, ownerType)
  const withholding = withholdingTaxService.getBySettlementOwner(settlement.id, ownerType, ownerId).find((item) => item.sourceVersion === settlement.settlementVersion)
  const evidenceComplete = businessType === 'freelancer' ? Boolean(withholding) : evidence.some((item) => item.reviewStatus === 'approved')
  const status = completed ? '지급 완료' : request ? paymentStatusLabels[request.status] : '지급 요청 내역 없음'
  const approval = completed || request?.status === 'payment_completed' || request?.status === 'remittance_confirmed' || request?.status === 'approved' ? '승인 완료' : request?.status === 'rejected' ? '반려' : '대기'

  return <div className="settlement-modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}><section aria-modal="true" className="settlement-modal payment-request-modal" role="dialog">
    <div className="preview-drawer__header"><div><p className="page-eyebrow">Payment Request Status</p><h2>{isSeller ? '셀러' : '매니저'} 지급 요청 상태</h2></div><button aria-label="닫기" className="icon-button" onClick={onClose} type="button">×</button></div>
    <table className="payment-request-summary-table"><tbody>
      <tr><th>지급 대상</th><td>{ownerName}</td></tr>
      <tr><th>정산금액</th><td className="amount-cell">{money(request?.grossSettlementAmount ?? (isSeller ? settlement.currentCalculation.sellerCommissionAmount : settlement.currentCalculation.managerAmount))}</td></tr>
      <tr><th>최종 입금액</th><td className="amount-cell">{money(request?.finalPaymentAmount ?? withholding?.finalPaymentAmount ?? (isSeller ? settlement.currentCalculation.finalSellerPaymentAmount : settlement.currentCalculation.managerAmount))}</td></tr>
      <tr><th>지급 요청일</th><td>{request?.requestedAt ? formatKoreanDateTimeCommon(request.requestedAt) : '-'}</td></tr>
      <tr><th>현재 상태</th><td><strong>{status}</strong></td></tr>
      <tr><th>필요 증빙</th><td>{evidenceName}</td></tr>
      <tr><th>증빙 상태</th><td>{evidenceComplete ? '완료' : '미완료'}</td></tr>
      <tr><th>계좌 상태</th><td>{accountConfirmed ? '확인 완료' : '미등록'}</td></tr>
      <tr><th>대표 승인</th><td>{approval}</td></tr>
    </tbody></table>
    <p className={request?.status === 'rejected' ? 'payment-request-error' : 'settlement-readiness-modal__success'}>{request?.status === 'rejected' ? '지급 요청이 반려되었습니다. 증빙과 요청 내용을 수정한 뒤 다시 요청해주세요.' : '현재 추가로 처리할 작업이 없습니다.'}</p>
    <div className="modal-actions"><button className="primary-button" onClick={onClose} type="button">확인</button></div>
  </section></div>
}

function PaymentRequestEvidenceModal({ actorProfile, campaign, existingRequest, managerBusinessType, onCanceled, onClose, onFailed, onRequested, ownerType, sellerBusinessType, settlement }: {
  actorProfile: CompanyProfile
  campaign: NonNullable<ReturnType<typeof getCampaign>>
  existingRequest?: PaymentRequest
  managerBusinessType: SellerBusinessType
  onCanceled: () => void
  onClose: () => void
  onFailed: (message: string) => void
  onRequested: (message: string) => void
  ownerType: EvidenceOwnerType
  sellerBusinessType: SellerBusinessType
  settlement: Settlement
}) {
  const [file, setFile] = useState<File | null>(null)
  const [reportedIssuedWithoutCapture, setReportedIssuedWithoutCapture] = useState(existingRequest?.documentCheckStatus === 'reported_issued' && !existingRequest.taxInvoiceFinalConfirmed)
  const [memo, setMemo] = useState(existingRequest?.memo ?? '')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [cancelConfirmOpen, setCancelConfirmOpen] = useState(false)
  const [cancellationReason, setCancellationReason] = useState('')
  const [previewUrl, setPreviewUrl] = useState('')
  const [paymentAccountDraft, setPaymentAccountDraft] = useState(() => {
    const profile = ownerType === 'seller' ? sellerMasterService.getSellerById(campaign.sellerId) : managerPaymentService.getProfile(campaign.managerId)
    return { bankName: profile?.bankName ?? '', accountNumber: profile?.accountNumber ?? '', accountHolder: profile?.accountHolder ?? '' }
  })
  const previewUrlRef = useRef('')
  const isSeller = ownerType === 'seller'
  const businessType = isSeller ? sellerBusinessType : managerBusinessType
  const ownerId = isSeller ? campaign.sellerId : campaign.managerId
  const ownerName = isSeller ? campaign.sellerName : campaign.managerName
  const actorName = actorProfile.display_name
  const actorIsPrivileged = actorProfile.role === 'ceo' || actorProfile.role === 'admin' || actorProfile.role === 'settlement_cs'
  const actorIsAssignedManager = actorProfile.role === 'manager' && (
    actorProfile.id === campaign.managerId
    || actorProfile.display_name.normalize('NFKC').replace(/\s+/g, '').toLowerCase() === campaign.managerName.normalize('NFKC').replace(/\s+/g, '').toLowerCase()
  )
  const uploadAuthorized = actorIsPrivileged || (!isSeller && actorIsAssignedManager)
  const evidenceType = paymentEvidenceService.getRecommendedEvidenceType(businessType) ?? 'withholding_entry'
  const evidenceName = evidenceType === 'tax_invoice' ? '세금계산서' : evidenceType === 'cash_receipt' ? '현금영수증' : '원천세 리스트'
  const withholding = withholdingTaxService.getBySettlementOwner(settlement.id, ownerType, ownerId).find((item) => item.sourceVersion === settlement.settlementVersion)
  const isFreelancer = businessType === 'freelancer'
  const freelancerGrossAmount = isSeller
    ? settlement.currentCalculation.sellerCommissionAmount
    : settlement.currentCalculation.managerBaseShareAmount
  const freelancerDeductions = isSeller ? settlement.currentCalculation.sellerDeductionTotal : settlement.currentCalculation.managerDeductionTotal
  const withholdingCalculation = withholding ?? calculateWithholding(freelancerGrossAmount, freelancerDeductions)
  const sellerPaymentAmount = (() => {
    if (!isSeller) return 0
    try { return sellerSettlementService.createSellerDocument(settlement.id, false).calculation.finalSellerPaymentAmount }
    catch { return settlement.currentCalculation.finalSellerPaymentAmount }
  })()
  const managerPaymentAmount = calculateManagerPayoutBreakdown(
    settlement.currentCalculation.managerBaseShareAmount,
    managerBusinessType,
    settlement.currentCalculation.managerDeductionTotal,
    settlement.currentCalculation.managerReimbursementTotal,
  ).finalPaymentAmount
  const amount = isFreelancer
    ? withholdingCalculation.finalPaymentAmount + (isSeller ? 0 : settlement.currentCalculation.managerReimbursementTotal)
    : isSeller ? sellerPaymentAmount : managerPaymentAmount
  const accountConfirmed = Boolean(paymentAccountDraft.bankName.trim() && paymentAccountDraft.accountNumber.trim() && paymentAccountDraft.accountHolder.trim())
  const cancellationAllowed = Boolean(existingRequest && paymentRequestService.canCancelPaymentRequest(existingRequest))
  useEffect(() => () => { if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current) }, [])

  const selectEvidenceFile = (nextFile?: File | null) => {
    if (!nextFile) return
    if (!evidenceAllowedTypes.has(nextFile.type)) { setError('PNG, JPEG, WebP 또는 PDF 파일만 첨부할 수 있습니다.'); return }
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current)
    const nextPreviewUrl = evidenceImageTypes.has(nextFile.type) ? URL.createObjectURL(nextFile) : ''
    previewUrlRef.current = nextPreviewUrl
    setPreviewUrl(nextPreviewUrl)
    setError('')
    setReportedIssuedWithoutCapture(false)
    setFile(nextFile)
  }

  const clearEvidenceFile = () => {
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current)
    previewUrlRef.current = ''
    setPreviewUrl('')
    setFile(null)
  }

  const pasteEvidence = (event: ClipboardEvent<HTMLElement>) => {
    const image = Array.from(event.clipboardData.files).find((item) => evidenceImageTypes.has(item.type))
    if (!image) return
    event.preventDefault()
    const extension = image.type === 'image/jpeg' ? 'jpg' : image.type.split('/')[1]
    selectEvidenceFile(new File([image], `pasted-evidence-${Date.now()}.${extension}`, { type: image.type }))
  }

  const submit = async () => {
    setSubmitting(true)
    setError('')
    try {
      if (!isSeller && isCompanyDirectManager(campaign.managerId, campaign.managerName)) throw new Error('대표 직속 공구는 매니저 지급신청 대상이 아닙니다. 정산서에서 회사 귀속 금액만 확인해주세요.')
      if (!uploadAuthorized) throw new Error(isSeller ? '셀러 증빙은 대표·정산 담당자만 등록할 수 있습니다.' : '본인이 담당한 공동구매 정산 건에만 증빙을 등록할 수 있습니다.')
      const missingAccountFields = [
        !paymentAccountDraft.bankName.trim() && '은행이 등록되지 않았습니다.',
        !paymentAccountDraft.accountNumber.trim() && '계좌번호가 등록되지 않았습니다.',
        !paymentAccountDraft.accountHolder.trim() && '예금주가 등록되지 않았습니다.',
      ].filter(Boolean)
      if (missingAccountFields.length) throw new Error(missingAccountFields.join('\n'))
      if (isFreelancer && (!Number.isFinite(withholdingCalculation.finalPaymentAmount) || withholdingCalculation.finalPaymentAmount <= 0)) throw new Error('원천세 계산을 확인해주세요.')
      if (!existingRequest && !isFreelancer && !file && !reportedIssuedWithoutCapture) throw new Error(`${evidenceName} 파일을 첨부하거나 예외 사유를 선택해주세요.`)
      let allowEvidencePending = false
      if (file) {
        const evidenceId = `evidence-${crypto.randomUUID()}`
        const stored = await paymentEvidenceStorageService.uploadEvidenceFile(file, { campaignId: campaign.id, settlementId: settlement.id, ownerType, ownerId, evidenceId })
        const evidence = paymentEvidenceService.uploadEvidenceMetadata({
          id: evidenceId, campaignId: campaign.id, settlementId: settlement.id, ownerType, ownerId, ownerName, businessType, evidenceType,
          fileName: file.name, fileType: file.type, fileSize: file.size, previewUrl: stored.previewUrl, storageBucket: stored.bucket,
          storagePath: stored.path, uploadedBy: actorName, memo: memo.trim() || '정산 상세 지급 요청 업로드',
        })
        await paymentEvidenceService.saveEvidenceToProvider(evidence)
        paymentEvidenceService.requestEvidenceReview(evidence.id)
        allowEvidencePending = true
      }
      if (reportedIssuedWithoutCapture) allowEvidencePending = true
      if (isSeller) {
        const currentProfile = sellerMasterService.getSellerById(campaign.sellerId)
        sellerMasterService.saveSellerProfile({ id: campaign.sellerId, name: campaign.sellerName, businessName: currentProfile?.businessName, realName: currentProfile?.realName, businessType: currentProfile?.businessType, defaultMdId: campaign.mdId, defaultManagerId: campaign.managerId, ...paymentAccountDraft })
      } else {
        const currentProfile = managerPaymentService.getProfile(campaign.managerId)
        managerPaymentService.saveProfile({ id: campaign.managerId, name: campaign.managerName, businessName: currentProfile?.businessName, realName: currentProfile?.realName, businessType: currentProfile?.businessType ?? businessType, taxRegistrationNumber: currentProfile?.taxRegistrationNumber, ...paymentAccountDraft })
      }
      if (existingRequest) {
        paymentRequestService.updatePaymentRequest(existingRequest.id, { memo: memo.trim(), accountConfirmed: true, evidenceStatus: file || reportedIssuedWithoutCapture ? 'pending' : existingRequest.evidenceStatus })
        if (file) paymentEvidenceService.linkToPaymentRequest(settlement.id, ownerType, existingRequest.id)
        if (reportedIssuedWithoutCapture) {
          paymentRequestService.updateDocumentCheck(existingRequest.id, 'reported_issued', '발급했다고 전달받았으나 캡처본 미수령', actorName)
          if (existingRequest.status === 'evidence_pending' || existingRequest.status === 'request_ready') paymentRequestService.requestApproval(existingRequest.id)
        }
        onRequested('지급요청이 수정되었습니다.')
      } else {
        if (isSeller) paymentRequestService.createPaymentRequest(settlement.id, actorName, { allowEvidencePending, reportedIssuedWithoutCapture, memo, accountConfirmed, ...paymentAccountDraft })
        else paymentRequestService.createManagerPaymentRequest(settlement.id, actorName, businessType, undefined, { allowEvidencePending, reportedIssuedWithoutCapture, memo, accountConfirmed, bankNameSnapshot: paymentAccountDraft.bankName, accountNumberSnapshot: paymentAccountDraft.accountNumber, accountHolderSnapshot: paymentAccountDraft.accountHolder })
        onRequested('지급요청이 완료되었습니다.')
      }
    } catch (submitError) {
      const message = submitError instanceof Error ? submitError.message : '지급 요청을 저장하지 못했습니다.'
      setError(message)
      onFailed(message)
    } finally {
      setSubmitting(false)
    }
  }

  const cancelRequest = () => {
    if (!existingRequest) return
    setError('')
    try {
      paymentRequestService.cancelPaymentRequest(existingRequest.id, cancellationReason, actorName)
      setCancelConfirmOpen(false)
      onCanceled()
    } catch (cancelError) {
      const message = cancelError instanceof Error ? cancelError.message : '지급요청을 취소하지 못했습니다.'
      setError(message)
      onFailed(message)
    }
  }

  return <div className="settlement-modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
    <section aria-labelledby="payment-request-modal-title" aria-modal="true" className="settlement-modal payment-request-modal" role="dialog">
      <div className="preview-drawer__header"><div><p className="page-eyebrow">Payment Request</p><h2 id="payment-request-modal-title">{existingRequest ? `${isSeller ? '셀러' : '매니저'} 지급요청 수정` : isFreelancer ? '원천세 등록 및 지급 신청' : `${isSeller ? '셀러' : '매니저'} 지급 요청`}</h2></div><button aria-label="닫기" className="icon-button" onClick={onClose} type="button">×</button></div>
      {!existingRequest && isFreelancer && <><p>해당 {isSeller ? '셀러' : '매니저'}는 개인 프리랜서입니다.</p><p>지급 신청 시 원천세 리스트에 자동으로 등록됩니다.</p></>}
      <table className="payment-request-summary-table"><tbody><tr><th>{isSeller ? '셀러명' : '매니저명'}</th><td>{ownerName}</td></tr>{!isFreelancer && <tr><th>지급 예정 금액</th><td className="amount-cell">{money(amount)}</td></tr>}<tr><th>사업자 유형</th><td>{businessTypeLabels[businessType]}</td></tr>{!isFreelancer && <tr><th>필요한 증빙 유형</th><td>{evidenceName}</td></tr>}{isFreelancer && <><tr><th>원천세 신고금액</th><td className="amount-cell">{money(withholdingCalculation.withholdingBaseAmount)}</td></tr><tr><th>소득세</th><td className="amount-cell">- {money(withholdingCalculation.incomeTaxAmount)}</td></tr><tr><th>지방소득세</th><td className="amount-cell">- {money(withholdingCalculation.localIncomeTaxAmount)}</td></tr><tr><th>{isSeller ? '최종 입금액' : '최종 지급액'}</th><td className="amount-cell"><strong>{money(amount)}</strong></td></tr></>}</tbody></table>
      <fieldset className="payment-account-fields"><legend>지급계좌</legend><label className="form-field"><span>은행명</span><input onChange={(event) => setPaymentAccountDraft((value) => ({ ...value, bankName: event.target.value }))} value={paymentAccountDraft.bankName} /></label><label className="form-field"><span>계좌번호</span><input inputMode="text" placeholder="예: 110-123-456789" onChange={(event) => setPaymentAccountDraft((value) => ({ ...value, accountNumber: sanitizeAccountNumberInput(event.target.value) }))} value={paymentAccountDraft.accountNumber} /></label><label className="form-field"><span>예금주명</span><input onChange={(event) => setPaymentAccountDraft((value) => ({ ...value, accountHolder: event.target.value }))} value={paymentAccountDraft.accountHolder} /></label></fieldset>
      {!existingRequest && isFreelancer ? <p className="withholding-confirmation">지급 신청하시겠습니까?</p> : <div className="payment-request-field"><span>{existingRequest ? '증빙자료 교체 (선택)' : '증빙자료 업로드'}</span><div className="payment-evidence-dropzone" onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); selectEvidenceFile(event.dataTransfer.files[0]) }} onPaste={pasteEvidence} tabIndex={0}><label><input accept="image/png,image/jpeg,image/webp,application/pdf" onChange={(event) => selectEvidenceFile(event.target.files?.[0])} type="file" /><strong>파일 선택</strong></label><p>파일을 끌어놓거나 이미지를 여기에 붙여넣으세요.</p><small>Ctrl+V / Cmd+V · PNG, JPEG, WebP 또는 PDF · 최대 10MB</small></div>{file && <div className="payment-evidence-preview">{previewUrl ? <img alt="첨부 이미지 미리보기" src={previewUrl} /> : <span>{file.name}</span>}<button className="text-button" onClick={clearEvidenceFile} type="button">삭제</button></div>}</div>}
      {!isFreelancer && <label className="checklist-item payment-evidence-exception"><input checked={reportedIssuedWithoutCapture} onChange={(event) => { const checked = event.target.checked; if (checked) clearEvidenceFile(); setReportedIssuedWithoutCapture(checked) }} type="checkbox" /><span><strong>발급했다고 전달받았으나 캡처본을 받지 못함</strong><small>예외적으로 지급요청을 생성하고, 증빙 캡처본 추후 확인 대상으로 남깁니다.</small></span></label>}
      <label className="payment-request-field"><span>메모</span><ReasonInput autoFocus={false} onChange={(event) => setMemo(event.target.value)} placeholder="지급 요청 검토에 필요한 내용을 입력해주세요." value={memo} /></label>
      {error && <p className="payment-request-error">{error}</p>}
      <div className="payment-request-modal-actions">{existingRequest && <button className="danger-button payment-request-cancel-button" disabled={!cancellationAllowed || submitting} onClick={() => setCancelConfirmOpen(true)} title={!cancellationAllowed ? existingRequest.status === 'payment_completed' || existingRequest.status === 'remittance_confirmed' ? '이미 지급 완료된 건입니다.' : '대표 승인 완료 후에는 일반 취소할 수 없습니다.' : undefined} type="button">지급요청 취소</button>}<div className="button-row"><button className="secondary-button" disabled={submitting} onClick={onClose} type="button">닫기</button><button className="primary-button" disabled={submitting} onClick={submit} type="button">{submitting ? '저장 중…' : existingRequest ? '수정 저장' : isFreelancer ? '네' : '지급 신청'}</button></div></div>
      <ReasonModal actionLabel="지급요청 취소" description="지급요청 취소 후 해당 대상은 다시 지급요청 전 상태로 돌아갑니다. 정산서 확정 상태는 유지됩니다." onChange={setCancellationReason} onClose={() => { setCancelConfirmOpen(false); setCancellationReason('') }} onSubmit={cancelRequest} open={cancelConfirmOpen} placeholder="지급요청 취소 사유를 입력해주세요." title="지급요청을 취소하시겠습니까?" value={cancellationReason} />
    </section>
  </div>
}

function VersionCompareModal({ versions, onClose }: { versions: SettlementVersion[]; onClose: () => void }) {
  const [before, after] = [versions[1], versions[0]]
  const rows = before && after ? settlementService.compareSettlementVersions(before.id, after.id) : []
  return (
    <div className="settlement-modal-backdrop">
      <section className="settlement-modal">
        <div className="preview-drawer__header"><div><p className="page-eyebrow">Version Compare</p><h2>v{before?.version} / v{after?.version}</h2></div><button className="icon-button" onClick={onClose} type="button">×</button></div>
        <table className="comparison-table">
          <thead><tr><th>항목</th><th>이전</th><th>현재</th><th>변경</th></tr></thead>
          <tbody>{rows.map((row) => <tr key={row.label}><td>{row.label}</td><td className="amount-cell">{money(row.before)}</td><td className="amount-cell">{money(row.after)}</td><td>{row.changed ? '변경' : '동일'}</td></tr>)}</tbody>
        </table>
      </section>
    </div>
  )
}
