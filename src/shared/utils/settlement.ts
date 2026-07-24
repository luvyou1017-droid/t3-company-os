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
import { truncateToTenWon } from './withholdingTax'

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

const safeRate = (value: number, label: string, allowZero = false) => {
  if (!Number.isFinite(value) || Number.isNaN(value)) throw new Error(`${label} 값이 올바르지 않습니다.`)
  if (allowZero ? value < 0 : value <= 0) throw new Error(`${label}이 올바르지 않습니다.`)
  return value
}

export function calculateGrossCommission(grossSales: number, totalCommissionRate: number) {
  return Math.round(safeAmount(grossSales, '총매출') * (safeRate(totalCommissionRate, '총수수료율') / 100))
}

export function calculateSellerCommissionAmount(grossSales: number, sellerCommissionRate: number) {
  return Math.round(safeAmount(grossSales, '총매출') * (safeRate(sellerCommissionRate, '셀러 수수료율', true) / 100))
}

export function calculateVendorCommission(grossCommission: number, sellerCommissionAmount: number) {
  const value = safeAmount(grossCommission, '총수수료') - safeAmount(sellerCommissionAmount, '셀러 수수료')
  if (value < 0) throw new Error('벤더 수수료는 음수일 수 없습니다.')
  return value
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
    companySampleTotal: sum(companyDeductions.filter((item) => item.type === 'sample').map((item) => item.amount)),
    companyEventTotal: sum(companyDeductions.filter((item) => item.type === 'event' || item.type === 'promotion').map((item) => item.amount)),
    companyOtherTotal: sum(companyDeductions.filter((item) => item.type !== 'sample' && item.type !== 'event' && item.type !== 'promotion').map((item) => item.amount)),
    companyTotal: sum(companyDeductions.map((item) => item.amount)),
    sellerTotal: sum(sellerDeductions.map((item) => item.amount)),
    managerTotal: sum(managerDeductions.map((item) => item.amount)),
  }
}

export function calculateDistributableVendorCommission(vendorCommission: number, companySampleDeduction: number, companyEventDeduction: number, companyOtherDeduction: number) {
  const value = safeAmount(vendorCommission, '벤더 수수료') - safeAmount(companySampleDeduction, '회사 부담 샘플비') - safeAmount(companyEventDeduction, '회사 부담 이벤트비') - safeAmount(companyOtherDeduction, '회사 부담 기타비용')
  if (value < 0) throw new Error('최종 배분 대상 금액은 음수일 수 없습니다.')
  return value
}

export function calculateManagerAmount(distributableVendorCommission: number, managerShareRate: number, managerDeduction = 0) {
  const base = safeAmount(distributableVendorCommission, '최종 배분 대상 금액')
  return Math.max(Math.round(base * (safeRate(managerShareRate, '매니저 배분율') / 100)) - safeAmount(managerDeduction, '매니저 부담 비용'), 0)
}

export function calculateCompanyAmount(distributableVendorCommission: number, managerAmount: number) {
  return safeAmount(distributableVendorCommission, '최종 배분 대상 금액') - safeAmount(managerAmount, '매니저 지급액')
}

export function calculateFinalSellerPaymentAmount(sellerCommissionAmount: number, sellerDeduction = 0, applicableTax = 0) {
  return Math.max(safeAmount(sellerCommissionAmount, '셀러 수수료') - safeAmount(sellerDeduction, '셀러 부담 차감') - safeAmount(applicableTax, '적용 세금'), 0)
}

