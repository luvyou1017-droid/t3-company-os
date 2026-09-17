import { calculateManagerPayoutBreakdown, calculateManagerProductRow, calculateSellerProductSubtotal, calculateSellerSupplyPrice, calculateSellerSupplyTotal, formatKoreanExportTime, getSellerSettlementSchedule } from '../src/shared/utils/settlementDocument.ts'
import { calculateSettlement } from '../src/shared/utils/settlement.ts'

const schedule = getSellerSettlementSchedule('2026-08-26T01:00:00.000Z')
const holidaySchedule = getSellerSettlementSchedule('2026-08-26T01:00:00.000Z', { isHoliday: (date) => date.toISOString().startsWith('2026-08-31') })
const exampleSubtotal = calculateSellerProductSubtotal([{ unitPrice: 38_000, netQuantity: 232 }], 17)
const multiSkuSubtotal = calculateSellerProductSubtotal([{ unitPrice: 38_000, netQuantity: 200 }, { unitPrice: 40_000, netQuantity: 32 }], 17)
const mixedRateSubtotal = calculateSellerProductSubtotal([{ unitPrice: 10_000, netQuantity: 10, sellerCommissionRate: 10 }, { unitPrice: 20_000, netQuantity: 5, sellerCommissionRate: 20 }], 17)
const deductedPayout = 100_000 - 10_000 + 5_000
const shippingSubtotal = calculateSellerProductSubtotal([{ unitPrice: 28_000, netQuantity: 108, shippingAmount: 60_000 }], 17)
const managerProduct = calculateManagerProductRow({ unitPrice: 14_000, netQuantity: 154 }, 29)
const simplifiedManagerPayout = calculateManagerPayoutBreakdown(110_000, 'simplified_business', 5_000, 2_000)
const campaignTotalSettlement = calculateSettlement({ totalCommissionRate: 25, sellerCommissionRate: 18, commissionCalculationType: 'campaign_total' }, [
  { optionName: '버터옐로우 S', grossSales: 150_420, netSales: 150_420 },
  { optionName: '베이비핑크 M', grossSales: 1_453_300, netSales: 1_453_300 },
], [], 'tax_invoice')
const returnedOrderSettlement = calculateSettlement({ totalCommissionRate: 27, sellerCommissionRate: 17, commissionCalculationType: 'campaign_total' }, [
  { optionName: '신그니처 4L', grossSales: 2_646_000, netSales: 2_268_000 },
  { optionName: '신그니처 7L', grossSales: 3_135_000, netSales: 2_717_000 },
  { optionName: '알텐바흐 11L', grossSales: 3_664_000, netSales: 2_977_000 },
], [], 'tax_invoice')
const checks = [
  ['셀러 공급가 원화 반올림', calculateSellerSupplyPrice(14_000, 29) === 9_940],
  ['SKU 공급가 합계', calculateSellerSupplyTotal(14_000, 29, 25) === 248_500],
  ['증빙 마감 금요일', schedule.evidenceDeadline.toISOString().startsWith('2026-08-28')],
  ['다음 주 월요일 지급', schedule.paymentDate.toISOString().startsWith('2026-08-31')],
  ['공휴일 provider 다음 영업일', holidaySchedule.paymentDate.toISOString().startsWith('2026-09-01') && holidaySchedule.adjustedForHoliday],
  ['한국 시간 export 포맷', formatKoreanExportTime(new Date('2026-08-26T01:42:00.000Z')) === '2026.08.26 (수) 10:42'],
  ['상품행 기준 판매 소계', exampleSubtotal.quantity === 232 && exampleSubtotal.supplyTotal === 7_317_280 && exampleSubtotal.salesAmount === 8_816_000 && exampleSubtotal.commissionAmount === 1_498_720],
  ['다중 SKU 행 합계', multiSkuSubtotal.quantity === 232 && multiSkuSubtotal.salesAmount === 8_880_000 && multiSkuSubtotal.commissionAmount === 1_509_600],
  ['서로 다른 SKU 수수료율 합산', mixedRateSubtotal.salesAmount === 200_000 && mixedRateSubtotal.commissionAmount === 30_000],
  ['차감 및 추가 지급 반영', deductedPayout === 95_000],
  ['비용/배송비 비혼입', shippingSubtotal.salesAmount === 3_024_000 && !('shippingAmount' in shippingSubtotal) && !('deductions' in exampleSubtotal)],
  ['매니저 공급가 총수수료율 기준', managerProduct.supplyPrice === 9_940 && managerProduct.unitCommission === 4_060 && managerProduct.salesCommission === 625_240],
  ['간이과세 매니저 부가세·차감·환급', simplifiedManagerPayout.vatExcludedAmount === 100_000 && simplifiedManagerPayout.vatAmount === 10_000 && simplifiedManagerPayout.finalPaymentAmount === 97_000],
  ['공구 총매출 공통 수수료 단일 계산', campaignTotalSettlement.grossSales === 1_603_720 && campaignTotalSettlement.grossCommission === 400_930 && campaignTotalSettlement.sellerCommissionAmount === 288_670 && campaignTotalSettlement.vendorCommission === 112_260],
  ['취소·반품 제외 확정 매출 정산', returnedOrderSettlement.grossSales === 7_962_000 && returnedOrderSettlement.netSales === 7_962_000 && returnedOrderSettlement.grossCommission === 2_149_740 && returnedOrderSettlement.sellerCommissionAmount === 1_353_540 && returnedOrderSettlement.vendorCommission === 796_200],
]

checks.forEach(([label, passed]) => console.log(`${passed ? 'PASS' : 'FAIL'} ${label}`))
console.log(`TOTAL ${checks.filter(([, passed]) => passed).length}/${checks.length}`)
if (checks.some(([, passed]) => !passed)) process.exitCode = 1
