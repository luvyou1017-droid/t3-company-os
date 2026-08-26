import { useEffect, useRef, useState, type ClipboardEvent, type RefObject } from 'react'
import { flushSync } from 'react-dom'
import { toBlob } from 'html-to-image'
import { campaignService } from '../../shared/services/campaignService'
import { salesDataService } from '../../shared/services/salesDataService'
import { settlementService } from '../../shared/services/settlementService'
import { paymentEvidenceService } from '../../shared/services/paymentEvidenceService'
import { PAYMENT_EVIDENCE_ALLOWED_TYPES, paymentEvidenceStorageService } from '../../shared/services/paymentEvidenceStorageService'
import { managerPaymentService } from '../../shared/services/managerPaymentService'
import { sellerSettlementService } from '../../shared/services/sellerSettlementService'
import { withholdingTaxService } from '../../shared/services/withholdingTaxService'
import type { SalesDataRow } from '../../shared/types/salesData'
import type { Settlement, SettlementDeduction, SettlementStatus, SettlementVersion } from '../../shared/types/settlement'
import { canMoveToReview, runSettlementAssertions, statusLabel, validateSettlement } from '../../shared/utils/settlement'
import { formatCurrency } from '../../shared/utils/salesData'
import { openCampaignDetail } from '../../shared/utils/campaignNavigation'
import { calculateFinalSellerPayment } from '../../shared/utils/sellerSettlement'
import { getRecommendedEvidenceType } from '../../shared/utils/sellerSettlement'
import { sellerMasterService } from '../../shared/services/sellerMasterService'
import { companySettlementProfile } from '../../shared/data/companySettlementProfile'
import { managerSettlementReportService } from '../../shared/services/managerSettlementReportService'
import { canViewManagerSettlement } from '../../shared/utils/managerSettlementPermission'
import { getUserById } from '../../shared/data/users'
import { paymentRequestService } from '../../shared/services/paymentRequestService'
import { getCampaignEventTypeLabel } from '../../shared/services/campaignCreationService'
import { calculateManagerProductRow, calculateSellerProductRow, calculateSellerProductSubtotal, formatKoreanDocumentDate, formatKoreanExportTime, getSellerSettlementSchedule } from '../../shared/utils/settlementDocument'
import { formatKoreanDate, formatKoreanDateTime as formatKoreanDateTimeCommon } from '../../shared/utils/koreanDate'
import type { EvidenceOwnerType } from '../../shared/types/paymentEvidence'
import type { PaymentRequestStatus, SellerBusinessType } from '../../shared/types/sellerSettlement'
import type { CampaignEvent } from '../../shared/types/campaignCreation'

type DocumentMode = '내부 검토용' | '셀러 전달용' | '매니저 정산서'
type ReadinessModal = 'commission' | 'costs' | 'share' | 'business' | 'account' | 'manager-account'
type ReadinessSeverity = 'blocking' | 'non-blocking'
type ReadinessWarning = { id: string; message: string; actionLabel: string; severity: ReadinessSeverity; action: () => void }
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

