import * as XLSX from 'xlsx'
import { parseWiseProposalFile } from '../src/features/productMaster/utils/wiseProposalParser.ts'
import { parseSalesDataFile, shouldAskPendingPaymentPolicy } from '../src/shared/utils/salesDataFileParser.ts'
import { productSkuMatchScore } from '../src/shared/utils/productSkuMatching.ts'
import { sheetToRows } from '../src/shared/utils/spreadsheetRows.ts'

const workbook = XLSX.utils.book_new()
XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([
  ['상품명', '옵션정보', '수량', '옵션 판매가', '최종매출'],
  ['니트릴 고무장갑', '소프트블루 / M', 3, 3360, 9180],
]), '판매집계')
XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([
  ['주문번호', '상품주문번호', '상품명', '옵션정보', '주문상태', '옵션 판매가', '수량', '옵션별총액', '할인금액', '총주문금액'],
  ['order-1', 'item-1', '니트릴 고무장갑', '소프트블루 / M', '구매확정', 3360, 2, 6720, 0, 6720],
  ['order-2', 'item-2', '니트릴 고무장갑', '소프트블루 / M', '구매확정', 3360, 1, 3360, 300, 3060],
]), '판매현황')

const buffer = XLSX.write(workbook, { type: 'array', bookType: 'xlsx' })
const file = new File([buffer], 'marslabs-sales.xlsx', { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
const parsed = await parseSalesDataFile(file, { id: 'sales-test', campaignId: 'campaign-test' })

const supplierWorkbook = XLSX.utils.book_new()
XLSX.utils.book_append_sheet(supplierWorkbook, XLSX.utils.aoa_to_sheet([
  ['발생구분', '옵션명', '단가', '수량'],
  ['매출', '4L', 156870, 12],
  ['매출', '7L', 173470, 13],
  ['반품/취소', '7L', 173470, -1],
  ['매출', '11L', 190070, 15],
  ['반품/취소', '11L 별칭', 190070, -1],
]), '정산일반')
const supplierBuffer = XLSX.write(supplierWorkbook, { type: 'array', bookType: 'xlsx' })
const supplierParsed = await parseSalesDataFile(new File([supplierBuffer], 'supplier-settlement.xlsx'), {
  id: 'supplier-sales-test', campaignId: 'campaign-test', sellerCommissionRate: 17,
})

const srookpayWorkbook = XLSX.utils.book_new()
XLSX.utils.book_append_sheet(srookpayWorkbook, XLSX.utils.aoa_to_sheet([
  ['주문번호', '주문상태', '결제금액(통합)', '상품명', '고객선택옵션', '주문수량', '상품금액(옵션포함)'],
  ['order-1', '배송완료', 199000, '저압냄비', '4L', 1, 189000],
  ['order-2', '배송완료', 219000, '저압냄비', '7L', 1, 209000],
  ['order-3', '주문취소', 219000, '저압냄비', '7L', 1, 209000],
  ['order-4', '반품완료', 239000, '저압냄비', '11L', 1, 229000],
]), 'srookpay')
const srookpayBuffer = XLSX.write(srookpayWorkbook, { type: 'array', bookType: 'xlsx' })
const srookpayParsed = await parseSalesDataFile(new File([srookpayBuffer], 'srookpay-orders.xlsx'), { id: 'srookpay-test', campaignId: 'campaign-test' })

const orderLookupWorkbook = XLSX.utils.book_new()
XLSX.utils.book_append_sheet(orderLookupWorkbook, XLSX.utils.aoa_to_sheet([
  ['상품주문번호', '주문상태', '클레임상태', '상품명', '옵션정보', '수량'],
  ['item-1', '구매확정', '', '햄블 제주담은 수제 소시지 5종', '제주담은 소세지 5종: 3팩', 2],
  ['item-2', '취소', '취소완료', '햄블 제주담은 수제 소시지 5종', '제주담은 소세지 5종: 1팩', 1],
  ['item-3', '미결제취소', '취소완료', '햄블 제주담은 수제 소시지 5종', '제주담은 소세지 5종: 1팩', 1],
]), '주문조회')
const orderLookupBuffer = XLSX.write(orderLookupWorkbook, { type: 'array', bookType: 'xlsx' })
const orderLookupParsed = await parseSalesDataFile(
  new File([orderLookupBuffer], 'smartstore-orders.xlsx'),
  { id: 'smartstore-test', campaignId: 'campaign-test' },
  [
    { productName: '햄블 제주담은 수제 소시지 5종', optionName: '제주담은 소세지 5종: 3팩', groupBuyPrice: 39900 },
    { productName: '햄블 제주담은 수제 소시지 5종', optionName: '제주담은 소세지 5종: 1팩', groupBuyPrice: 14900 },
  ],
)

const embeddedPriceWorkbook = XLSX.utils.book_new()
XLSX.utils.book_append_sheet(embeddedPriceWorkbook, XLSX.utils.aoa_to_sheet([
  [null, null, '순번', '상품명', '판매수량', '단가', '수수료', '판매금액'],
  [null, null, 1, '⚡추가옵션⚡: 1. 오렌지컷 숏 본품', 8, 11900, 0.2, 95200],
  [null, null, 2, '옵션: 1. 락버튼마루세트(롱본체+마루리필1)', 18, 36500, 0.2, 657000],
  [null, null, '합계(VAT포함)', null, 26, null, null, 752200],
  [],
  ['업데이트일', '상품주문번호', '주문번호', '주문일시', '주문상태', '배송속성', '상품번호', '상품명', '옵션정보', '수량'],
  [915, 'item-1', 'order-1', '2026-08-23', '구매확정', '일반배송', 10800452403, '1. 오렌지컷 숏 본품', '⚡추가옵션⚡: 1. 오렌지컷 숏 본품', 8],
  [915, 'item-2', 'order-2', '2026-08-23', '구매확정', '일반배송', 10800452403, '고로고로 x 살림꼬마', '옵션: 1. 락버튼마루세트(롱본체+마루리필1)', 18],
]), 'Sheet1')
const embeddedPriceBuffer = XLSX.write(embeddedPriceWorkbook, { type: 'array', bookType: 'xlsx' })
const embeddedPriceParsed = await parseSalesDataFile(
  new File([embeddedPriceBuffer], 'embedded-price-summary.xlsx'),
  { id: 'embedded-price-test', campaignId: 'campaign-test' },
)

const finalSettlementWorkbook = XLSX.utils.book_new()
const finalSettlementSheet = XLSX.utils.aoa_to_sheet([
  [],
  ['진행상품명', '공동구매가', '판매\n수량', '총 판매금액'],
  ['클리닝 스탠드 기본형', 25500, 24, 612000],
  ['클리닝 스탠드 확장형', 26500, 101, 2676500],
  ['클리닝 스탠드용 바퀴', 3500, 88, 308000],
])
XLSX.utils.book_append_sheet(finalSettlementWorkbook, finalSettlementSheet, '정산확인서')
XLSX.utils.book_append_sheet(finalSettlementWorkbook, XLSX.utils.aoa_to_sheet([
  ['상품주문번호', '주문상태', '클레임상태', '상품명', '옵션정보', '수량'],
  ['item-1', '배송완료', '', '클리닝 스탠드', '옵션: 기본형', 30],
]), '주문조회')
const finalSettlementBuffer = XLSX.write(finalSettlementWorkbook, { type: 'array', bookType: 'xlsx' })
const finalSettlementParsed = await parseSalesDataFile(
  new File([finalSettlementBuffer], 'final-settlement.xlsx'),
  { id: 'final-settlement-test', campaignId: 'campaign-test' },
)
const oversizedRangeRows = sheetToRows({ A1: { t: 's', v: '제목' }, A63: { t: 's', v: '마지막 값' }, '!ref': 'A1:AI1048576' })

let missingOrderLookupPrices
try {
  await parseSalesDataFile(
    new File([orderLookupBuffer], 'smartstore-orders-missing-price.xlsx'),
    { id: 'smartstore-missing-price-test', campaignId: 'campaign-test' },
    [{ productName: '햄블 제주담은 수제 소시지 5종', optionName: '제주담은 소세지 5종: 3팩', groupBuyPrice: 39900 }],
  )
} catch (error) {
  missingOrderLookupPrices = error
}

const blankOptionSettlementWorkbook = XLSX.utils.book_new()
XLSX.utils.book_append_sheet(blankOptionSettlementWorkbook, XLSX.utils.aoa_to_sheet([
  ['상품주문번호', '주문상태', '수량클레임 여부', '상품명', '옵션정보', '판매옵션정보', '수량', '클레임상태', ' 판매가 '],
  ['item-1', '구매확정', 'N', '빈투움 길쭉담이 가로 수납장', '', '', 2, '', 57800],
  ['item-2', '배송완료', 'Y', '빈투움 길쭉담이 가로 수납장', '', '', 0, '반품', 28900],
]), '주문조회')
const blankOptionSettlementBuffer = XLSX.write(blankOptionSettlementWorkbook, { type: 'array', bookType: 'xlsx' })
const blankOptionSettlementParsed = await parseSalesDataFile(
  new File([blankOptionSettlementBuffer], 'blank-option-settlement.xlsx'),
  { id: 'blank-option-test', campaignId: 'campaign-test' },
)

const orderHubWorkbook = XLSX.utils.book_new()
XLSX.utils.book_append_sheet(orderHubWorkbook, XLSX.utils.aoa_to_sheet([
  ['주문번호', '판매사상품명', '주문수량', '결제금액'],
  ['order-1', '밀란이네 x 햄블 제주담은 수제 소시지 5종 ▶ 3팩', 2, 79800],
]), 'Supply')
const orderHubBuffer = XLSX.write(orderHubWorkbook, { type: 'array', bookType: 'xlsx' })
const orderHubParsed = await parseSalesDataFile(new File([orderHubBuffer], 'order-hub.xlsx'), { id: 'order-hub-test', campaignId: 'campaign-test' })

const discountedOrderHubWorkbook = XLSX.utils.book_new()
XLSX.utils.book_append_sheet(discountedOrderHubWorkbook, XLSX.utils.aoa_to_sheet([
  ['주문번호', '판매사상품명', '주문수량', '결제금액'],
  ['order-1', '밀란이네 x 햄블 제주담은 수제 소시지 5종 ▶ 제주담은 소세지 5종: (무료배송) 3+3팩 (1개)', 1, 72320],
]), 'Supply')
const discountedOrderHubBuffer = XLSX.write(discountedOrderHubWorkbook, { type: 'array', bookType: 'xlsx' })
const discountedOrderHubParsed = await parseSalesDataFile(
  new File([discountedOrderHubBuffer], 'discounted-order-hub.xlsx'),
  { id: 'discounted-order-hub-test', campaignId: 'campaign-test' },
  [
    { productName: '다른 상품', optionName: '3+3팩', groupBuyPrice: 99900 },
    { productName: '햄블 제주담은 수제 소시지 5종', optionName: '3+3팩', groupBuyPrice: 73800 },
  ],
)

const mixedOrderHubWorkbook = XLSX.utils.book_new()
XLSX.utils.book_append_sheet(mixedOrderHubWorkbook, XLSX.utils.aoa_to_sheet([
  ['주문번호', '판매사상품명', '주문수량', '결제금액'],
  ['order-1', '밀란이네 x 햄블 제주담은 수제 소시지 5종 ▶ 제주담은 소세지 5종: (무료배송) 3+3팩 (1개)', 14, 1033200],
  ['order-2', '밀란이네 x 햄블 제주담은 수제 소시지 5종 ▶ 제주담은 소세지 5종: 3팩 (1개)', 25, 922500],
  ['order-3', '밀란이네 x 햄블 제주담은 수제 소시지 5종 ▶ 제주담은 소세지 5종: (무료배송) 3+3팩 (1개)', 1, 72320],
  ['order-4', '밀란이네 x 햄블 제주담은 수제 소시지 5종 ▶ 제주담은 소세지 5종: 1팩 (2개)', 14, 180600],
  ['order-5', '밀란이네 x 햄블 제주담은 수제 소시지 5종 ▶ 제주담은 소세지 5종: 3팩 (1개)', 1, 35900],
  ['order-6', '밀란이네 x 햄블 제주담은 수제 소시지 5종 ▶ 제주담은 소세지 5종: 1팩 (1개)', 5, 64500],
  ['order-7', '밀란이네 x 햄블 제주담은 수제 소시지 5종 ▶ 제주담은 소세지 5종: 1팩 (4개)', 4, 51600],
]), 'Supply')
const mixedOrderHubBuffer = XLSX.write(mixedOrderHubWorkbook, { type: 'array', bookType: 'xlsx' })
const mixedOrderHubParsed = await parseSalesDataFile(
  new File([mixedOrderHubBuffer], 'mixed-order-hub.xlsx'),
  { id: 'mixed-order-hub-test', campaignId: 'campaign-test' },
  [
    { productName: '과거 연결 상품', optionName: '1팩', groupBuyPrice: 19900 },
    { productName: '햄블 제주담은 수제 소시지 5종', optionName: '1팩', groupBuyPrice: 12900 },
    { productName: '햄블 제주담은 수제 소시지 5종', optionName: '3팩', groupBuyPrice: 36900 },
    { productName: '햄블 제주담은 수제 소시지 5종', optionName: '3+3팩', groupBuyPrice: 73800 },
  ],
)

const proposalWorkbook = XLSX.utils.book_new()
XLSX.utils.book_append_sheet(proposalWorkbook, XLSX.utils.aoa_to_sheet([
  ['상품명', '구성', '공구판매가', '총 매입가', '수수료(vat포함)'],
  ['니트릴 고무장갑', '5개 이상 구매시 개당 가격', 3360, 2520, 0.18],
  ['', '10개 이상 구매시 개당 가격', 3060, 2295, 0.18],
]), '셀러용')
const proposalBuffer = XLSX.write(proposalWorkbook, { type: 'array', bookType: 'xlsx' })
const proposal = await parseWiseProposalFile(new File([proposalBuffer], 'brickglo-proposal.xlsx'))
const proposalTiers = proposal.rows.filter((row) => row['가격 적용 방식'] === '수량 구간')
const tierProduct = { productName: '니트릴 고무장갑', totalCommissionRate: 25 }
const tier3060 = { optionName: '10개 이상 구매시 개당 가격', productName: '니트릴 고무장갑', pricingType: 'quantity_tier', groupBuyPrice: 3060, supplyPrice: 2295 }
const tier3360 = { optionName: '5개 이상 구매시 개당 가격', productName: '니트릴 고무장갑', pricingType: 'quantity_tier', groupBuyPrice: 3360, supplyPrice: 2520 }
const coloredRow3060 = { optionName: '소프트블루 / M', unitPrice: 3060 }

const checks = [
  ['마르스랩스 판매현황 시트 인식', parsed.analysis.sheetName === '판매현황'],
  ['옵션 판매가 열 인식', parsed.analysis.detectedColumns.includes('옵션 판매가')],
  ['실제 사용한 금액 열 표시', parsed.analysis.detectedColumns.includes('총주문금액')],
  ['할인 후 총주문금액 우선', parsed.analysis.includedGrossSales === 9780],
  ['판매 수량 합계', parsed.analysis.includedQuantity === 3],
  ['동일 색상·사이즈도 실제 개당가로 분리', parsed.rows.length === 2 && parsed.rows.map((row) => row.unitPrice).sort((a, b) => a - b).join(',') === '3060,3360'],
  ['제안서 5~9개 가격 구간 인식', proposalTiers[0]?.['최소 수량'] === 5 && proposalTiers[0]?.['최대 수량'] === 9 && proposalTiers[0]?.['공구판매가'] === 3360],
  ['제안서 10개 이상 가격 구간 인식', proposalTiers[1]?.['최소 수량'] === 10 && proposalTiers[1]?.['최대 수량'] === 0 && proposalTiers[1]?.['공구판매가'] === 3060],
  ['색상·사이즈가 달라도 10개 이상 실단가 SKU 연결', productSkuMatchScore(coloredRow3060, tierProduct, tier3060, true) === 115],
  ['동일 상품의 다른 가격 구간은 연결하지 않음', productSkuMatchScore(coloredRow3060, tierProduct, tier3360, true) < 80],
  ['결제대기 없으면 선택 생략', shouldAskPendingPaymentPolicy(parsed.analysis) === false],
  ['결제대기 금액이 있으면 선택 표시', shouldAskPendingPaymentPolicy({ pendingPaymentQuantity: 1, pendingPaymentSales: 3360 }) === true],
  ['공급사 정산서 유형 인식', supplierParsed.analysis.sourceDocumentType === 'supplier_settlement'],
  ['공급사 음수 반품·취소 반영', supplierParsed.analysis.supplierSettlementAmount === 6625060 && supplierParsed.analysis.includedQuantity === 38],
  ['공급사 정산금에서 고객 순매출 역산', supplierParsed.analysis.includedGrossSales === 7982000],
  ['공급사 매출 총액과 취소 금액 분리', supplierParsed.analysis.sourceGrossSales === 8420000 && supplierParsed.analysis.excludedGrossSales === 438000],
  ['동일 가격의 다른 옵션명을 한 SKU로 합산', supplierParsed.rows.length === 3 && supplierParsed.rows.reduce((sum, row) => sum + row.quantity, 0) === 40],
  ['공급사 반품·취소를 판매행에 표시', supplierParsed.rows.reduce((sum, row) => sum + row.canceledQuantity, 0) === 2 && supplierParsed.rows.reduce((sum, row) => sum + row.netQuantity, 0) === 38],
  ['스룩페이 상품금액을 결제금액보다 우선', srookpayParsed.analysis.includedGrossSales === 398000],
  ['스룩페이 취소·반품을 판매행에 분리', srookpayParsed.rows.reduce((sum, row) => sum + row.canceledQuantity, 0) === 1 && srookpayParsed.rows.reduce((sum, row) => sum + row.refundedQuantity, 0) === 1],
  ['스룩페이 순매출 계산', srookpayParsed.rows.reduce((sum, row) => sum + row.netSales, 0) === 398000],
  ['스룩페이 배송비 매출 분리', srookpayParsed.analysis.includedShippingRevenue === 20000],
  ['발주모아 판매사상품명 인식', orderHubParsed.analysis.detectedColumns.includes('판매사상품명') && orderHubParsed.analysis.includedGrossSales === 79800],
  ['금액 없는 스마트스토어 주문조회는 상품 DB 공구가 적용', orderLookupParsed.analysis.includedGrossSales === 79800 && orderLookupParsed.rows[0]?.unitPrice === 39900],
  ['상단 옵션별 단가표를 하단 주문조회에 자동 적용', embeddedPriceParsed.analysis.includedQuantity === 26 && embeddedPriceParsed.analysis.includedGrossSales === 752200 && embeddedPriceParsed.rows.length === 2],
  ['상품 DB 가격으로 취소 주문 금액 계산', orderLookupParsed.analysis.excludedGrossSales === 29800 && orderLookupParsed.rows.reduce((sum, row) => sum + row.canceledQuantity, 0) === 2],
  ['최대 행 서식이 남은 최종 정산서도 실제 데이터 범위만 인식', finalSettlementParsed.analysis.sheetName === '정산확인서' && finalSettlementParsed.rows.length === 3],
  ['엑셀 최대 행 사용 범위는 실제 값이 있는 마지막 행까지만 제한', oversizedRangeRows.length === 63],
  ['최종 정산서 요약 수량과 총매출 우선 적용', finalSettlementParsed.analysis.includedQuantity === 213 && finalSettlementParsed.analysis.includedGrossSales === 3596500],
  ['미결제취소는 결제대기와 중복 집계하지 않음', orderLookupParsed.analysis.pendingPaymentQuantity === 0 && shouldAskPendingPaymentPolicy(orderLookupParsed.analysis) === false],
  ['판매가 없는 주문조회는 누락 옵션을 조용히 제외하지 않음', missingOrderLookupPrices instanceof Error && 'options' in missingOrderLookupPrices && missingOrderLookupPrices.options.length === 1 && missingOrderLookupPrices.options[0] === '제주담은 소세지 5종: 1팩'],
  ['공백이 포함된 판매가 열을 행 총액으로 인식', blankOptionSettlementParsed.analysis.includedGrossSales === 57800 && blankOptionSettlementParsed.rows[0]?.unitPrice === 28900],
  ['옵션값이 비어 있으면 상품명을 SKU명으로 사용', blankOptionSettlementParsed.rows[0]?.optionName === '빈투움 길쭉담이 가로 수납장'],
  ['수량 0 반품행은 이미 차감된 수량·매출에서 다시 차감하지 않음', blankOptionSettlementParsed.rows[0]?.refundedQuantity === 0 && blankOptionSettlementParsed.analysis.includedQuantity === 2 && blankOptionSettlementParsed.analysis.includedGrossSales === 57800],
  ['발주모아 네이버 할인은 정산 매출에서 제외', discountedOrderHubParsed.analysis.includedGrossSales === 73800],
  ['발주모아 상품명에서 옵션명 분리', discountedOrderHubParsed.rows[0]?.optionName === '제주담은 소세지 5종: (무료배송) 3+3팩'],
  ['발주모아 할인 전 매출 차이 안내', discountedOrderHubParsed.analysis.warnings.some((warning) => warning.includes('1,480원 높습니다'))],
  ['과거 일정 상품 ID와 무관하게 전체 DB의 짧은 옵션명 연결', mixedOrderHubParsed.rows.length === 3],
  ['발주모아 할인 전 3개 품목 판매수량 합계', mixedOrderHubParsed.analysis.includedQuantity === 64],
  ['발주모아 할인 전 3개 품목 총매출 합계', mixedOrderHubParsed.analysis.includedGrossSales === 2363100],
]

for (const [name, passed] of checks) console.log(`${passed ? 'PASS' : 'FAIL'} ${name}`)
console.log(`TOTAL ${checks.filter(([, passed]) => passed).length}/${checks.length}`)
if (checks.some(([, passed]) => !passed)) process.exitCode = 1