export function calculateWithholdingTax(paymentTargetAmount: number) {
  const base = safeAmount(paymentTargetAmount, '지급 대상 금액')
  const incomeTax = truncateToTenWon(base * 0.03)
  const localIncomeTax = truncateToTenWon(base * 0.003)
  return incomeTax + localIncomeTax
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
  const totalCommissionRate = safeRate(salesImport.totalCommissionRate ?? 25, '총수수료율')
  const sellerCommissionRate = safeRate(salesImport.sellerCommissionRate ?? salesImport.commissionRate ?? 17, '셀러 수수료율', true)
  const grossCommission = calculateGrossCommission(grossSales, totalCommissionRate)
  const sellerCommissionAmount = calculateSellerCommissionAmount(grossSales, sellerCommissionRate)
  const vendorCommission = calculateVendorCommission(grossCommission, sellerCommissionAmount)
  const deductionTotals = calculateDeductions(deductions)
  const distributableVendorCommission = calculateDistributableVendorCommission(vendorCommission, deductionTotals.companySampleTotal, deductionTotals.companyEventTotal, deductionTotals.companyOtherTotal)
  const rates = getShareRates(grossSales)
  const managerAmount = calculateManagerAmount(distributableVendorCommission, rates.managerRate, deductionTotals.managerTotal)
  const companyAmount = calculateCompanyAmount(distributableVendorCommission, managerAmount)
  const sellerTaxBase = Math.max(sellerCommissionAmount - deductionTotals.sellerTotal, 0)
  const taxAmount = taxType === 'withholding_3_3' ? calculateWithholdingTax(sellerTaxBase) : 0
  const finalSellerPaymentAmount = calculateFinalSellerPaymentAmount(sellerCommissionAmount, deductionTotals.sellerTotal, taxAmount)

  return {
    grossSales,
    netSales,
    totalCommissionRate,
    sellerCommissionRate,
    commissionRate: sellerCommissionRate,
    grossCommission,
    sellerCommissionAmount,
    vendorCommission,
    deductions,
    deductionTotal: deductionTotals.companyTotal + deductionTotals.sellerTotal + deductionTotals.managerTotal,
    companySampleDeduction: deductionTotals.companySampleTotal,
    companyEventDeduction: deductionTotals.companyEventTotal,
    companyOtherDeduction: deductionTotals.companyOtherTotal,
    sellerDeduction: deductionTotals.sellerTotal,
    sellerDeductionTotal: deductionTotals.sellerTotal,
    managerDeduction: deductionTotals.managerTotal,
    managerDeductionTotal: deductionTotals.managerTotal,
    distributableVendorCommission,
    netCompanyCommission: distributableVendorCommission,
    managerShareRate: rates.managerRate,
    companyShareRate: rates.companyRate,
    managerRate: rates.managerRate,
    companyRate: rates.companyRate,
    managerAmount,
    companyAmount,
    finalSellerPaymentAmount,
    sellerPaymentAmount: finalSellerPaymentAmount,
    taxAmount,
    finalPaymentAmount: managerAmount,
    calculatedAt: new Date().toISOString(),
    calculatedBy,
  }
}

export function validateSettlementCalculation(snapshot: SettlementCalculationSnapshot): SettlementValidationResult {
  const errors: string[] = []
  const warnings: string[] = []

  Object.entries(snapshot).forEach(([key, value]) => {
    if (typeof value === 'number' && (!Number.isFinite(value) || Number.isNaN(value))) errors.push(`${key} 계산값이 올바르지 않습니다.`)
    if (typeof value === 'number' && value < 0) errors.push(`${key} 계산값이 음수입니다.`)
  })

  if (snapshot.totalCommissionRate <= 0) errors.push('총수수료율은 0보다 커야 합니다.')
  if (snapshot.sellerCommissionRate < 0) errors.push('셀러 수수료율은 음수일 수 없습니다.')
  if (snapshot.totalCommissionRate < snapshot.sellerCommissionRate) errors.push('총수수료율은 셀러 수수료율보다 낮을 수 없습니다.')
  if (snapshot.vendorCommission < 0) errors.push('벤더 수수료는 음수일 수 없습니다.')
  if (snapshot.distributableVendorCommission < 0) errors.push('최종 배분 대상 금액은 음수일 수 없습니다.')
  if (snapshot.grossCommission !== snapshot.sellerCommissionAmount + snapshot.vendorCommission) {
    errors.push('총수수료는 셀러 수수료와 벤더 수수료의 합과 일치해야 합니다.')
  }
  if (snapshot.vendorCommission !== snapshot.distributableVendorCommission + snapshot.companySampleDeduction + snapshot.companyEventDeduction + snapshot.companyOtherDeduction) {
    errors.push('벤더 수수료는 최종 배분 대상 금액과 회사 부담 비용 합계와 일치해야 합니다.')
  }
  if (snapshot.managerAmount + snapshot.companyAmount !== snapshot.distributableVendorCommission) {
    errors.push('매니저 지급액과 회사 귀속액 합계가 최종 배분 대상 금액과 일치하지 않습니다.')
  }

  return { valid: errors.length === 0, errors, warnings }
}

