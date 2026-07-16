import type { SalesDataImport, SalesDataRow } from '../types/salesData'
import type {
  Settlement,
  SettlementCalculationSnapshot,
  SettlementCalculationStep,
  SettlementDeduction,
  SettlementStatus,
  SettlementValidationResult,
  SettlementVersion,
  SettlementVersionComparison,
} from '../types/settlement'

export type RevenueTier = 'under_10m' | 'under_20m' | 'over_20m'

const won = (value: number) => `₩${Math.round(value).toLocaleString('ko-KR')}`

const safeAmount = (value: number, label: string) => {
  if (!Number.isFinite(value) || Number.isNaN(value)) throw new Error(`${label} 값이 올바르지 않습니다.`)
  const rounded = Math.round(value)
  if (rounded < 0) throw new Error(`${label}은 음수일 수 없습니다.`)
  return rounded
}

const sum = (values: number[]) => values.reduce((total, value) => total + safeAmount(value, '금액'), 0)

export function getRevenueTier(grossSales: number): RevenueTier {
  const amount = safeAmount(grossSales, '총매출')
  if (amount < 10_000_000) return 'under_10m'
  if (amount < 20_000_000) return 'under_20m'
  return 'over_20m'
}

export function getShareRates(grossSales: number) {
  const tier = getRevenueTier(grossSales)
  if (tier === 'under_10m') return { tier, tierLabel: '1천만원 미만', managerRate: 50, companyRate: 50 }
  if (tier === 'under_20m') return { tier, tierLabel: '1천만원 이상 2천만원 미만', managerRate: 60, companyRate: 40 }
  return { tier, tierLabel: '2천만원 이상', managerRate: 70, companyRate: 30 }
}

export function calculateGrossCommission(netSales: number, commissionRate: number) {
  return safeAmount(netSales, '순매출') * (safeAmount(commissionRate, '셀러 수수료율') / 100)
}

export function calculateDeductions(deductions: SettlementDeduction[]) {
  const reflected = deductions.filter((item) => item.reflected)
  const companyDeductions = reflected.filter((item) => item.applyLocation === 'net_company_commission')
  const sellerDeductions = reflected.filter((item) => item.applyLocation === 'seller_payment')
  const managerDeductions = reflected.filter((item) => item.applyLocation === 'manager_payment')

  return {
    companyDeductions,
    sellerDeductions,
    managerDeductions,
    companyTotal: sum(companyDeductions.map((item) => item.amount)),
    sellerTotal: sum(sellerDeductions.map((item) => item.amount)),
    managerTotal: sum(managerDeductions.map((item) => item.amount)),
  }
}

export function calculateNetCompanyCommission(grossCommission: number, companyDeductionTotal: number) {
  return Math.max(safeAmount(grossCommission, '총수수료') - safeAmount(companyDeductionTotal, '회사 부담 차감 합계'), 0)
}

export function reconcileSplitAmounts(netCompanyCommission: number, managerRate: number, managerDeductionTotal = 0) {
  const base = safeAmount(netCompanyCommission, '회사 잔여 수수료')
  const managerBeforeDeduction = Math.round(base * (safeAmount(managerRate, '매니저 배분율') / 100))
  const managerAmount = Math.max(managerBeforeDeduction - safeAmount(managerDeductionTotal, '매니저 부담 비용'), 0)
  const companyAmount = base - managerAmount
  return { managerAmount, companyAmount }
}

export function calculateWithholdingTax(paymentTargetAmount: number) {
  return Math.round(safeAmount(paymentTargetAmount, '지급 대상 금액') * 0.033)
}

export function calculateSettlement(
  salesImport: SalesDataImport,
  rows: SalesDataRow[],
  deductions: SettlementDeduction[],
  taxType: Settlement['taxType'],
  calculatedBy = '시스템 자동 계산',
): SettlementCalculationSnapshot {
  const grossSales = safeAmount(rows.reduce((total, row) => total + row.grossSales, 0), '총매출')
  const netSales = safeAmount(rows.reduce((total, row) => total + row.netSales, 0), '순매출')
  const commissionRate = safeAmount(salesImport.commissionRate ?? 17, '셀러 수수료율')
  const grossCommission = safeAmount(calculateGrossCommission(netSales, commissionRate), '총수수료')
  const deductionTotals = calculateDeductions(deductions)
  const netCompanyCommission = calculateNetCompanyCommission(grossCommission, deductionTotals.companyTotal)
  const rates = getShareRates(grossSales)
  const split = reconcileSplitAmounts(netCompanyCommission, rates.managerRate, deductionTotals.managerTotal)
  const sellerPaymentAmount = Math.max(netSales - grossCommission - deductionTotals.sellerTotal, 0)
  const taxAmount = taxType === 'withholding_3_3' ? calculateWithholdingTax(split.managerAmount) : 0
  const finalPaymentAmount = Math.max(split.managerAmount - taxAmount, 0)

  return {
    grossSales,
    netSales,
    commissionRate,
    grossCommission,
    deductions,
    deductionTotal: deductionTotals.companyTotal + deductionTotals.sellerTotal + deductionTotals.managerTotal,
    sellerDeductionTotal: deductionTotals.sellerTotal,
    managerDeductionTotal: deductionTotals.managerTotal,
    netCompanyCommission,
    managerRate: rates.managerRate,
    companyRate: rates.companyRate,
    managerAmount: split.managerAmount,
    companyAmount: split.companyAmount,
    sellerPaymentAmount,
    taxAmount,
    finalPaymentAmount,
    calculatedAt: new Date().toISOString(),
    calculatedBy,
  }
}

