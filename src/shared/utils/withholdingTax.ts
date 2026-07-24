import type { WithholdingCalculation } from '../types/withholdingTax'

export function truncateToTenWon(value: number) {
  if (!Number.isFinite(value)) throw new Error('절사할 금액은 유한한 숫자여야 합니다.')
  const integerAmount = Math.trunc(value)
  return Math.trunc(integerAmount / 10) * 10
}

export function calculateWithholding(grossSettlementAmount: number, deductions = 0): WithholdingCalculation {
  const gross = Math.round(grossSettlementAmount)
  const deductionAmount = Math.round(deductions)
  const withholdingBaseAmount = Math.round(gross / 1.1)
  const incomeTaxRaw = withholdingBaseAmount * 0.03
  const incomeTaxAmount = truncateToTenWon(incomeTaxRaw)
  const localIncomeTaxRaw = withholdingBaseAmount * 0.003
  const localIncomeTaxAmount = truncateToTenWon(localIncomeTaxRaw)
  const totalWithholdingTaxAmount = incomeTaxAmount + localIncomeTaxAmount
  const finalPaymentAmount = withholdingBaseAmount - totalWithholdingTaxAmount - deductionAmount
  return {
    grossSettlementAmount: gross,
    withholdingBaseAmount,
    incomeTaxRate: 3,
    incomeTaxAmount,
    localIncomeTaxRate: 0.3,
    localIncomeTaxAmount,
    totalWithholdingTaxAmount,
    finalPaymentAmount,
    deductions: deductionAmount,
    log: [
      `부가세 제외 기준금액 = Math.round(${gross.toLocaleString('ko-KR')} / 1.1) = ${withholdingBaseAmount.toLocaleString('ko-KR')}원`,
      `소득세 3% = truncateToTenWon(${withholdingBaseAmount.toLocaleString('ko-KR')} × 0.03 = ${incomeTaxRaw}) = ${incomeTaxAmount.toLocaleString('ko-KR')}원`,
      `지방소득세 0.3% = truncateToTenWon(${withholdingBaseAmount.toLocaleString('ko-KR')} × 0.003 = ${localIncomeTaxRaw}) = ${localIncomeTaxAmount.toLocaleString('ko-KR')}원`,
      `총 원천징수액 = ${incomeTaxAmount.toLocaleString('ko-KR')} + ${localIncomeTaxAmount.toLocaleString('ko-KR')} = ${totalWithholdingTaxAmount.toLocaleString('ko-KR')}원`,
      `최종 지급액 = ${withholdingBaseAmount.toLocaleString('ko-KR')} - ${totalWithholdingTaxAmount.toLocaleString('ko-KR')} - ${deductionAmount.toLocaleString('ko-KR')} = ${finalPaymentAmount.toLocaleString('ko-KR')}원`,
    ],
  }
}

export function runWithholdingAssertions() {
  const calculation = calculateWithholding(533_120)
  const checks = {
    base: calculation.withholdingBaseAmount === 484_655,
    incomeTax: calculation.incomeTaxAmount === 14_530,
    localIncomeTax: calculation.localIncomeTaxAmount === 1_450,
    totalTax: calculation.totalWithholdingTaxAmount === 15_980,
    finalPayment: calculation.finalPaymentAmount === 468_675,
  }
  return { passed: Object.values(checks).every(Boolean), checks, calculation }
}
