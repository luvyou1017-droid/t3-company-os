import type {
  SellerBusinessType,
  SellerEvidenceType,
  SellerSettlementCalculation,
  SellerSettlementRule,
  SellerSettlementValidation,
  SellerSettlementItem,
} from '../types/sellerSettlement'
import { calculateWithholding } from './withholdingTax'

function amount(value: number, label: string) {
  if (!Number.isFinite(value) || Number.isNaN(value) || value < 0) throw new Error(`${label}은 0 이상의 유한한 숫자여야 합니다.`)
  return Math.round(value)
}

function rate(value: number, label: string) {
  if (!Number.isFinite(value) || Number.isNaN(value) || value < 0) throw new Error(`${label}은 0 이상의 숫자여야 합니다.`)
  return value
}

export const calculateProductSalesAmount = (items: Pick<SellerSettlementItem, 'unitPrice' | 'quantity'>[]) =>
  amount(items.reduce((sum, item) => sum + amount(item.unitPrice, '판매가') * amount(item.quantity, '판매수량'), 0), '상품 매출')
export const calculateShippingAmount = (value: number) => amount(value, '배송비')
export const calculateTotalCollectedAmount = (productSalesAmount: number, shippingAmount: number) =>
  amount(productSalesAmount, '상품 매출') + amount(shippingAmount, '배송비')
export const calculateEffectiveSellerCommissionRate = (sellerCommissionRate: number, externalMallExtraRate: number) =>
  rate(sellerCommissionRate, '셀러 기본 수수료율') + rate(externalMallExtraRate, '외부몰 추가 수수료율')
export const calculateTotalCommissionAmount = (productSalesAmount: number, totalCommissionRate: number) =>
  Math.round(amount(productSalesAmount, '상품 매출') * rate(totalCommissionRate, '총수수료율') / 100)
export const calculateSellerCommissionAmount = (productSalesAmount: number, effectiveSellerCommissionRate: number) =>
  Math.round(amount(productSalesAmount, '상품 매출') * rate(effectiveSellerCommissionRate, '최종 셀러 수수료율') / 100)
export const calculateVendorCommissionAmount = (totalCommissionAmount: number, sellerCommissionAmount: number) =>
  amount(amount(totalCommissionAmount, '총수수료') - amount(sellerCommissionAmount, '셀러 수수료'), '벤더 수수료')
export const calculateSupplierCostAmount = (productSalesAmount: number, totalCommissionAmount: number) =>
  amount(amount(productSalesAmount, '상품 매출') - amount(totalCommissionAmount, '총수수료'), '공급대금')
export const calculateSellerRemittanceToCompany = (productSalesAmount: number, sellerCommissionAmount: number, shippingAmount: number) =>
  amount(amount(productSalesAmount, '상품 매출') - amount(sellerCommissionAmount, '셀러 수수료') + amount(shippingAmount, '배송비'), '회사 입금 요청액')
export const calculateCompanyRemittanceToSupplier = (supplierCostAmount: number, shippingAmount: number) =>
  amount(supplierCostAmount, '공급대금') + amount(shippingAmount, '배송비')
export const calculateVatExcludedAmount = (grossAmount: number) => Math.round(amount(grossAmount, '부가세 포함 금액') / 1.1)
export const calculateWithholdingTax = (withholdingBaseAmount: number) =>
  calculateWithholding(amount(withholdingBaseAmount, '원천징수 기준 금액')).totalWithholdingTaxAmount

export function calculateFinalSellerPayment(gross: number, businessType: SellerBusinessType, deductions: number) {
  const grossAmount = amount(gross, '셀러 수수료')
  const deductionAmount = amount(deductions, '셀러 부담 차감')
  const vatExcludedAmount = calculateVatExcludedAmount(grossAmount)
  if (businessType === 'corporation' || businessType === 'general_business') {
    return { taxDocumentAmount: grossAmount, vatExcludedAmount, withholdingBaseAmount: 0, withholdingTaxAmount: 0, finalSellerPaymentAmount: amount(grossAmount - deductionAmount, '최종 지급액') }
  }
  if (businessType === 'simplified_business') {
    return { taxDocumentAmount: vatExcludedAmount, vatExcludedAmount, withholdingBaseAmount: 0, withholdingTaxAmount: 0, finalSellerPaymentAmount: amount(vatExcludedAmount - deductionAmount, '최종 지급액') }
  }
  const withholdingTaxAmount = calculateWithholding(grossAmount).totalWithholdingTaxAmount
  return { taxDocumentAmount: vatExcludedAmount, vatExcludedAmount, withholdingBaseAmount: vatExcludedAmount, withholdingTaxAmount, finalSellerPaymentAmount: amount(vatExcludedAmount - withholdingTaxAmount - deductionAmount, '최종 지급액') }
}