export function validateSettlement(settlement: Settlement): SettlementValidationResult {
  const errors: string[] = []
  const warnings: string[] = []
  const snapshot = settlement.currentCalculation

  Object.entries(snapshot).forEach(([key, value]) => {
    if (typeof value === 'number' && (!Number.isFinite(value) || Number.isNaN(value))) errors.push(`${key} 계산값이 올바르지 않습니다.`)
    if (typeof value === 'number' && value < 0) errors.push(`${key} 계산값이 음수입니다.`)
  })

  if (snapshot.managerAmount + snapshot.companyAmount !== snapshot.netCompanyCommission) {
    errors.push('매니저 지급액과 회사 귀속액 합계가 회사 잔여 수수료와 일치하지 않습니다.')
  }

  if (snapshot.deductions.some((item) => item.costOwner === 'undecided')) errors.push('비용 부담자가 미정인 차감 항목이 있습니다.')
  if (settlement.evidenceStatus !== 'confirmed') warnings.push('증빙 확인이 완료되지 않았습니다.')
  if (settlement.hasSourceChanged) warnings.push('원본 데이터 변경으로 재검토가 필요합니다.')

  return { valid: errors.length === 0, errors, warnings }
}

export function createCalculationSteps(snapshot: SettlementCalculationSnapshot): SettlementCalculationStep[] {
  const now = snapshot.calculatedAt
  const rates = getShareRates(snapshot.grossSales)
  const companyDeductions = snapshot.deductions.filter((item) => item.reflected && item.applyLocation === 'net_company_commission')
  const sellerDeductions = snapshot.deductions.filter((item) => item.reflected && item.applyLocation === 'seller_payment')
  const managerDeductions = snapshot.deductions.filter((item) => item.reflected && item.applyLocation === 'manager_payment')
  const companyDeductionTotal = snapshot.deductionTotal - snapshot.sellerDeductionTotal - snapshot.managerDeductionTotal
  const step = (
    order: number,
    label: string,
    inputValues: string[],
    formula: string,
    result: number | string,
    source: string,
    modified = false,
  ): SettlementCalculationStep => ({ id: `calc-step-${order}`, order, label, inputValues, formula, result, source, modified, calculatedAt: now })

  return [
    step(1, '순매출', [won(snapshot.netSales)], '판매행 순매출 합계', snapshot.netSales, 'Sales Data 확정값'),
    step(2, '셀러 수수료율', [`${snapshot.commissionRate}%`], 'Campaign 또는 Sales Data 수수료율', `${snapshot.commissionRate}%`, 'Campaign 수수료율'),
    step(3, '총수수료', [won(snapshot.netSales), `${snapshot.commissionRate}%`], `${won(snapshot.netSales)} × ${snapshot.commissionRate}%`, snapshot.grossCommission, '시스템 자동 계산'),
    step(4, '회사 부담 차감', companyDeductions.map((item) => `${item.title} ${won(item.amount)}`), companyDeductions.length ? companyDeductions.map((item) => won(item.amount)).join(' + ') : '차감 없음', companyDeductionTotal, 'Sample 관리 / 이벤트 비용 수기 입력', companyDeductions.some((item) => item.memo.includes('수정'))),
    step(5, '회사 잔여 수수료', [won(snapshot.grossCommission), ...companyDeductions.map((item) => won(item.amount))], `${won(snapshot.grossCommission)} - ${companyDeductions.map((item) => won(item.amount)).join(' - ') || '0'}`, snapshot.netCompanyCommission, '시스템 자동 계산'),
    step(6, '매출 구간', [won(snapshot.grossSales)], '부가세 포함 총매출 기준', rates.tierLabel, 'Sales Data 확정값'),
    step(7, '배분율', [`매니저 ${snapshot.managerRate}%`, `회사 ${snapshot.companyRate}%`], '매출 구간별 배분율', `매니저 ${snapshot.managerRate}% / 회사 ${snapshot.companyRate}%`, '시스템 자동 계산'),
    step(8, '매니저 지급액', [won(snapshot.netCompanyCommission), `${snapshot.managerRate}%`, ...managerDeductions.map((item) => won(item.amount))], `Math.round(${won(snapshot.netCompanyCommission)} × ${snapshot.managerRate}%) - 매니저 부담 비용`, snapshot.managerAmount, '시스템 자동 계산'),
    step(9, '회사 귀속액', [won(snapshot.netCompanyCommission), won(snapshot.managerAmount)], `${won(snapshot.netCompanyCommission)} - ${won(snapshot.managerAmount)}`, snapshot.companyAmount, '시스템 차액 보정'),
    step(10, '셀러 지급액', [won(snapshot.netSales), won(snapshot.grossCommission), ...sellerDeductions.map((item) => won(item.amount))], `${won(snapshot.netSales)} - ${won(snapshot.grossCommission)} - 셀러 부담 비용`, snapshot.sellerPaymentAmount, '시스템 자동 계산'),
    step(11, '세금 및 실지급액', [won(snapshot.managerAmount), won(snapshot.taxAmount)], `원천징수 대상이면 ${won(snapshot.managerAmount)} × 3.3%`, snapshot.finalPaymentAmount, '세무 유형'),
  ]
}

