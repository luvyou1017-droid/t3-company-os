class MemoryStorage {
  data = new Map()
  getItem(key) { return this.data.get(key) ?? null }
  setItem(key, value) { this.data.set(key, String(value)) }
  removeItem(key) { this.data.delete(key) }
}

globalThis.localStorage = new MemoryStorage()

const { createServer } = await import('vite')
const vite = await createServer({ configFile: false, server: { middlewareMode: true, hmr: false }, appType: 'custom' })
const { sellerMasterService } = await vite.ssrLoadModule('/src/shared/services/sellerMasterService.ts')
const { sellerSettlementService } = await vite.ssrLoadModule('/src/shared/services/sellerSettlementService.ts')
const { managerPaymentService } = await vite.ssrLoadModule('/src/shared/services/managerPaymentService.ts')
const { settlementService } = await vite.ssrLoadModule('/src/shared/services/settlementService.ts')
const { paymentRequestService } = await vite.ssrLoadModule('/src/shared/services/paymentRequestService.ts')
const { withholdingTaxService } = await vite.ssrLoadModule('/src/shared/services/withholdingTaxService.ts')
const { calculateWithholding } = await vite.ssrLoadModule('/src/shared/utils/withholdingTax.ts')
const { getRecommendedEvidenceType, normalizeSellerBusinessType } = await vite.ssrLoadModule('/src/shared/utils/sellerSettlement.ts')
const { STORAGE_KEYS, storageService } = await vite.ssrLoadModule('/src/shared/services/storageService.ts')

const sellerSaved = sellerMasterService.saveSellerProfile({
  id: 'seller-SCH-005', name: '헬시윤', businessName: '(주)헬시윤', businessType: 'simplified_business',
  defaultMdId: 'md-SCH-005', defaultManagerId: 'u-001', bankName: '국민은행', accountNumber: '123-456', accountHolder: '(주)헬시윤',
})
const sellerRead = sellerMasterService.getSellerById('seller-SCH-005')
storageService.setItem(STORAGE_KEYS.sellerSettlementRules, sellerSettlementService.getRules().filter((rule) => rule.campaignId !== 'SCH-009'))
sellerMasterService.saveSellerProfile({ id: 'seller-SCH-009', name: '라이프지수', businessName: '(주)라이프지수', businessType: 'general_business', defaultMdId: 'md-SCH-009', defaultManagerId: 'u-001' })
const premiumRule = sellerSettlementService.ensureSellerSettlementRule('SCH-009')
const premiumBusinessType = normalizeSellerBusinessType(sellerMasterService.getSellerById('seller-SCH-009')?.businessType)
const premiumEvidenceType = getRecommendedEvidenceType(premiumBusinessType)
sellerSettlementService.saveRule({ ...premiumRule, businessType: premiumBusinessType, recommendedEvidenceType: premiumEvidenceType, confirmedEvidenceType: premiumEvidenceType, evidenceConfirmed: true })
const refreshedPremiumRule = sellerSettlementService.getSellerSettlementRule('SCH-009')
const manager = managerPaymentService.getProfile('u-001')
const healthSettlement = settlementService.getSettlements().find((item) => item.campaignId === 'SCH-005')
if (!healthSettlement) throw new Error('건강식품 공동구매 정산 더미데이터가 없습니다.')

const approvedSettlements = settlementService.getSettlements().map((item) => ({ ...item, status: 'approved', accountConfirmed: true }))
storageService.setItem(STORAGE_KEYS.settlements, approvedSettlements)
const approvedHealth = settlementService.getSettlementById(healthSettlement.id)
const healthTax = calculateWithholding(approvedHealth.currentCalculation.managerAmount + approvedHealth.currentCalculation.managerDeductionTotal, approvedHealth.currentCalculation.managerDeductionTotal)
const beforeRequests = paymentRequestService.getPaymentRequests().length
const request = paymentRequestService.createManagerPaymentRequest(approvedHealth.id, '테스트', manager.businessType, undefined, { accountConfirmed: true })
const afterRequests = paymentRequestService.getPaymentRequests().length
const taxItemsAfterRequest = withholdingTaxService.getBySettlementOwner(approvedHealth.id, 'manager', 'u-001')
withholdingTaxService.upsert({ settlementId: approvedHealth.id, ownerType: 'manager', ownerId: 'u-001', ownerName: '허윤정', grossSettlementAmount: 69_440, deductions: 0, sourceVersion: approvedHealth.settlementVersion })
const taxItemsAfterRepeat = withholdingTaxService.getBySettlementOwner(approvedHealth.id, 'manager', 'u-001')