export function validateSettlement(settlement: Settlement): SettlementValidationResult {
  const result = validateSettlementCalculation(settlement.currentCalculation)
  const errors = [...result.errors]
  const warnings = [...result.warnings]

  const snapshot = settlement.currentCalculation
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
    step(1, '총매출', [won(snapshot.grossSales)], '판매행 총매출 합계', snapshot.grossSales, 'Sales Data 확정값'),
    step(2, '총수수료율', [`${snapshot.totalCommissionRate}%`], '브랜드사에서 회사가 받는 전체 수수료율', `${snapshot.totalCommissionRate}%`, 'Campaign 수수료율'),
    step(3, '총수수료', [won(snapshot.grossSales), `${snapshot.totalCommissionRate}%`], `${won(snapshot.grossSales)} × ${snapshot.totalCommissionRate}%`, snapshot.grossCommission, '시스템 자동 계산'),
    step(4, '셀러 수수료율', [`${snapshot.sellerCommissionRate}%`], '셀러에게 지급할 수수료율', `${snapshot.sellerCommissionRate}%`, 'Campaign 수수료율'),
    step(5, '셀러 지급액', [won(snapshot.grossSales), `${snapshot.sellerCommissionRate}%`, ...sellerDeductions.map((item) => won(item.amount))], `${won(snapshot.grossSales)} × ${snapshot.sellerCommissionRate}% - 셀러 부담 차감 - 적용 세금`, snapshot.finalSellerPaymentAmount, '시스템 자동 계산'),
    step(6, '셀러 지급 후 남은 벤더 수수료', [won(snapshot.grossCommission), won(snapshot.sellerCommissionAmount)], `${won(snapshot.grossCommission)} - ${won(snapshot.sellerCommissionAmount)}`, snapshot.vendorCommission, '시스템 자동 계산'),
    step(7, '회사 부담 샘플비', companyDeductions.filter((item) => item.type === 'sample').map((item) => `${item.title} ${won(item.amount)}`), '회사 부담 sample 차감 합계', snapshot.companySampleDeduction, 'Sample 관리', companyDeductions.some((item) => item.type === 'sample' && item.memo.includes('수정'))),
    step(8, '회사 부담 이벤트비', companyDeductions.filter((item) => item.type === 'event' || item.type === 'promotion').map((item) => `${item.title} ${won(item.amount)}`), '회사 부담 event/promotion 차감 합계', snapshot.companyEventDeduction, '이벤트 비용 수기 입력'),
    step(9, '회사 부담 기타비용', companyDeductions.filter((item) => item.type !== 'sample' && item.type !== 'event' && item.type !== 'promotion').map((item) => `${item.title} ${won(item.amount)}`), '회사 부담 기타 차감 합계', snapshot.companyOtherDeduction, '담당자 수정'),
    step(10, '최종 배분 대상 금액', [won(snapshot.vendorCommission), won(snapshot.companySampleDeduction), won(snapshot.companyEventDeduction), won(snapshot.companyOtherDeduction)], `${won(snapshot.vendorCommission)} - ${won(snapshot.companySampleDeduction)} - ${won(snapshot.companyEventDeduction)} - ${won(snapshot.companyOtherDeduction)}`, snapshot.distributableVendorCommission, '시스템 자동 계산'),
    step(11, '매출 구간', [won(snapshot.grossSales)], '부가세 포함 총매출 기준', rates.tierLabel, 'Sales Data 확정값'),
    step(12, '매니저 배분율', [`${snapshot.managerShareRate}%`], '매출 구간별 매니저 배분율', `${snapshot.managerShareRate}%`, '시스템 자동 계산'),
    step(13, '회사 배분율', [`${snapshot.companyShareRate}%`], '매출 구간별 회사 배분율', `${snapshot.companyShareRate}%`, '시스템 자동 계산'),
    step(14, '매니저 지급액', [won(snapshot.distributableVendorCommission), `${snapshot.managerShareRate}%`, ...managerDeductions.map((item) => won(item.amount))], `Math.round(${won(snapshot.distributableVendorCommission)} × ${snapshot.managerShareRate}%) - 매니저 부담 비용`, snapshot.managerAmount, '시스템 자동 계산'),
    step(15, '회사 귀속액', [won(snapshot.distributableVendorCommission), won(snapshot.managerAmount)], `${won(snapshot.distributableVendorCommission)} - ${won(snapshot.managerAmount)}`, snapshot.companyAmount, '시스템 차액 보정'),
  ]
}