export function compareSettlementVersions(before: SettlementVersion, after: SettlementVersion): SettlementVersionComparison[] {
  const pairs: Array<[string, keyof SettlementCalculationSnapshot]> = [
    ['총매출', 'grossSales'],
    ['수수료율', 'commissionRate'],
    ['총수수료', 'grossCommission'],
    ['차감 합계', 'deductionTotal'],
    ['회사 잔여 수수료', 'netCompanyCommission'],
    ['매니저 지급액', 'managerAmount'],
    ['회사 귀속액', 'companyAmount'],
    ['셀러 지급액', 'sellerPaymentAmount'],
    ['세금', 'taxAmount'],
    ['최종 실지급액', 'finalPaymentAmount'],
  ]

  return pairs.map(([label, key]) => {
    const beforeValue = Number(before.snapshot[key] ?? 0)
    const afterValue = Number(after.snapshot[key] ?? 0)
    return { label, before: beforeValue, after: afterValue, changed: beforeValue !== afterValue }
  })
}

export function canMoveToReview(settlement: Settlement, salesDataConfirmed: boolean) {
  const validation = validateSettlement(settlement)
  return salesDataConfirmed && validation.valid && !settlement.currentCalculation.deductions.some((item) => item.costOwner === 'undecided')
}

export function canMoveToApproval(settlement: Settlement) {
  const checklist = settlement.reviewChecklist
  const allChecklistDone = Object.values(checklist).every(Boolean)
  return settlement.status === 'manager_reviewed' && allChecklistDone && settlement.evidenceStatus === 'confirmed'
}

export function canMoveToPaymentReady(settlement: Settlement) {
  const taxEvidenceOk = settlement.taxType === 'withholding_3_3' || settlement.taxEvidenceConfirmed
  return settlement.status === 'approved' && settlement.accountConfirmed && taxEvidenceOk
}

export function isSettlementCompleted(settlement: Settlement) {
  return settlement.companySettlementCompleted && settlement.sellerPaymentCompleted && settlement.managerPaymentCompleted
}

export function runSettlementAssertions() {
  const boundaryResults = [
    getShareRates(9_999_999).managerRate === 50 && getShareRates(9_999_999).companyRate === 50,
    getShareRates(10_000_000).managerRate === 60 && getShareRates(10_000_000).companyRate === 40,
    getShareRates(19_999_999).managerRate === 60 && getShareRates(19_999_999).companyRate === 40,
    getShareRates(20_000_000).managerRate === 70 && getShareRates(20_000_000).companyRate === 30,
  ]
  const oddSplit = reconcileSplitAmounts(602_919, 50)
  const negativeRejected = (() => {
    try {
      getRevenueTier(-1)
      return false
    } catch {
      return true
    }
  })()

  return {
    passed: boundaryResults.every(Boolean) && oddSplit.managerAmount + oddSplit.companyAmount === 602_919 && negativeRejected,
    boundaryResults,
    oddSplit,
    negativeRejected,
  }
}

export function statusLabel(status: SettlementStatus) {
  const labels: Record<SettlementStatus, string> = {
    draft: '작성 중',
    calculating: '계산 중',
    review_pending: '검토 대기',
    revision_required: '수정 필요',
    manager_reviewed: '매니저 확인',
    approval_pending: '대표 승인 대기',
    approved: '승인 완료',
    payment_ready: '지급 준비',
    partially_paid: '일부 지급',
    completed: '최종 완료',
    canceled: '취소',
  }
  return labels[status]
}