const failureSettlement = { ...approvedHealth, id: `${approvedHealth.id}-failure`, settlementVersion: approvedHealth.settlementVersion + 1 }
storageService.setItem(STORAGE_KEYS.settlements, [...settlementService.getSettlements(), failureSettlement])
const originalUpsert = withholdingTaxService.upsert
const requestsBeforeFailure = paymentRequestService.getPaymentRequests().length
withholdingTaxService.upsert = () => { throw new Error('원천세 저장 실패') }
let failureBlocked = false
let failureMessage = ''
try {
  paymentRequestService.createManagerPaymentRequest(failureSettlement.id, '테스트', 'freelancer', undefined, { accountConfirmed: true })
} catch (error) { failureMessage = error instanceof Error ? error.message : ''; failureBlocked = failureMessage === '원천세 등록에 실패했습니다. 지급 요청은 생성되지 않았습니다.' && paymentRequestService.getPaymentRequests().length === requestsBeforeFailure }
withholdingTaxService.upsert = originalUpsert

const duplicateBlocked = (() => {
  try { paymentRequestService.createManagerPaymentRequest(approvedHealth.id, '테스트', manager.businessType, undefined, { accountConfirmed: true }); return false }
  catch (error) { return error instanceof Error && error.message.includes('이미 지급 요청이 생성되어 있습니다.') }
})()

const checks = [
  ['셀러명/사업자명 독립 저장', sellerSaved.name === '헬시윤' && sellerRead.businessName === '(주)헬시윤'],
  ['셀러 사업자 유형 저장', sellerRead.businessType === 'simplified_business'],
  ['프리미엄 침구 Master/정산 규칙 동기화', premiumBusinessType === 'general_business' && refreshedPremiumRule?.businessType === 'general_business'],
  ['프리미엄 침구 증빙 유형 자동 결정', refreshedPremiumRule?.confirmedEvidenceType === 'tax_invoice' && refreshedPremiumRule.evidenceConfirmed],
  ['사업자 유형 공통 normalization', normalizeSellerBusinessType('corporation') === 'general_business'],
  ['Manager Master 사업자 유형', manager?.businessType === 'freelancer' && managerPaymentService.getBusinessType('허윤정') === 'freelancer'],
  ['건강식품 VAT 포함 배분금액', healthTax.grossSettlementAmount === 69_440],
  ['건강식품 원천세 계산', healthTax.withholdingBaseAmount === 63_127 && healthTax.incomeTaxAmount === 1_890 && healthTax.localIncomeTaxAmount === 180 && healthTax.finalPaymentAmount === 61_057],
  ['지급 요청 최종액 일치', request.finalPaymentAmount === healthTax.finalPaymentAmount],
  ['원천세 선등록 후 지급 요청 생성', taxItemsAfterRequest.length === 1 && afterRequests === beforeRequests + 1 && request.status === 'approval_pending'],
  ['원천세 중복 등록 방지', taxItemsAfterRepeat.length === 1 && taxItemsAfterRepeat[0].id === taxItemsAfterRequest[0].id],
  ['지급 요청 중복 생성 방지', duplicateBlocked],
  [`원천세 등록 실패 시 지급 요청 미생성${failureMessage ? ` · ${failureMessage}` : ''}`, failureBlocked],
]

checks.forEach(([label, passed]) => console.log(`${passed ? 'PASS' : 'FAIL'} ${label}`))
console.log(`TOTAL ${checks.filter(([, passed]) => passed).length}/${checks.length}`)
if (checks.some(([, passed]) => !passed)) process.exitCode = 1
await vite.close()