export const getRecommendedEvidenceType = (businessType: SellerBusinessType): SellerEvidenceType =>
  businessType === 'freelancer' ? 'withholding_3_3' : businessType === 'simplified_business' ? 'cash_receipt' : 'tax_invoice'

export const normalizeSellerBusinessType = (businessType?: SellerBusinessType): Exclude<SellerBusinessType, 'corporation'> | undefined =>
  businessType === 'corporation' || businessType === 'general_business' ? 'general_business' : businessType

export function reconcileSellerCheckoutFlow(calculation: Pick<SellerSettlementCalculation, 'sellerRemittanceToCompany' | 'companyRemittanceToSupplier' | 'vendorCommissionAmount'>) {
  return calculation.sellerRemittanceToCompany === calculation.companyRemittanceToSupplier + calculation.vendorCommissionAmount
}

export function validateSellerSettlement(rule: SellerSettlementRule, calculation: SellerSettlementCalculation): SellerSettlementValidation {
  const errors: string[] = []
  if (calculation.totalCommissionRate < calculation.effectiveSellerCommissionRate) errors.push('총수수료율은 최종 셀러 수수료율보다 낮을 수 없습니다.')
  if (rule.externalMallExtraRate > 0 && (!rule.externalMallExtraReason || !rule.externalMallExtraApprovedBy || !rule.externalMallExtraApprovedAt)) errors.push('외부몰 추가 수수료의 사유와 승인 정보를 입력해주세요.')
  for (const [label, value] of Object.entries(calculation)) if (typeof value === 'number' && (!Number.isFinite(value) || value < 0)) errors.push(`${label} 금액이 올바르지 않습니다.`)
  if (rule.salesChannelType === 'seller_checkout' && !reconcileSellerCheckoutFlow(calculation)) errors.push('셀러 결제창 돈의 흐름 합계가 일치하지 않습니다.')
  if (!rule.evidenceConfirmed || !rule.confirmedEvidenceType) errors.push('증빙 유형을 최종 확인해야 요청을 생성할 수 있습니다.')
  return { valid: errors.length === 0, errors }
}

export function runSellerSettlementAssertions() {
  const productSalesAmount = 3_136_000
  const shippingAmount = calculateShippingAmount(60_000)
  const totalCommissionAmount = calculateTotalCommissionAmount(productSalesAmount, 25)
  const effectiveSellerCommissionRate = calculateEffectiveSellerCommissionRate(17, 0)
  const sellerCommissionAmount = calculateSellerCommissionAmount(productSalesAmount, effectiveSellerCommissionRate)
  const vendorCommissionAmount = calculateVendorCommissionAmount(totalCommissionAmount, sellerCommissionAmount)
  const supplierCostAmount = calculateSupplierCostAmount(productSalesAmount, totalCommissionAmount)
  const sellerRemittanceToCompany = calculateSellerRemittanceToCompany(productSalesAmount, sellerCommissionAmount, shippingAmount)
  const companyRemittanceToSupplier = calculateCompanyRemittanceToSupplier(supplierCostAmount, shippingAmount)
  const extraRateSellerCommission = calculateSellerCommissionAmount(productSalesAmount, calculateEffectiveSellerCommissionRate(17, 3))
  const taxCases = (['corporation', 'general_business', 'simplified_business', 'freelancer'] as SellerBusinessType[])
    .map((businessType) => ({ businessType, ...calculateFinalSellerPayment(sellerCommissionAmount, businessType, 0) }))
  const checks = {
    totalCommissionAmount: totalCommissionAmount === 784_000,
    sellerCommissionAmount: sellerCommissionAmount === 533_120,
    vendorCommissionAmount: vendorCommissionAmount === 250_880,
    supplierCostAmount: supplierCostAmount === 2_352_000,
    sellerRemittanceToCompany: sellerRemittanceToCompany === 2_662_880,
    companyRemittanceToSupplier: companyRemittanceToSupplier === 2_412_000,
    reconciliation: sellerRemittanceToCompany - companyRemittanceToSupplier === vendorCommissionAmount,
    extraRate: extraRateSellerCommission === 627_200,
    taxCases: taxCases.length === 4 && taxCases.every((item) => item.finalSellerPaymentAmount >= 0),
  }
  return { passed: Object.values(checks).every(Boolean), checks, taxCases }
}
