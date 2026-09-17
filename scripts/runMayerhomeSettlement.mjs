import assert from 'node:assert/strict'
import { calculateSettlement } from '../src/shared/utils/settlement.ts'

const salesImport = {
  id: 'sales-mayerhome-airgun-1', campaignId: 'campaign-mayerhome-airgun-1', fileName: 'srookpay.xlsx', fileSize: 0,
  sourceType: 'file', uploadedBy: 'test', uploadedAt: '2026-09-15', reviewStatus: '확정 완료', settlementStatus: '정산 가능',
  totalQuantity: 97, totalSalesAmount: 5_154_600, notes: '', totalCommissionRate: 30, sellerCommissionRate: 18,
  commissionCalculationType: 'campaign_total',
}
const rows = [{
  id: 'airgun-total', salesDataImportId: salesImport.id, campaignId: salesImport.campaignId, optionName: '윈드맥스 에어건 및 필터',
  quantity: 97, unitPrice: 0, grossSales: 5_154_600, canceledQuantity: 0, refundedQuantity: 0, netQuantity: 97,
  netSales: 5_154_600, validationStatus: 'valid', validationMessage: '이상 없음', totalCommissionRate: 30, sellerCommissionRate: 18,
}]
const base = { settlementId: 'settlement-mayerhome-airgun-1', campaignId: salesImport.campaignId, linkedData: 'fixture', evidenceStatus: 'confirmed', reflected: true, memo: '', createdAt: '2026-09-15', updatedAt: '2026-09-15' }
const deductions = [
  { ...base, id: 'sample', type: 'sample', title: '벤더 부담 샘플', amount: 106_750, costOwner: 'company', applyLocation: 'net_company_commission' },
  { ...base, id: 'srookpay', type: 'purchase', title: '스룩페이 결제 수수료', amount: 165_769, costOwner: 'company', applyLocation: 'net_company_commission' },
  { ...base, id: 'seller-event', type: 'event', title: 'HEPA 필터 25명', amount: 59_450, costOwner: 'seller', applyLocation: 'seller_payment' },
  { ...base, id: 'price-difference', type: 'promotion', title: '셀러·실제 공급가 차이', amount: 8_700, costOwner: 'company', applyLocation: 'net_company_commission_credit' },
]

const result = calculateSettlement(salesImport, rows, deductions, 'tax_invoice', '자동 테스트')
const checks = [
  ['셀러 수수료', result.sellerCommissionAmount, 927_828],
  ['셀러 차감', result.sellerDeductionTotal, 59_450],
  ['회사 가산 조정', result.companyAdjustmentCredit, 8_700],
  ['최종 배분 대상', result.distributableVendorCommission, 354_733],
  ['매니저 지급액 올림', result.managerAmount, 177_367],
]
for (const [label, actual, expected] of checks) {
  assert.equal(actual, expected, `${label}: ${actual} !== ${expected}`)
  console.log(`PASS ${label}: ${actual.toLocaleString('ko-KR')}원`)
}
console.log(`TOTAL ${checks.length}/${checks.length}`)