export function SettlementPage({ onOpenDetail }: { onOpenDetail: (settlementId: string) => void }) {
  const [settlements, setSettlements] = useState(() => settlementService.getSettlements())
  const [quick, setQuick] = useState<SettlementStatus | 'all'>(() => (sessionStorage.getItem('settlement-list-filter') as SettlementStatus | 'all' | null) ?? 'all')

  useEffect(() => {
    const savedScroll = Number(sessionStorage.getItem('settlement-list-scroll') ?? 0)
    requestAnimationFrame(() => window.scrollTo({ top: savedScroll }))
  }, [])

  useEffect(() => { sessionStorage.setItem('settlement-list-filter', quick) }, [quick])

  const sync = () => setSettlements(settlementService.getSettlements())
  const eligibleSales = salesDataService.getSalesDataImports().filter((item) => item.reviewStatus === '확정 완료' && item.settlementStatus === '정산 가능')
  const filtered = quick === 'all' ? settlements : settlements.filter((item) => item.status === quick)
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

  const dueThisWeek = settlements.filter((item) => item.status !== 'completed').reduce((total, item) => total + item.currentCalculation.finalPaymentAmount + item.currentCalculation.finalSellerPaymentAmount, 0)
  const sellerDue = settlements.filter((item) => item.status !== 'completed').reduce((total, item) => total + item.currentCalculation.finalSellerPaymentAmount, 0)
  const managerDue = settlements.filter((item) => item.status !== 'completed').reduce((total, item) => total + item.currentCalculation.finalPaymentAmount, 0)
  const evidenceMissing = settlements.filter((item) => item.evidenceStatus !== 'confirmed').length
  const calculationErrors = settlements.filter((item) => !validateSettlement(item).valid).length

  const createFirstReadySettlement = () => {
    const created = eligibleSales.map((item) => settlementService.createSettlementFromSalesData(item.id)).find(Boolean)
    sync()
    if (created) onOpenDetail(created.id)
  }

  return (
    <section className="campaign-schedule-page settlement-page">
      <section className="schedule-summary">
        <div className="schedule-summary__title">
          <div>
            <p className="page-eyebrow">Settlement V2</p>
            <h2>정산 관리</h2>
          </div>
          <button className="primary-button" disabled={!eligibleSales.length} onClick={createFirstReadySettlement} type="button">정산 생성</button>
        </div>
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
      </section>

      {!assertion.passed && <div className="inline-notice settlement-warning"><strong>경계값 검증 실패</strong><span>정산 계산 유틸을 확인해야 합니다.</span></div>}

      <section className="panel">
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

export function SettlementDetailPage({ settlementId, onBack, onOpenSalesData }: { settlementId: string; onBack: () => void; onOpenSalesData?: (importId: string) => void }) {
  const [settlement, setSettlement] = useState<Settlement | null>(() => settlementService.getSettlementById(settlementId) ?? null)
  const [documentMode, setDocumentMode] = useState<DocumentMode>('셀러 전달용')
  const [documentNotice, setDocumentNotice] = useState('')
  const [compareOpen, setCompareOpen] = useState(false)
  const [sellerExportGeneratedAt, setSellerExportGeneratedAt] = useState('')
  const [managerExportGeneratedAt, setManagerExportGeneratedAt] = useState('')
  const [expandedDocument, setExpandedDocument] = useState<'seller' | 'manager' | null>(null)
  const [printingDocument, setPrintingDocument] = useState<'seller' | 'manager' | null>(null)
  const [paymentRequestTarget, setPaymentRequestTarget] = useState<EvidenceOwnerType | null>(null)
  const [readinessModal, setReadinessModal] = useState<ReadinessModal | null>(null)
  const [businessTypeDraft, setBusinessTypeDraft] = useState<SellerBusinessType>('general_business')
  const [businessNameDraft, setBusinessNameDraft] = useState('')
  const [accountDraft, setAccountDraft] = useState({ bankName: '', accountNumber: '', accountHolder: '' })
  const [managerAccountDraft, setManagerAccountDraft] = useState({ bankName: '', accountNumber: '', accountHolder: '' })
  const [clipboardToast, setClipboardToast] = useState<{ message: string; error?: boolean } | null>(null)
  const [, setPaymentAutomationRevision] = useState(0)
  const sellerDocumentRef = useRef<HTMLDivElement | null>(null)
  const managerDocumentRef = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    if (!expandedDocument) return
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') setExpandedDocument(null) }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [expandedDocument])
  useEffect(() => {
    if (!settlement) return
    const targetCampaign = getCampaign(settlement)
    const sellerBusinessType = sellerSettlementService.getSellerSettlementRule(settlement.campaignId)?.businessType ?? 'general_business'
    const targetManagerBusinessType = managerPaymentService.getBusinessType(targetCampaign?.managerName ?? '')
    const before = withholdingTaxService.getItems().length
    withholdingTaxService.syncSettlementRecipients(settlement.id, sellerBusinessType, targetManagerBusinessType)
    if (withholdingTaxService.getItems().length !== before) queueMicrotask(() => setPaymentAutomationRevision((value) => value + 1))
  }, [settlement])
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
    const ratesValid = targetRows.length > 0 && settlement.currentCalculation.totalCommissionRate >= settlement.currentCalculation.sellerCommissionRate && settlement.currentCalculation.sellerCommissionRate >= 0 && settlement.currentCalculation.totalCommissionRate <= 100
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
  if (!settlement) return <section className="settlement-detail-page"><button className="settlement-back-button" onClick={onBack} type="button">← 정산 관리로 돌아가기</button><div className="empty-state"><strong>정산을 찾을 수 없습니다.</strong><span>삭제되었거나 접근할 수 없는 정산입니다.</span></div></section>

  const campaign = getCampaign(settlement)
  const currentUser = getUserById('u-001')
  const canAccessManagerDocument = Boolean(currentUser && canViewManagerSettlement(currentUser, campaign?.managerId))
  const versions = settlementService.getSettlementVersionsBySettlementId(settlement.id)
  const logs = settlementService.getActivityLogsBySettlementId(settlement.id)
  const validation = validateSettlement(settlement)
  const salesImport = salesDataService.getSalesDataImportById(settlement.salesDataImportId)
  const salesRows = salesDataService.getRowsByImportId(settlement.salesDataImportId)
  const salesDataConfirmed = salesImport?.reviewStatus === '확정 완료'
  const reviewReady = canMoveToReview(settlement, salesDataConfirmed)
  const sellerRule = sellerSettlementService.getSellerSettlementRule(settlement.campaignId)
  const sellerProfile = campaign ? sellerMasterService.getSellerById(campaign.sellerId) : undefined
  const managerProfile = campaign ? managerPaymentService.getProfile(campaign.managerId) : undefined
  const hasSellerAccount = Boolean(sellerProfile?.bankName?.trim() && sellerProfile.accountNumber?.trim() && sellerProfile.accountHolder?.trim())
  const hasManagerAccount = Boolean(managerProfile?.bankName?.trim() && managerProfile.accountNumber?.trim() && managerProfile.accountHolder?.trim())
  const managerBusinessType = managerPaymentService.getBusinessType(campaign?.managerName ?? '')
  const sellerPaymentRequest = campaign ? paymentRequestService.getPaymentRequestForRecipient(settlement.id, 'seller', campaign.sellerId, settlement.settlementVersion) : undefined
  const managerPaymentRequest = campaign ? paymentRequestService.getPaymentRequestForRecipient(settlement.id, 'manager', campaign.managerId, settlement.settlementVersion) : undefined
  const sellerRequestReasons = campaign && sellerRule ? paymentRequestService.validateSellerPaymentRequest({
    settlementId: settlement.id, ownerId: campaign.sellerId, businessType: sellerRule.businessType,
    evidenceTypeConfirmed: sellerRule.evidenceConfirmed && Boolean(sellerRule.confirmedEvidenceType), accountConfirmed: hasSellerAccount,
    calculationCompleted: true, calculationErrors: validation.errors, amountConfirmed: true, sourceVersion: settlement.settlementVersion,
  }).reasons : ['셀러 사업자 유형이 등록되지 않았습니다.']
  const managerRequestReasons = campaign ? paymentRequestService.validateManagerPaymentRequest({
    settlementId: settlement.id, ownerId: campaign.managerId, businessType: managerBusinessType,
    evidenceTypeConfirmed: true, accountConfirmed: hasManagerAccount, calculationCompleted: true,
    calculationErrors: [], amountConfirmed: settlement.currentCalculation.managerAmount >= 0, sourceVersion: settlement.settlementVersion,
  }).reasons : ['담당 매니저 정보가 없습니다.']
  const evidenceModalReasons = ['세금계산서 캡처본이 없습니다.', '현금영수증 캡처본이 없습니다.', '증빙 검수가 완료되지 않았습니다.']
  const sellerButtonBlockReasons = sellerPaymentRequest || settlement.sellerPaymentCompleted ? ['이미 지급요청되었거나 지급 완료된 건입니다.'] : sellerRequestReasons.filter((reason) => !evidenceModalReasons.includes(reason))
  const managerButtonBlockReasons = managerPaymentRequest || settlement.managerPaymentCompleted ? ['이미 지급요청되었거나 지급 완료된 건입니다.'] : managerRequestReasons.filter((reason) => !evidenceModalReasons.includes(reason))
  const sellerActionReasons = sellerButtonBlockReasons.length ? sellerButtonBlockReasons : sellerRequestReasons.filter((reason) => evidenceModalReasons.includes(reason))
  const managerActionReasons = managerButtonBlockReasons.length ? managerButtonBlockReasons : managerRequestReasons.filter((reason) => evidenceModalReasons.includes(reason))
  const checklist = settlement.reviewChecklist
  const deductions = settlementService.getDeductionsBySettlementId(settlement.id)
  const actualCosts = deductions.filter((item) => item.amount > 0)
  const unresolvedCostOwners = actualCosts.filter((item) => item.costOwner === 'undecided' || item.applyLocation === 'needs_review')
  const totalRate = settlement.currentCalculation.totalCommissionRate
  const sellerRate = settlement.currentCalculation.sellerCommissionRate
  const commissionRatesValid = salesRows.length > 0 && Number.isFinite(totalRate) && Number.isFinite(sellerRate) && totalRate >= sellerRate && sellerRate >= 0 && totalRate <= 100
  const managerShareTotal = settlement.currentCalculation.managerShareRate + settlement.currentCalculation.companyShareRate
  const managerShareValid = Math.abs(managerShareTotal - 100) < 0.001
  const effectiveSellerBusinessType = sellerProfile?.businessType ?? sellerRule?.businessType
  const checklistDone = Object.values(checklist).every(Boolean)
  const settlementPreparationWarnings: ReadinessWarning[] = []
  if (!salesDataConfirmed) settlementPreparationWarnings.push({ id: 'sales', message: '판매 데이터 확정이 필요합니다.', actionLabel: '판매 데이터 확인', severity: 'blocking', action: () => onOpenSalesData?.(settlement.salesDataImportId) })
  if (!commissionRatesValid) settlementPreparationWarnings.push({ id: 'commission', message: '수수료율 확인이 필요합니다.', actionLabel: '수수료율 확인', severity: 'blocking', action: () => setReadinessModal('commission') })
  if (!checklist.sampleCostReflected) settlementPreparationWarnings.push({ id: 'sample', message: '샘플비 반영 확인이 필요합니다.', actionLabel: '비용/차감 확인', severity: 'non-blocking', action: () => setReadinessModal('costs') })
  if (!checklist.eventCostReflected) settlementPreparationWarnings.push({ id: 'event', message: '이벤트비 반영 확인이 필요합니다.', actionLabel: '비용/차감 확인', severity: 'non-blocking', action: () => setReadinessModal('costs') })
  if (!checklist.otherDeductionsConfirmed) settlementPreparationWarnings.push({ id: 'other', message: '기타 차감 확인이 필요합니다.', actionLabel: '비용/차감 확인', severity: 'non-blocking', action: () => setReadinessModal('costs') })
  if (unresolvedCostOwners.length > 0) settlementPreparationWarnings.push({ id: 'owners', message: '비용 부담자 확인이 필요합니다.', actionLabel: '비용/차감 확인', severity: 'non-blocking', action: () => setReadinessModal('costs') })
  if (!checklist.managerShareConfirmed || !managerShareValid) settlementPreparationWarnings.push({ id: 'share', message: '매니저 배분율 확인이 필요합니다.', actionLabel: '배분율 확인', severity: managerShareValid ? 'non-blocking' : 'blocking', action: () => setReadinessModal('share') })
  if (!effectiveSellerBusinessType) settlementPreparationWarnings.push({ id: 'business', message: '사업자 유형이 등록되지 않았습니다.', actionLabel: '셀러 정보 등록', severity: 'non-blocking', action: () => { setBusinessNameDraft(sellerProfile?.businessName ?? ''); setReadinessModal('business') } })
  if (!effectiveSellerBusinessType) settlementPreparationWarnings.push({ id: 'evidence', message: '증빙 유형 확인이 필요합니다.', actionLabel: '증빙 확인', severity: 'non-blocking', action: () => { setBusinessNameDraft(sellerProfile?.businessName ?? ''); setReadinessModal('business') } })
  if (!hasSellerAccount) settlementPreparationWarnings.push({ id: 'account', message: '셀러 지급 계좌가 등록되지 않았습니다.', actionLabel: '계좌 등록', severity: 'non-blocking', action: () => { setAccountDraft({ bankName: sellerProfile?.bankName ?? '', accountNumber: sellerProfile?.accountNumber ?? '', accountHolder: sellerProfile?.accountHolder ?? '' }); setReadinessModal('account') } })
  const blockingWarnings = settlementPreparationWarnings.filter((item) => item.severity === 'blocking')
  const nonBlockingWarnings = settlementPreparationWarnings.filter((item) => item.severity === 'non-blocking')

  const syncAction = (action: () => unknown) => {
    action()
    setSettlement(settlementService.getSettlementById(settlement.id) ?? null)
  }

  const confirmChecklist = (values: Partial<typeof checklist>) => {
    settlementService.updateReviewChecklist(settlement.id, { ...checklist, ...values })
    setSettlement(settlementService.getSettlementById(settlement.id) ?? null)
  }

  const saveSellerBusinessType = () => {
    if (!campaign) return
    const normalizedMasterType = businessTypeDraft === 'freelancer' ? 'freelancer' : businessTypeDraft === 'simplified_business' ? 'simplified_business' : 'general_business'
    sellerMasterService.saveSellerProfile({
      id: campaign.sellerId,
      name: campaign.sellerName,
      businessType: normalizedMasterType,
      businessName: businessNameDraft.trim() || undefined,
      defaultMdId: campaign.mdId,
      defaultManagerId: campaign.managerId,
      bankName: sellerProfile?.bankName,
      accountNumber: sellerProfile?.accountNumber,
      accountHolder: sellerProfile?.accountHolder,
    })
    const evidenceType = getRecommendedEvidenceType(businessTypeDraft)
    if (sellerRule) sellerSettlementService.saveRule({ ...sellerRule, businessType: businessTypeDraft, recommendedEvidenceType: evidenceType, confirmedEvidenceType: evidenceType, evidenceConfirmed: true, evidenceConfirmedBy: '허수정', evidenceConfirmedAt: new Date().toISOString(), updatedAt: new Date().toISOString() })
    confirmChecklist({ taxTypeConfirmed: true, evidenceConfirmed: true })
    setReadinessModal(null)
  }

  const saveSellerAccount = () => {
    if (!campaign || !accountDraft.bankName.trim() || !accountDraft.accountNumber.trim() || !accountDraft.accountHolder.trim()) return
    sellerMasterService.saveSellerProfile({
      id: campaign.sellerId,
      name: campaign.sellerName,
      businessType: sellerProfile?.businessType ?? (effectiveSellerBusinessType === 'freelancer' ? 'freelancer' : effectiveSellerBusinessType === 'simplified_business' ? 'simplified_business' : effectiveSellerBusinessType ? 'general_business' : undefined),
      businessName: sellerProfile?.businessName,
      defaultMdId: campaign.mdId,
      defaultManagerId: campaign.managerId,
      bankName: accountDraft.bankName.trim(),
      accountNumber: accountDraft.accountNumber.trim(),
      accountHolder: accountDraft.accountHolder.trim(),
    })
    settlementService.updateEvidence(settlement.id, settlement.evidenceStatus, settlement.taxEvidenceConfirmed, true)
    confirmChecklist({ paymentAccountConfirmed: true })
    setReadinessModal(null)
  }

  const saveManagerAccount = () => {
    if (!campaign || !managerAccountDraft.bankName.trim() || !managerAccountDraft.accountNumber.trim() || !managerAccountDraft.accountHolder.trim()) return
    managerPaymentService.saveProfile({ id: campaign.managerId, name: campaign.managerName, businessName: managerProfile?.businessName, bankName: managerAccountDraft.bankName.trim(), accountNumber: managerAccountDraft.accountNumber.trim(), accountHolder: managerAccountDraft.accountHolder.trim() })
    settlementService.updateEvidence(settlement.id, settlement.evidenceStatus, settlement.taxEvidenceConfirmed, true)
    setSettlement(settlementService.getSettlementById(settlement.id) ?? null)
    setReadinessModal(null)
  }

  const showClipboardToast = (message: string, error = false) => setClipboardToast({ message, error })

  const copySellerMessage = async () => {
    const schedule = getSellerSettlementSchedule(settlement.createdAt)
    const evidenceName = sellerRule?.businessType === 'freelancer' ? '원천세 리스트 등록' : sellerRule?.businessType === 'simplified_business' ? '현금영수증 발행' : sellerRule ? '세금계산서 발행' : '데이터 미연결'
    const businessType = sellerRule?.businessType === 'corporation' || sellerRule?.businessType === 'general_business' ? 'general_business' : sellerRule?.businessType
    const productSubtotal = calculateSellerProductSubtotal(salesRows, settlement.currentCalculation.sellerCommissionRate)
    const finalDeposit = businessType
      ? calculateFinalSellerPayment(productSubtotal.commissionAmount, businessType, settlement.currentCalculation.sellerDeductionTotal).finalSellerPaymentAmount
      : Math.max(productSubtotal.commissionAmount - settlement.currentCalculation.sellerDeductionTotal, 0)
    const period = `${formatKoreanDate(salesImport?.salesStartDate || campaign?.startDate)} ~ ${formatKoreanDate(salesImport?.salesEndDate || campaign?.endDate)}`
    const evidenceRequest = sellerRule?.businessType === 'freelancer' ? '원천세 등록을 위해 필요한 정보를 확인해주세요.' : sellerRule?.businessType === 'simplified_business' ? '현금영수증 발행 부탁드립니다.' : sellerRule ? '세금계산서 발행 부탁드립니다.' : '필요 증빙 정보를 확인해주세요.'
    const message = `안녕하세요, ${campaign?.sellerName || '셀러'}님.\n${campaign?.campaignName || settlement.campaignId || '공동구매'} 정산서 전달드립니다.\n\n공구기간: ${period}\n총매출: ${money(productSubtotal.salesAmount)}\n최종 입금액: ${money(finalDeposit)}\n필요 증빙: ${evidenceName}\n증빙 마감일: ${formatKoreanDocumentDate(schedule.evidenceDeadline)}\n입금 예정일: ${formatKoreanDocumentDate(schedule.paymentDate)}\n\n${evidenceRequest}\n정산 내용 확인 부탁드립니다.\n\n금요일까지 필요한 증빙자료 전달 및 발행이 완료된 경우,\n기재된 입금 예정일에 입금됩니다.\n입금 예정일이 휴일인 경우 다음 영업일에 지급됩니다.\n\n감사합니다.`
    try {
      if (!navigator.clipboard?.writeText) throw new Error('Clipboard API unavailable')
      await navigator.clipboard.writeText(message)
      showClipboardToast('클립보드로 복사되었습니다.')
    } catch { showClipboardToast('복사하지 못했습니다. 다시 시도해주세요.', true) }
  }

  const copySellerDocumentText = async () => {
    try {
      if (!navigator.clipboard?.writeText) throw new Error('Clipboard API unavailable')
      await navigator.clipboard.writeText(sellerDocumentRef.current?.innerText ?? '')
      showClipboardToast('클립보드로 복사되었습니다.')
    } catch { showClipboardToast('복사하지 못했습니다. 다시 시도해주세요.', true) }
  }

  const createDocumentPng = async (target: RefObject<HTMLDivElement | null>, exportClass?: string, setGeneratedAt?: (value: string) => void) => {
    const node = target.current
    if (!node) throw new Error('정산서 영역을 찾을 수 없습니다.')
    if (setGeneratedAt) flushSync(() => setGeneratedAt(formatKoreanExportTime()))
    if (exportClass) node.classList.add(exportClass)
    try {
      const blob = await toBlob(node, { backgroundColor: '#ffffff', cacheBust: true, pixelRatio: 2 })
      if (!blob) throw new Error('PNG 생성에 실패했습니다.')
      return blob
    } finally {
      if (exportClass) node.classList.remove(exportClass)
      if (setGeneratedAt) flushSync(() => setGeneratedAt(''))
    }
  }
  const createSellerDocumentPng = () => createDocumentPng(sellerDocumentRef, 'seller-document--exporting', setSellerExportGeneratedAt)

  const printDocument = (target: 'seller' | 'manager', setGeneratedAt: (value: string) => void) => {
    flushSync(() => { setPrintingDocument(target); setGeneratedAt(formatKoreanExportTime()) })
    const clear = () => { setGeneratedAt(''); setPrintingDocument(null) }
    window.addEventListener('afterprint', clear, { once: true })
    requestAnimationFrame(() => window.print())
  }

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

  const showDocument = (mode: DocumentMode) => {
    setDocumentMode(mode)
    requestAnimationFrame(() => (document.getElementById(mode === '매니저 정산서' ? 'manager-settlement-document' : 'seller-settlement-document') ?? document.getElementById('settlement-preparation'))?.scrollIntoView({ behavior: 'smooth' }))
  }

  const openDetailSection = (id: string) => {
    const target = document.getElementById(id) as HTMLDetailsElement | null
    if (!target) return
    target.open = true
    target.scrollIntoView({ behavior: 'smooth' })
  }

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
          <div className="settlement-header-actions"><button className="secondary-button" onClick={() => showDocument('셀러 전달용')} type="button">셀러 정산서 바로보기</button>{canAccessManagerDocument && <button className="secondary-button" onClick={() => showDocument('매니저 정산서')} type="button">매니저 정산서 바로보기</button>}</div>
        </div>

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

        {blockingWarnings.length > 0 && <ReadinessWarningSection id="settlement-preparation" title="정산 계산 준비 필요" warnings={blockingWarnings} />}
        {nonBlockingWarnings.length > 0 && <ReadinessWarningSection title="지급 준비 필요" warnings={nonBlockingWarnings} />}

        {blockingWarnings.length === 0 && <section className="detail-card settlement-card settlement-document-tab settlement-page-section" id="settlement-documents">
          <div className="checklist-head">
            <div><p className="page-eyebrow">5. 정산서 보기</p><h2>정산서 비교</h2><p>셀러 정산서와 매니저 정산서를 한 화면에서 비교합니다.</p></div>
            <div className="document-view-tabs" role="tablist" aria-label="정산서 종류">
              <button aria-selected={documentMode === '내부 검토용'} className={documentMode === '내부 검토용' ? 'is-active' : ''} onClick={() => setDocumentMode('내부 검토용')} role="tab" type="button">내부 검토용</button>
              <button aria-selected={documentMode !== '내부 검토용'} className={documentMode !== '내부 검토용' ? 'is-active' : ''} onClick={() => setDocumentMode('셀러 전달용')} role="tab" type="button">셀러 / 매니저 비교</button>
            </div>
          </div>
          {documentMode === '내부 검토용' ? (
            <InternalSettlementDocument campaignName={campaign?.campaignName ?? settlement.campaignId} settlement={settlement} />
          ) : (
            <div className={`settlement-document-comparison ${printingDocument ? `is-printing-${printingDocument}` : ''}`}>
              <article className={`settlement-document-column ${expandedDocument === 'seller' ? 'is-expanded' : ''}`} id="seller-settlement-document">
                <div className="settlement-document-column__heading"><h3>셀러 정산서</h3>{expandedDocument === 'seller' && <button aria-label="닫기" className="settlement-expanded-close no-print" onClick={() => setExpandedDocument(null)} type="button">×</button>}</div>
                <SettlementDocumentActions blockReasons={sellerActionReasons} onCopyText={copySellerDocumentText} onCopyImage={copySellerDocumentImage} onCopyMessage={copySellerMessage} onPreview={() => setExpandedDocument('seller')} onPrint={() => printDocument('seller', setSellerExportGeneratedAt)} onRequestPayment={() => setPaymentRequestTarget('seller')} onSaveImage={saveSellerDocumentImage} paymentDisabled={sellerButtonBlockReasons.length > 0} paymentStatus={sellerPaymentRequest ? paymentStatusLabels[sellerPaymentRequest.status] : settlement.sellerPaymentCompleted ? '지급 완료' : '지급 대기'} />
                <SellerSettlementDocument exportGeneratedAt={sellerExportGeneratedAt} rows={salesRows} sellerDocumentRef={sellerDocumentRef} settlement={settlement} />
              </article>
              {canAccessManagerDocument && <article className={`settlement-document-column ${expandedDocument === 'manager' ? 'is-expanded' : ''}`} id="manager-settlement-document">
                <div className="settlement-document-column__heading"><h3>매니저 정산서</h3>{expandedDocument === 'manager' && <button aria-label="닫기" className="settlement-expanded-close no-print" onClick={() => setExpandedDocument(null)} type="button">×</button>}</div>
                <ManagerDocumentActions blockReasons={managerActionReasons} onAccount={() => { setManagerAccountDraft({ bankName: managerProfile?.bankName ?? '', accountNumber: managerProfile?.accountNumber ?? '', accountHolder: managerProfile?.accountHolder ?? '' }); setReadinessModal('manager-account') }} onCopy={copyManagerDocumentImage} onPreview={() => setExpandedDocument('manager')} onPrint={() => printDocument('manager', setManagerExportGeneratedAt)} onRequestPayment={() => setPaymentRequestTarget('manager')} onSave={saveManagerDocumentImage} paymentDisabled={managerButtonBlockReasons.length > 0} paymentStatus={managerPaymentRequest ? paymentStatusLabels[managerPaymentRequest.status] : settlement.managerPaymentCompleted ? '지급 완료' : '지급 대기'} />
                <ManagerSettlementDocument documentRef={managerDocumentRef} exportGeneratedAt={managerExportGeneratedAt} rows={salesRows} settlement={settlement} />
              </article>}
              {expandedDocument && <button aria-label="닫기" className="settlement-document-expanded-backdrop no-print" onClick={() => setExpandedDocument(null)} type="button" />}
              {documentNotice && <p className="mock-notice settlement-document-comparison__notice">{documentNotice}</p>}
            </div>
          )}
        </section>}

        <SettlementProgress settlement={settlement} />

        <details className="detail-card settlement-card settlement-page-section settlement-collapsible" id="calculation-detail"><summary><div><h2>정산 계산 상세</h2><p>정산 금액의 계산식과 계산 근거를 확인합니다.</p></div><span className="settlement-collapse-label">펼쳐보기</span></summary><div className="settlement-collapsible__content"><CalculationTable settlement={settlement} /><details className="settlement-internal-validation"><summary>내부 검증 항목 관리</summary><div className="settlement-checklist">{Object.entries(checklistLabels).map(([key, label]) => <label className="checklist-item" key={key}><input checked={settlement.reviewChecklist[key as keyof typeof settlement.reviewChecklist]} onChange={(event) => { settlementService.updateReviewChecklist(settlement.id, { ...settlement.reviewChecklist, [key]: event.target.checked }); setSettlement(settlementService.getSettlementById(settlement.id) ?? null) }} type="checkbox" />{label}</label>)}</div></details></div></details>

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

        <div className="preview-drawer__actions">
          <button className="secondary-button" onClick={() => openCampaignDetail(settlement.campaignId, 'settlement')} type="button">공동구매 상세 보기</button>
          <SettlementStatusActions
            checklistDone={checklistDone}
            onHistory={() => openDetailSection('payment-history')}
            onSetDocument={() => (document.getElementById('settlement-documents') ?? document.getElementById('settlement-preparation'))?.scrollIntoView({ behavior: 'smooth' })}
            reviewReady={reviewReady}
            settlement={settlement}
            syncAction={syncAction}
          />
        </div>

        {compareOpen && <VersionCompareModal versions={versions} onClose={() => setCompareOpen(false)} />}
        {paymentRequestTarget && campaign && <PaymentRequestEvidenceModal campaign={campaign} managerBusinessType={managerBusinessType} onClose={() => setPaymentRequestTarget(null)} onRequested={() => { setPaymentRequestTarget(null); setSettlement(settlementService.getSettlementById(settlement.id) ?? null) }} ownerType={paymentRequestTarget} sellerBusinessType={sellerRule?.businessType ?? 'general_business'} settlement={settlement} />}
        {clipboardToast && <div aria-live="polite" className={`clipboard-toast ${clipboardToast.error ? 'is-error' : ''}`}>{clipboardToast.error ? '!' : '✓'} {clipboardToast.message}</div>}
        {readinessModal && campaign && <div className="settlement-modal-backdrop" onMouseDown={(event) => { if (event.currentTarget === event.target) setReadinessModal(null) }}><section aria-modal="true" className="settlement-readiness-modal" role="dialog"><button aria-label="닫기" className="settlement-expanded-close" onClick={() => setReadinessModal(null)} type="button">×</button>
          {readinessModal === 'commission' && <><h2>수수료율 확인</h2><p>Campaign Snapshot에 저장된 상품별 수수료율입니다.</p><div className="table-scroll"><table className="data-table"><thead><tr><th>상품 / SKU</th><th>총수수료율</th><th>셀러 수수료율</th></tr></thead><tbody>{salesRows.map((row) => <tr key={row.id}><td>{campaign.productName} / {row.optionName}</td><td>{totalRate}%</td><td>{sellerRate}%</td></tr>)}</tbody></table></div>{!commissionRatesValid && <p className="settlement-readiness-modal__error">유효한 수수료율이 없습니다. 상품 정보를 수정해주세요.</p>}<div className="modal-actions">{!commissionRatesValid && <button className="secondary-button" onClick={() => openCampaignDetail(campaign.id, 'overview')} type="button">상품 정보 수정</button>}<button className="primary-button" disabled={!commissionRatesValid} onClick={() => { confirmChecklist({ commissionRateConfirmed: true }); setReadinessModal(null) }} type="button">확인 완료</button></div></>}
          {readinessModal === 'costs' && <><h2>정산 비용/차감 확인</h2><p>금액이 0원인 항목도 비용 없음으로 확인할 수 있습니다.</p><table className="data-table"><thead><tr><th>항목</th><th>금액</th><th>부담 주체</th></tr></thead><tbody>{(['sample', 'event', 'other'] as const).map((type) => { const items = deductions.filter((item) => item.type === type); const amount = items.reduce((sum, item) => sum + item.amount, 0); return <tr key={type}><td>{type === 'sample' ? '샘플비' : type === 'event' ? '이벤트비' : '기타 차감'}</td><td>{amount ? money(amount) : '0원 · 없음'}</td><td>{items.length ? [...new Set(items.map((item) => costOwnerLabel[item.costOwner] ?? item.costOwner))].join(', ') : '비용 없음'}</td></tr> })}</tbody></table>{unresolvedCostOwners.length > 0 && <p className="settlement-readiness-modal__error">부담 주체가 지정되지 않은 비용이 있습니다. 정산 계산 상세에서 비용 정보를 확인해주세요.</p>}<div className="modal-actions"><button className="primary-button" disabled={unresolvedCostOwners.length > 0} onClick={() => { confirmChecklist({ sampleCostReflected: true, eventCostReflected: true, otherDeductionsConfirmed: true, costOwnersConfirmed: true }); setReadinessModal(null) }} type="button">확인 완료</button></div></>}
          {readinessModal === 'share' && <><h2>매니저 배분율 확인</h2><dl className="settlement-readiness-summary"><div><dt>매니저</dt><dd>{campaign.managerName}</dd></div><div><dt>매니저 배분율</dt><dd>{settlement.currentCalculation.managerShareRate}%</dd></div><div><dt>회사 배분율</dt><dd>{settlement.currentCalculation.companyShareRate}%</dd></div><div><dt>합계</dt><dd>{managerShareTotal}%</dd></div></dl>{!managerShareValid && <p className="settlement-readiness-modal__error">배분율 합계가 100%가 아닙니다.</p>}<div className="modal-actions">{!managerShareValid && <button className="secondary-button" onClick={() => openCampaignDetail(campaign.id, 'settlement')} type="button">기존 설정 확인</button>}<button className="primary-button" disabled={!managerShareValid} onClick={() => { confirmChecklist({ managerShareConfirmed: true }); setReadinessModal(null) }} type="button">확인 완료</button></div></>}
          {readinessModal === 'business' && <><h2>셀러 정보 등록</h2><label className="form-field"><span>셀러명</span><input disabled value={campaign.sellerName} /></label><label className="form-field"><span>사업자명</span><input onChange={(event) => setBusinessNameDraft(event.target.value)} placeholder="등록된 사업자명을 입력하세요" value={businessNameDraft} /></label><label className="form-field"><span>사업자 유형</span><select onChange={(event) => setBusinessTypeDraft(event.target.value as SellerBusinessType)} value={businessTypeDraft}><option value="general_business">법인/개인사업자</option><option value="simplified_business">간이사업자</option><option value="freelancer">개인 프리랜서</option></select></label><p>셀러명과 사업자명은 별도 정보로 저장됩니다. 증빙 유형은 사업자 유형에 따라 자동 결정됩니다.</p><div className="modal-actions"><button className="primary-button" onClick={saveSellerBusinessType} type="button">저장</button></div></>}
          {readinessModal === 'account' && <><h2>셀러 지급 계좌 등록</h2><div className="settlement-readiness-form"><label className="form-field"><span>은행명</span><input onChange={(event) => setAccountDraft((value) => ({ ...value, bankName: event.target.value }))} value={accountDraft.bankName} /></label><label className="form-field"><span>계좌번호</span><input onChange={(event) => setAccountDraft((value) => ({ ...value, accountNumber: event.target.value }))} value={accountDraft.accountNumber} /></label><label className="form-field"><span>예금주명</span><input onChange={(event) => setAccountDraft((value) => ({ ...value, accountHolder: event.target.value }))} value={accountDraft.accountHolder} /></label></div><div className="modal-actions"><button className="primary-button" disabled={!accountDraft.bankName.trim() || !accountDraft.accountNumber.trim() || !accountDraft.accountHolder.trim()} onClick={saveSellerAccount} type="button">저장</button></div></>}
          {readinessModal === 'manager-account' && <><h2>매니저 지급 계좌 등록</h2><div className="settlement-readiness-form"><label className="form-field"><span>은행명</span><input onChange={(event) => setManagerAccountDraft((value) => ({ ...value, bankName: event.target.value }))} value={managerAccountDraft.bankName} /></label><label className="form-field"><span>계좌번호</span><input onChange={(event) => setManagerAccountDraft((value) => ({ ...value, accountNumber: event.target.value }))} value={managerAccountDraft.accountNumber} /></label><label className="form-field"><span>예금주명</span><input onChange={(event) => setManagerAccountDraft((value) => ({ ...value, accountHolder: event.target.value }))} value={managerAccountDraft.accountHolder} /></label></div><div className="modal-actions"><button className="primary-button" disabled={!managerAccountDraft.bankName.trim() || !managerAccountDraft.accountNumber.trim() || !managerAccountDraft.accountHolder.trim()} onClick={saveManagerAccount} type="button">저장</button></div></>}
        </section></div>}
    </section>
  )
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

const workflowSteps = ['정산 계산', '정산서 검토', '셀러 전달', '증빙 확인', '지급 요청', '대표 승인', '지급 완료'] as const

function getWorkflowState(settlement: Settlement) {
  if (settlement.status === 'completed') return { index: 6, current: '지급 완료', next: '모든 정산 업무가 완료되었습니다.' }
  if (settlement.status === 'payment_ready' || settlement.status === 'partially_paid') return { index: 6, current: '지급 처리 중', next: '셀러와 매니저 지급을 완료해주세요.' }
  if (settlement.status === 'approval_pending') return { index: 5, current: '대표 승인 대기', next: '대표 승인 결과를 확인해주세요.' }
  if (settlement.status === 'approved') return { index: 4, current: '지급 요청 대기', next: '승인된 정산의 지급을 요청해주세요.' }
  if (settlement.evidenceStatus === 'confirmed') return { index: 3, current: '증빙 확인', next: '증빙과 계좌를 확인한 뒤 지급을 요청해주세요.' }
  if (settlement.status === 'manager_reviewed') return { index: 2, current: '셀러 정산서 전달 대기', next: '셀러에게 정산서를 전달해주세요.' }
  if (['review_pending', 'revision_required'].includes(settlement.status)) return { index: 1, current: '정산서 검토', next: '검토 체크리스트를 완료하고 정산서를 확정해주세요.' }
  return { index: 0, current: '정산 계산', next: '정산 계산을 실행하고 결과를 검토해주세요.' }
}

function SettlementProgress({ settlement }: { settlement: Settlement }) {
  const state = getWorkflowState(settlement)
  return <section className="settlement-page-section settlement-progress-section" id="progress">
    <div className="section-heading"><div><p className="page-eyebrow">3. 정산 진행상황</p><h2>정산 진행상황</h2></div></div>
    <ol className="settlement-stepper">{workflowSteps.map((step, index) => <li className={index < state.index ? 'is-complete' : index === state.index ? 'is-current' : ''} key={step}><span>{index < state.index ? '✓' : index + 1}</span><strong>{step}</strong></li>)}</ol>
    <div className="settlement-next-action"><div><span>현재 단계</span><strong>{state.current}</strong></div><div><span>다음 할 일</span><strong>{state.next}</strong></div></div>
  </section>
}

const checklistLabels = {
  salesMatches: '총매출이 Sales Data와 일치함',
  commissionRateConfirmed: '수수료율이 정확함',
  sampleCostReflected: '샘플비가 반영됨',
  eventCostReflected: '이벤트비가 반영됨',
  otherDeductionsConfirmed: '기타 차감이 확인됨',
  costOwnersConfirmed: '비용 부담자가 정확함',
  managerShareConfirmed: '매니저 배분율이 정확함',
  taxTypeConfirmed: '세무 유형이 정확함',
  evidenceConfirmed: '증빙 상태가 확인됨',
  paymentAccountConfirmed: '지급 계좌 정보가 확인됨',
}

function InternalSettlementDocument({ campaignName, settlement }: { campaignName: string; settlement: Settlement }) {
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
        <Summary label="이벤트비" value={money(settlement.currentCalculation.companyEventDeduction)} amount />
        <Summary label="기타 차감" value={money(settlement.currentCalculation.companyOtherDeduction)} amount />
        <Summary label="최종 배분 대상 금액" value={money(settlement.currentCalculation.distributableVendorCommission)} amount />
        <Summary label="매니저 지급액" value={money(settlement.currentCalculation.managerAmount)} amount />
        <Summary label="회사 귀속액" value={money(settlement.currentCalculation.companyAmount)} amount />
      </div>
      <div className="preview-text-list">
        {settlement.calculationSteps.map((step) => <p key={step.id}>{step.order}. {step.label}: {typeof step.result === 'number' ? money(step.result) : step.result}</p>)}
      </div>
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
  return <section className="seller-document__section seller-document__costs"><h3>추가 비용 및 차감</h3><table className="seller-document__table"><thead><tr><th>항목</th><th>금액</th><th>부담 주체</th><th>비고</th></tr></thead><tbody>
    {rows.map((row) => <tr className={row.direction === 'deduction' && row.amount !== undefined && row.amount > 0 ? 'seller-cost-deduction' : undefined} key={row.id}><td>{row.label}</td><td className={`amount-cell ${row.direction === 'payment' ? 'seller-positive-amount' : ''}`}>{row.amount === undefined ? '등록 정보 없음' : `${row.direction === 'payment' ? '+' : '-'} ${money(row.amount)}`}</td><td>{row.owner}</td><td>{row.memo}</td></tr>)}
  </tbody></table></section>
}

const paymentStatusLabels: Record<PaymentRequestStatus, string> = {
  draft: '지급 대기', evidence_pending: '증빙 검수 대기', request_ready: '지급 요청 준비', approval_pending: '대표 승인 대기',
  approved: '지급 승인', sent: '전달 완료', payment_completed: '지급 완료', remittance_confirmed: '입금 확인 완료',
  on_hold: '보류', rejected: '반려',
}

const businessTypeLabels: Record<SellerBusinessType, string> = {
  corporation: '법인', general_business: '일반 개인사업자', simplified_business: '간이사업자', freelancer: '개인 프리랜서',
}

function managerCostLabel(item: SettlementDeduction) {
  if (item.type === 'sample') return item.title.includes('추가') ? '샘플 추가비용' : '샘플 비용'
  if (item.type === 'event') return item.costOwner === 'manager' ? '매니저 부담 이벤트' : item.costOwner === 'company' ? '회사 부담 이벤트' : '공동 부담 이벤트'
  if (item.type === 'promotion') return '기타 추가 지급'
  if (item.type === 'purchase' && item.costOwner === 'manager') return '매니저 선결제'
  if (item.type === 'other' && item.title.includes('비용')) return '기타 비용'
  return '기타 차감'
}

function ManagerSettlementDocument({ documentRef, exportGeneratedAt, rows, settlement }: { documentRef: RefObject<HTMLDivElement | null>; exportGeneratedAt: string; rows: SalesDataRow[]; settlement: Settlement }) {
  const campaign = getCampaign(settlement)
  const snapshots = campaign?.proposalSnapshots ?? []
  const report = managerSettlementReportService.getReport(settlement)
  const managerBusinessType = managerPaymentService.getBusinessType(campaign?.managerName ?? '')
  const evidence = paymentEvidenceService.getEvidenceBySettlementId(settlement.id, 'manager')
  const tax = campaign ? withholdingTaxService.getBySettlementOwner(settlement.id, 'manager', campaign.managerId).find((item) => item.sourceVersion === settlement.settlementVersion) : undefined
  const request = campaign ? paymentRequestService.getPaymentRequestForRecipient(settlement.id, 'manager', campaign.managerId, settlement.settlementVersion) : undefined
  const managerProfile = campaign ? managerPaymentService.getProfile(campaign.managerId) : undefined
  const evidenceLabel = managerBusinessType === 'freelancer' ? '원천세' : managerBusinessType === 'simplified_business' ? '현금영수증' : '세금계산서'
  const srookSnapshots = snapshots.filter((item) => item.actualSalesChannel === 'wise_shop_link')
  const isSrookPayCampaign = srookSnapshots.length > 0 || (!snapshots.length && report.actualSalesChannel === 'wise_shop_link')
  const srookPayAmounts = srookSnapshots.map((item) => item.actualPgCost).filter((amount): amount is number => amount !== undefined)
  const srookPayAmount = srookPayAmounts.length ? srookPayAmounts.reduce((sum, amount) => sum + amount, 0) : undefined
  const preDistributionCosts = report.companyCosts.filter((item) => item.amount > 0)
  return <div className="seller-document-shell"><div className="seller-document seller-statement manager-document manager-statement" ref={documentRef}>
    <header className="seller-document__header"><h2>[와이즈벤더 매니저 정산서]</h2><p><span>정산 버전</span><strong>v{settlement.settlementVersion}</strong></p></header>
    <table className="seller-document__table seller-document__meta-table"><tbody><tr><th>공구명</th><td>{campaign?.campaignName ?? '-'}</td><th>공구기간</th><td>{formatKoreanDate(campaign?.startDate)} ~ {formatKoreanDate(campaign?.endDate)}</td></tr><tr><th>셀러</th><td>{campaign?.sellerName ?? '-'}</td><th>브랜드</th><td>{campaign?.brandName ?? '-'}</td></tr><tr><th>담당 매니저</th><td>{campaign?.managerName ?? '-'}</td><th>정산 상태</th><td>{request ? paymentStatusLabels[request.status] : '지급 대기'}</td></tr></tbody></table>
    <section className="manager-document__section"><h3>상품별 내부 정산표</h3><div className="settlement-work-table-wrap"><table className="seller-document__table manager-product-table"><thead><tr><th>상품명</th><th>구분</th><th>판매수량</th><th>공급가</th><th>공구가</th><th>총수수료율</th><th>상품당 수수료</th><th>판매 수수료</th><th>차감</th><th>비고</th></tr></thead><tbody>{rows.length ? rows.map((row) => {
      const snapshot = snapshots.find((item) => item.salePrice === row.unitPrice) ?? snapshots[0]
      const totalRate = snapshot?.totalCommissionRate ?? settlement.currentCalculation.totalCommissionRate
      const productAmount = calculateManagerProductRow(row, totalRate)
      const productName = campaign?.campaignProducts?.find((item) => item.productId === snapshot?.productId)?.productName ?? campaign?.productName ?? '-'
      return <tr key={row.id}><td>{productName}</td><td>{row.optionName}</td><td className="amount-cell">{productAmount.quantity.toLocaleString('ko-KR')}</td><td className="amount-cell">{money(productAmount.supplyPrice)}</td><td className="amount-cell">{money(row.unitPrice)}</td><td className="amount-cell">{totalRate}%</td><td className="amount-cell">{money(productAmount.unitCommission)}</td><td className="amount-cell">{money(productAmount.salesCommission)}</td><td className="amount-cell">-</td><td>{row.validationStatus === 'valid' ? '-' : row.validationMessage}</td></tr>
    }) : <tr><td colSpan={10}>SKU별 판매 데이터가 아직 연결되지 않았습니다.</td></tr>}</tbody></table></div></section>
    <section className="manager-document__section"><h3>정산 계산</h3><table className="seller-document__table manager-calculation-table"><tbody>
      <tr className="manager-calculation-total"><th>총수수료</th><td className="amount-cell">{money(settlement.currentCalculation.grossCommission)}</td></tr>
      <tr className="manager-calculation-deduction"><th>- 셀러 수수료</th><td className="amount-cell">- {money(settlement.currentCalculation.sellerCommissionAmount)}</td></tr>
      {preDistributionCosts.map((item) => <tr className="manager-calculation-deduction" key={item.id}><th>- {managerCostLabel(item)}{item.title && ` · ${item.title}`}</th><td className="amount-cell">- {money(item.amount)}</td></tr>)}
      {isSrookPayCampaign && <tr className={srookPayAmount && srookPayAmount > 0 ? 'manager-calculation-deduction' : undefined}><th>- 스룩페이 수수료</th><td className="amount-cell">{srookPayAmount === undefined ? '실제 비용 데이터 미연결' : `- ${money(srookPayAmount)}`}</td></tr>}
      <tr className="manager-distributable-row"><th>최종 배분 대상 수수료</th><td className="amount-cell">{money(settlement.currentCalculation.distributableVendorCommission)}</td></tr>
    </tbody></table></section>
    <section className="manager-document__section"><h3>수수료 배분</h3><table className="seller-document__table manager-allocation-table"><tbody><tr><th>최종 배분 대상 수수료</th><td className="amount-cell">{money(settlement.currentCalculation.distributableVendorCommission)}</td></tr><tr><th>매니저 배분율</th><td className="amount-cell">{settlement.currentCalculation.managerShareRate}%</td></tr><tr><th>매니저 배분액</th><td className="amount-cell">{money(report.managerBaseShare)}</td></tr><tr className="manager-company-reference"><th>회사 배분율</th><td className="amount-cell">{settlement.currentCalculation.companyShareRate}%</td></tr><tr className="manager-company-reference"><th>회사 귀속액</th><td className="amount-cell">{money(report.companyFinalContribution)}</td></tr></tbody></table></section>
    <section className="manager-document__section"><h3>매니저 최종 지급</h3><table className="seller-document__table"><tbody><tr><th>매니저 기본 배분액</th><td className="amount-cell">{money(report.managerBaseShare)}</td></tr>{report.managerDeductions.map((item) => <tr key={item.id}><th>{managerCostLabel(item)}</th><td className="amount-cell">- {money(item.amount)}</td></tr>)}<tr className="manager-final-row"><th>매니저 최종 정산금</th><td className="amount-cell">{money(report.managerFinalSettlement)}</td></tr><tr><th>증빙 유형 / 상태</th><td>{evidenceLabel} · {evidence.some((item) => item.reviewStatus === 'approved') ? '승인' : evidence.some((item) => item.reviewStatus === 'rejected') ? '반려' : evidence.length ? '검수 중' : '업로드 대기'}</td></tr>{tax && <tr><th>원천징수</th><td className="amount-cell">- {money(tax.totalWithholdingTaxAmount)}</td></tr>}<tr className="manager-final-row"><th>최종 입금액</th><td className="amount-cell">{money(request?.finalPaymentAmount ?? tax?.finalPaymentAmount ?? report.managerFinalSettlement)}</td></tr><tr><th>입금 예정일</th><td>{formatKoreanDate(settlement.paymentDueDate)}</td></tr></tbody></table></section>
    <section className="manager-document__section manager-payment-account"><h3>지급 계좌</h3><p><strong>{managerProfile?.bankName || '은행명 미등록'} / {managerProfile?.accountNumber || '계좌번호 미등록'} / {managerProfile?.accountHolder || '예금주명 미등록'}</strong></p></section>
    {exportGeneratedAt && <p className="seller-export-timestamp">이미지 생성: {exportGeneratedAt} (Asia/Seoul)</p>}
  </div></div>
}

function PaymentBlockReasons({ reasons }: { reasons: string[] }) {
  if (!reasons.length) return null
  return <div className="payment-action-blockers"><strong>지급 요청을 위해 다음 정보가 필요합니다.</strong><ul>{reasons.map((reason) => <li key={reason}>{reason}</li>)}</ul></div>
}

function ManagerDocumentActions({ blockReasons, onAccount, onCopy, onPreview, onPrint, onRequestPayment, onSave, paymentDisabled, paymentStatus }: { blockReasons: string[]; onAccount: () => void; onCopy: () => void; onPreview: () => void; onPrint: () => void; onRequestPayment: () => void; onSave: () => void; paymentDisabled: boolean; paymentStatus: string }) {
  return <div className="document-action-bar no-print"><span className="payment-recipient-status">{paymentStatus}</span><div className="action-row seller-document-actions"><button className="secondary-button" onClick={onPreview}>확대 보기</button><button className="secondary-button" onClick={onSave}>PNG 저장</button><button className="primary-button" onClick={onCopy}>이미지 복사</button><button className="secondary-button" onClick={onAccount}>계좌 등록</button><button className="text-button" onClick={onPrint}>인쇄</button><button className="primary-button" disabled={paymentDisabled} onClick={onRequestPayment} type="button">매니저 지급 요청</button></div>{blockReasons.length > 0 && <PaymentBlockReasons reasons={blockReasons} />}</div>
}

function SellerSettlementDocument({ exportGeneratedAt, rows, sellerDocumentRef, settlement }: { exportGeneratedAt: string; rows: SalesDataRow[]; sellerDocumentRef: RefObject<HTMLDivElement | null>; settlement: Settlement }) {
  const campaign = getCampaign(settlement)
  const sellerProfile = campaign ? sellerMasterService.getSellerById(campaign.sellerId) : undefined
  const salesImport = salesDataService.getSalesDataImportById(settlement.salesDataImportId)
  const deductions = settlementService.getDeductionsBySettlementId(settlement.id)
  const sellerRule = sellerSettlementService.getSellerSettlementRule(settlement.campaignId)
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
    { type: 'corporation', label: '법인/개인사업자', evidence: '세금계산서 발행금액', ...sellerDocumentPayout('general_business') },
    { type: 'simplified_business', label: '간이사업자', evidence: '현금영수증 발행금액', ...sellerDocumentPayout('simplified_business') },
    { type: 'freelancer', label: '개인 프리랜서', evidence: '3.3% 원천세 공제 후 입금액', ...sellerDocumentPayout('freelancer') },
  ] as const
  const statementDate = formatKoreanDocumentDate(settlement.createdAt)
  const schedule = getSellerSettlementSchedule(settlement.createdAt)
  const evidenceDeadline = formatKoreanDocumentDate(schedule.evidenceDeadline)
  const calculatedPaymentDate = formatKoreanDocumentDate(schedule.paymentDate)
  const evidenceName = sellerRule?.businessType === 'freelancer' ? '원천세 리스트 등록' : sellerRule?.businessType === 'simplified_business' ? '현금영수증 발행' : sellerRule ? '세금계산서 발행' : '데이터 미연결'
  const currentBusinessType = sellerRule?.businessType === 'corporation' || sellerRule?.businessType === 'general_business' ? 'corporation' : sellerRule?.businessType
  const currentBusinessAmount = businessAmounts.find((item) => item.type === currentBusinessType)
  const sellerBusinessLabel = currentBusinessAmount?.label ?? '사업자 유형 등록 정보 없음'
  const settlementAmount = businessAmounts[0].finalSellerPaymentAmount

  return (
    <div className="seller-document-shell">
      <div className="seller-document seller-statement" ref={sellerDocumentRef}>
        <header className="seller-document__header">
          <h2>[{companySettlementProfile.statementBrandName} 공동구매 정산서]</h2>
          <p><span>정산서 작성일</span><strong>{statementDate}</strong></p>
        </header>

        <table className="seller-document__table seller-document__meta-table"><tbody>
          <tr><th>공구기간</th><td>{formatKoreanDate(salesImport?.salesStartDate ?? campaign?.startDate)} ~ {formatKoreanDate(salesImport?.salesEndDate ?? campaign?.endDate)}</td></tr>
          <tr><th>진행 물품</th><td>{campaign ? `${campaign.sellerName} × ${campaign.productName}` : '-'}</td></tr>
          <tr><th>셀러명</th><td>{campaign?.sellerName ?? '-'}</td></tr>
          <tr><th>사업자명 / 유형</th><td>{sellerProfile?.businessName || '사업자명 미등록'} / {sellerBusinessLabel}</td></tr>
          <tr><th>담당 매니저</th><td>{campaign?.managerName ?? '데이터 미연결'}</td></tr>
        </tbody></table>

        <section className="seller-document__section seller-document__products"><h3>상품 정산표</h3><p className="seller-document__vat-notice">* 본 정산서의 금액은 부가세 포함 금액을 기준으로 합니다.</p>
        <table className="seller-document__table">
          <thead><tr><th>상품명</th><th>구분</th><th>판매수량</th><th>셀러 공급가</th><th>공구가</th><th>매출액</th><th>수수료율</th><th>수수료</th><th>비고</th></tr></thead>
          <tbody>
            {rows.length ? rows.map((row, index) => {
              const productAmount = calculateSellerProductRow(row, sellerRate)
              return <tr key={row.id}>
                <td>{index === 0 ? campaign?.productName ?? '-' : ''}</td>
                <td>{row.optionName}</td>
                <td className="amount-cell">{productAmount.quantity.toLocaleString('ko-KR')}</td>
                <td className="amount-cell">{money(productAmount.supplyPrice)}</td>
                <td className="amount-cell">{money(row.unitPrice)}</td>
                <td className="amount-cell">{money(productAmount.salesAmount)}</td>
                <td className="amount-cell">{settlement.currentCalculation.sellerCommissionRate}%</td>
                <td className="amount-cell">{money(productAmount.commissionAmount)}</td>
                <td>{row.validationStatus === 'valid' ? '' : row.validationMessage}</td>
              </tr>
            }) : <tr><td colSpan={9}>SKU별 판매 데이터가 아직 연결되지 않았습니다.</td></tr>}
          </tbody>
          <tfoot><tr className="seller-subtotal-row"><th colSpan={2}>판매 소계</th><td className="amount-cell">{productSubtotal.quantity.toLocaleString('ko-KR')}개</td><td className="amount-cell">{money(productSubtotal.supplyTotal)}</td><td></td><td className="amount-cell">{money(productSubtotal.salesAmount)}</td><td></td><td className="amount-cell">{money(productSubtotal.commissionAmount)}</td><td></td></tr></tfoot>
        </table></section>

        <SellerAdditionalCosts rows={displayCostRows} />

        <section className="seller-document__section seller-document__totals seller-compact-settlement"><h3>정산금액</h3><table className="seller-document__table"><tbody>
          <tr><th>총 판매수량</th><td className="amount-cell">{productSubtotal.quantity.toLocaleString('ko-KR')}개</td><th>총매출</th><td className="amount-cell">{money(productSubtotal.salesAmount)}</td></tr>
          <tr><th>셀러 수수료</th><td className="amount-cell">{money(productSubtotal.commissionAmount)}</td>{sellerDeductions > 0 ? <><th>추가 차감</th><td className="amount-cell seller-cost-deduction-cell">- {money(sellerDeductions)}</td></> : <><th>추가 지급</th><td className="amount-cell seller-positive-amount">{additionalPayments ? `+ ${money(additionalPayments)}` : '-'}</td></>}</tr>
          {sellerDeductions > 0 && additionalPayments > 0 && <tr><th>추가 지급</th><td className="amount-cell seller-positive-amount">+ {money(additionalPayments)}</td><td colSpan={2}></td></tr>}
          <tr className="seller-summary-total"><th colSpan={3}>정산금액 <small>(부가세 포함)</small></th><td className="amount-cell">{money(settlementAmount)}</td></tr>
        </tbody></table></section>

        <section className="seller-document__section seller-document__tax seller-business-payment"><h3>사업자 유형별 최종 입금액</h3><table className="seller-document__table"><thead><tr><th>구분</th><th>증빙 / 지급 기준</th><th>최종 입금액</th><th>적용</th></tr></thead><tbody>
          {businessAmounts.map((item) => <tr className={`seller-business-payment__${item.type} ${item.type === currentBusinessType ? 'is-current' : ''}`} key={item.type}><td>{item.label}</td><td>{item.evidence}</td><td className="amount-cell">{money(item.finalSellerPaymentAmount)}</td><td>{item.type === currentBusinessType ? '현재 적용' : '참고'}</td></tr>)}
        </tbody></table>{!currentBusinessAmount && <p className="seller-business-unregistered">현재 셀러 사업자 유형: 등록 정보 없음</p>}</section>

        <section className="seller-document__section seller-document__schedule seller-compact-schedule"><h3>증빙 및 입금 일정</h3><div className="seller-compact-schedule__dates"><p><span>필요 증빙</span><strong>{evidenceName}</strong></p><p><span>증빙 마감</span><strong>{evidenceDeadline}</strong></p><p className="seller-payment-date"><span>입금 예정</span><strong>{calculatedPaymentDate}</strong></p></div><p className="seller-compact-schedule__notice">금요일까지 필요한 증빙자료 전달 및 발행이 완료된 경우 기재된 입금 예정일에 입금됩니다. 입금 예정일이 휴일인 경우 다음 영업일에 지급됩니다.</p></section>

        <section className="seller-document__section seller-document__account seller-compact-account"><h3>지급 계좌</h3><p><strong>{sellerProfile?.bankName || '은행명 미등록'} / {sellerProfile?.accountNumber || '계좌번호 미등록'} / {sellerProfile?.accountHolder || '예금주명 미등록'}</strong></p></section>

        <footer className="seller-document__section seller-document__footer">
          <h3>회사 정보 / 정산 안내</h3>
          <table className="seller-document__table seller-company-table"><tbody><tr><th>회사명</th><td>{companySettlementProfile.legalName}</td><th>대표자</th><td>{companySettlementProfile.representativeName}</td></tr><tr><th>사업자등록번호</th><td>{companySettlementProfile.businessRegistrationNumber}</td><th>업태 / 종목</th><td>{companySettlementProfile.businessType} / {companySettlementProfile.businessItem}</td></tr><tr><th>주소</th><td colSpan={3}>{companySettlementProfile.businessAddress}</td></tr><tr><th>세금계산서 발행 메일</th><td colSpan={3}><a href={`mailto:${companySettlementProfile.taxInvoiceEmail}`}>{companySettlementProfile.taxInvoiceEmail}</a></td></tr><tr><th>회사 정산 계좌</th><td colSpan={3}>{companySettlementProfile.settlementBankName} {companySettlementProfile.settlementBankAccount} · 예금주 {companySettlementProfile.settlementAccountHolder}</td></tr></tbody></table>
          <div className="seller-document__notice"><p>본 정산서의 금액은 부가세 포함 금액을 기준으로 합니다. · {sellerBusinessLabel} 필요 증빙: {evidenceName}</p></div>
          {exportGeneratedAt && <p className="seller-export-timestamp">이미지 생성: {exportGeneratedAt} (Asia/Seoul)</p>}
        </footer>
      </div>
    </div>
  )
}

function SettlementDocumentActions({ blockReasons, onCopyImage, onCopyMessage, onCopyText, onPreview, onPrint, onRequestPayment, onSaveImage, paymentDisabled, paymentStatus }: { blockReasons: string[]; onCopyImage: () => void; onCopyMessage: () => void; onCopyText: () => void; onPreview: () => void; onPrint: () => void; onRequestPayment: () => void; onSaveImage: () => void; paymentDisabled: boolean; paymentStatus: string }) {
  return (
    <div className="document-action-bar no-print">
      <span className="payment-recipient-status">{paymentStatus}</span>
      <div className="action-row seller-document-actions"><button className="secondary-button" onClick={onPreview} type="button">확대 보기</button><button className="secondary-button" onClick={onSaveImage} type="button">PNG 저장</button><button className="primary-button" onClick={onCopyImage} type="button">이미지 복사</button><button className="secondary-button" onClick={onCopyText} type="button">정산 내용 복사</button><button className="secondary-button" onClick={onCopyMessage} type="button">전달 문구 복사</button><button className="text-button" onClick={onPrint} type="button">인쇄</button><button className="primary-button" disabled={paymentDisabled} onClick={onRequestPayment} type="button">셀러 지급 요청</button></div>
      {blockReasons.length > 0 && <PaymentBlockReasons reasons={blockReasons} />}
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

function SettlementStatusActions({ checklistDone, onHistory, onSetDocument, reviewReady, settlement, syncAction }: { checklistDone: boolean; onHistory: () => void; onSetDocument: () => void; reviewReady: boolean; settlement: Settlement; syncAction: (action: () => unknown) => void }) {
  if (settlement.status === 'draft') {
    return <><button className="primary-button" onClick={() => syncAction(() => settlementService.recalculateSettlement(settlement.id))} type="button">계산 실행</button><button className="secondary-button" disabled={!reviewReady} onClick={() => syncAction(() => settlementService.requestReview(settlement.id))} type="button">저장</button></>
  }
  if (settlement.status === 'review_pending') {
    return <><button className="secondary-button" onClick={() => syncAction(() => settlementService.recalculateSettlement(settlement.id, '수정 요청'))} type="button">수정 요청</button><button className="primary-button" disabled={!checklistDone} onClick={() => syncAction(() => settlementService.completeManagerReview(settlement.id))} type="button">매니저 검토 완료</button></>
  }
  if (settlement.status === 'manager_reviewed') {
    return <><button className="secondary-button" onClick={() => syncAction(() => settlementService.updateEvidence(settlement.id, 'confirmed', true, true))} type="button">증빙·계좌 확인</button><button className="primary-button" onClick={() => syncAction(() => settlementService.requestApproval(settlement.id))} type="button">대표 승인 요청</button></>
  }
  if (settlement.status === 'approval_pending') {
    return <><button className="secondary-button" onClick={() => syncAction(() => settlementService.recalculateSettlement(settlement.id, '반려'))} type="button">반려</button><button className="primary-button" onClick={() => syncAction(() => settlementService.approveSettlement(settlement.id))} type="button">대표 승인</button></>
  }
  if (settlement.status === 'approved') {
    return <button className="primary-button" onClick={() => syncAction(() => settlementService.markPaymentReady(settlement.id))} type="button">지급 준비</button>
  }
  if (settlement.status === 'payment_ready' || settlement.status === 'partially_paid') {
    return <><button className="secondary-button" onClick={() => syncAction(() => settlementService.markCompanySettlementCompleted(settlement.id))} type="button">업체 정산 완료</button><button className="primary-button" onClick={onHistory} type="button">지급 요청 상태 보기</button></>
  }
  if (settlement.status === 'completed') {
    return <><button className="primary-button" onClick={onSetDocument} type="button">정산서 보기</button><button className="secondary-button" onClick={onHistory} type="button">이력 보기</button></>
  }
  return <button className="primary-button" onClick={() => syncAction(() => settlementService.recalculateSettlement(settlement.id))} type="button">계산 실행</button>
}

function PaymentRequestEvidenceModal({ campaign, managerBusinessType, onClose, onRequested, ownerType, sellerBusinessType, settlement }: {
  campaign: NonNullable<ReturnType<typeof getCampaign>>
  managerBusinessType: SellerBusinessType
  onClose: () => void
  onRequested: () => void
  ownerType: EvidenceOwnerType
  sellerBusinessType: SellerBusinessType
  settlement: Settlement
}) {
  const [file, setFile] = useState<File | null>(null)
  const [memo, setMemo] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [previewUrl, setPreviewUrl] = useState('')
  const [withholdingConfirmed, setWithholdingConfirmed] = useState(false)
  const previewUrlRef = useRef('')
  const isSeller = ownerType === 'seller'
  const businessType = isSeller ? sellerBusinessType : managerBusinessType
  const ownerId = isSeller ? campaign.sellerId : campaign.managerId
  const ownerName = isSeller ? campaign.sellerName : campaign.managerName
  const evidenceType = paymentEvidenceService.getRecommendedEvidenceType(businessType) ?? 'withholding_entry'
  const evidenceName = evidenceType === 'tax_invoice' ? '세금계산서' : evidenceType === 'cash_receipt' ? '현금영수증' : '원천세 리스트'
  const withholding = withholdingTaxService.getBySettlementOwner(settlement.id, ownerType, ownerId).find((item) => item.sourceVersion === settlement.settlementVersion)
  const isFreelancer = businessType === 'freelancer'
  const amount = isFreelancer && withholding ? withholding.finalPaymentAmount : isSeller ? settlement.currentCalculation.finalSellerPaymentAmount : settlement.currentCalculation.managerAmount
  useEffect(() => () => { if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current) }, [])

  const selectEvidenceFile = (nextFile?: File | null) => {
    if (!nextFile) return
    if (!evidenceAllowedTypes.has(nextFile.type)) { setError('PNG, JPEG, WebP 또는 PDF 파일만 첨부할 수 있습니다.'); return }
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current)
    const nextPreviewUrl = evidenceImageTypes.has(nextFile.type) ? URL.createObjectURL(nextFile) : ''
    previewUrlRef.current = nextPreviewUrl
    setPreviewUrl(nextPreviewUrl)
    setError('')
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
      if (isFreelancer && !withholding) throw new Error(`${isSeller ? '셀러' : '매니저'} 원천세 리스트 등록 정보가 없습니다. 정산 확정 상태와 필수정보를 확인해주세요.`)
      if (isFreelancer && !withholdingConfirmed) throw new Error(`${isSeller ? '셀러' : '매니저'} 원천세 리스트 등록을 확인해주세요.`)
      let allowEvidencePending = false
      if (file) {
        const evidenceId = `evidence-${crypto.randomUUID()}`
        const stored = await paymentEvidenceStorageService.uploadEvidenceFile(file, { campaignId: campaign.id, settlementId: settlement.id, ownerType, ownerId, evidenceId })
        const evidence = paymentEvidenceService.uploadEvidenceMetadata({
          id: evidenceId, campaignId: campaign.id, settlementId: settlement.id, ownerType, ownerId, ownerName, businessType, evidenceType,
          fileName: file.name, fileType: file.type, fileSize: file.size, previewUrl: stored.previewUrl, storageBucket: stored.bucket,
          storagePath: stored.path, uploadedBy: '허수정', memo: memo.trim() || '정산 상세 지급 요청 업로드',
        })
        await paymentEvidenceService.saveEvidenceToProvider(evidence)
        paymentEvidenceService.requestEvidenceReview(evidence.id)
        allowEvidencePending = true
      }
      if (isSeller) paymentRequestService.createPaymentRequest(settlement.id, '허수정', { allowEvidencePending, memo })
      else paymentRequestService.createManagerPaymentRequest(settlement.id, '허수정', businessType, undefined, { allowEvidencePending, memo })
      onRequested()
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : '지급 요청을 저장하지 못했습니다.')
    } finally {
      setSubmitting(false)
    }
  }

  return <div className="settlement-modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
    <section aria-labelledby="payment-request-modal-title" aria-modal="true" className="settlement-modal payment-request-modal" role="dialog">
      <div className="preview-drawer__header"><div><p className="page-eyebrow">Payment Request</p><h2 id="payment-request-modal-title">{isSeller ? '셀러' : '매니저'} 지급 요청</h2></div><button aria-label="닫기" className="icon-button" onClick={onClose} type="button">×</button></div>
      <table className="payment-request-summary-table"><tbody><tr><th>지급 대상</th><td>{ownerName}</td></tr><tr><th>{isFreelancer ? (isSeller ? '최종 입금액' : '최종 지급액') : '지급 예정 금액'}</th><td className="amount-cell">{money(amount)}</td></tr><tr><th>사업자 유형</th><td>{businessTypeLabels[businessType]}</td></tr><tr><th>필요한 증빙 유형</th><td>{evidenceName}</td></tr>{isFreelancer && <><tr><th>정산금액</th><td className="amount-cell">{money(withholding?.grossSettlementAmount ?? 0)}</td></tr><tr><th>원천세 3.3%</th><td className="amount-cell">- {money(withholding?.totalWithholdingTaxAmount ?? 0)}</td></tr><tr><th>원천세 리스트</th><td>{withholding ? `등록 완료 · ${formatKoreanDateTimeCommon(withholding.createdAt)}` : '등록 정보 없음'}</td></tr></>}</tbody></table>
      {isFreelancer ? <label className="withholding-confirmation"><input checked={withholdingConfirmed} disabled={!withholding} onChange={(event) => setWithholdingConfirmed(event.target.checked)} type="checkbox" /><span>{isSeller ? '셀러' : '매니저'} 원천세 리스트 등록 확인</span></label> : <div className="payment-request-field"><span>증빙자료 업로드</span><div className="payment-evidence-dropzone" onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); selectEvidenceFile(event.dataTransfer.files[0]) }} onPaste={pasteEvidence} tabIndex={0}><label><input accept="image/png,image/jpeg,image/webp,application/pdf" onChange={(event) => selectEvidenceFile(event.target.files?.[0])} type="file" /><strong>파일 선택</strong></label><p>파일을 끌어놓거나 이미지를 여기에 붙여넣으세요.</p><small>Ctrl+V / Cmd+V · PNG, JPEG, WebP 또는 PDF · 최대 10MB</small></div>{file && <div className="payment-evidence-preview">{previewUrl ? <img alt="첨부 이미지 미리보기" src={previewUrl} /> : <span>{file.name}</span>}<button className="text-button" onClick={clearEvidenceFile} type="button">삭제</button></div>}</div>}
      <label className="payment-request-field"><span>메모</span><textarea onChange={(event) => setMemo(event.target.value)} placeholder="지급 요청 검토에 필요한 내용을 입력해주세요." rows={3} value={memo} /></label>
      {error && <p className="payment-request-error">{error}</p>}
      <div className="button-row"><button className="secondary-button" disabled={submitting} onClick={onClose} type="button">취소</button><button className="primary-button" disabled={submitting || (isFreelancer && (!withholding || !withholdingConfirmed))} onClick={submit} type="button">{submitting ? '지급 신청 중…' : '지급 신청'}</button></div>
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