export function compareSettlementVersions(before: SettlementVersion, after: SettlementVersion): SettlementVersionComparison[] {
  const pairs: Array<[string, keyof SettlementCalculationSnapshot]> = [
    ['총매출', 'grossSales'],
    ['총수수료율', 'totalCommissionRate'],
    ['셀러 수수료율', 'sellerCommissionRate'],
    ['총수수료', 'grossCommission'],
    ['셀러 수수료', 'sellerCommissionAmount'],
    ['벤더 수수료', 'vendorCommission'],
    ['차감 합계', 'deductionTotal'],
    ['최종 배분 대상 금액', 'distributableVendorCommission'],
    ['매니저 지급액', 'managerAmount'],
    ['회사 귀속액', 'companyAmount'],
    ['셀러 지급액', 'finalSellerPaymentAmount'],
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
  const oddManagerAmount = calculateManagerAmount(602_919, 50)
  const oddCompanyAmount = calculateCompanyAmount(602_919, oddManagerAmount)
  const exampleSnapshot: SettlementCalculationSnapshot = {
    grossSales: 3_136_000,
    netSales: 3_024_000,
    totalCommissionRate: 25,
    sellerCommissionRate: 17,
    commissionRate: 17,
    grossCommission: 784_000,
    sellerCommissionAmount: 533_120,
    vendorCommission: 250_880,
    deductions: [],
    deductionTotal: 112_000,
    companySampleDeduction: 112_000,
    companyEventDeduction: 0,
    companyOtherDeduction: 0,
    sellerDeduction: 0,
    sellerDeductionTotal: 0,
    managerDeduction: 0,
    managerDeductionTotal: 0,
    distributableVendorCommission: 138_880,
    netCompanyCommission: 138_880,
    managerShareRate: 50,
    companyShareRate: 50,
    managerRate: 50,
    companyRate: 50,
    managerAmount: 69_440,
    companyAmount: 69_440,
    finalSellerPaymentAmount: 533_120,
    sellerPaymentAmount: 533_120,
    taxAmount: 0,
    finalPaymentAmount: 69_440,
    calculatedAt: '2026-07-16T00:00:00.000Z',
    calculatedBy: '검증',
  }
  const exampleValidation = validateSettlementCalculation(exampleSnapshot)
  const negativeRejected = (() => {
    try {
      getRevenueTier(-1)
      return false
    } catch {
      return true
    }
  })()

  return {
    passed: boundaryResults.every(Boolean) && oddManagerAmount + oddCompanyAmount === 602_919 && exampleValidation.valid && negativeRejected,
    boundaryResults,
    oddSplit: { managerAmount: oddManagerAmount, companyAmount: oddCompanyAmount },
    exampleSnapshot,
    exampleValidation,
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
