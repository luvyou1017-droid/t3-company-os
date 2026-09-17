import assert from 'node:assert/strict'
import * as XLSX from 'xlsx'
import { parseSalesDataFile, UnmatchedSalesPricesError } from '../src/shared/utils/salesDataFileParser.ts'

const header = ['주문번호', '주문상품고유번호', '판매사상품명', '판매사옵션명', '주문수량', '결제금액']
const first = ['order1', 'item1', '치즈', '초록', 2, 0]
const last = ['order1', 'item2', '치즈', '노랑', 1, 0]
const summary = [
  ['일자', '품명', '판매수량', '개당 공급가', '총 공급가'],
  ['금요일', '초록', 2, 4000, 8000],
  ['', '택배비', 1, 3000, 3000],
  ['공급가 합계 (상품대 + 택배비)', '', '', '', 11000],
  ['일자', '품명', '판매수량', '개당 공급가', '총 공급가'],
  ['다음주 화요일', '노랑', 1, 5000, 5000],
  ['공급가 합계 (상품대 + 택배비)', '', '', '', 5000],
  ['최종 정산금액', '', '', '', 16000],
]
function file(second = last, report = summary) {
  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([header, first]), '금요일')
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([header, first, second]), '종료 후 화요일')
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(report), '최종정산')
  return new File([XLSX.write(workbook, { type: 'array', bookType: 'xlsx' })], 'dispatch.xlsx')
}
const campaign = { id: 'test', campaignId: 'test', salesEndDate: '2026-08-28' }
const prices = [
  { productName: '치즈', optionName: '초록', groupBuyPrice: 7000, confirmed: true },
  { productName: '치즈', optionName: '노랑', groupBuyPrice: 9000, confirmed: true },
]
const result = await parseSalesDataFile(file(), campaign, prices)
assert.equal(result.analysis.includedQuantity, 3)
assert.equal(result.analysis.includedGrossSales, 23000)
assert.equal(result.analysis.supplyTotal, 13000)
assert.equal(result.analysis.supplierShippingCost, 3000)
assert.equal(result.analysis.supplierPayableTotal, 16000)
assert.equal(result.analysis.includedShippingRevenue, 0)
assert.equal(result.analysis.dispatchSheets[1].duplicateRowCount, 1)
assert.equal(result.analysis.dispatchSheets[1].quantity, 1)
assert.equal(result.rows.length, 2)
await assert.rejects(() => parseSalesDataFile(file(), campaign), UnmatchedSalesPricesError)
await assert.rejects(() => parseSalesDataFile(file(['order1', 'item1', '치즈', '초록', 3, 0]), campaign, prices), /같은 상품주문번호/)
await assert.rejects(() => parseSalesDataFile(file(['order1', 'item2', '치즈', '노랑', 2, 0]), campaign, prices), /합산 수량/)
const badSummary = summary.map((row) => [...row]); badSummary[7][4] = 99999
await assert.rejects(() => parseSalesDataFile(file(last, badSummary), campaign, prices), /최종 합계/)
console.log('PASS daily sheets, final dispatch, distinct SKUs, duplicates, supply separation, missing prices, and reconciliation failures')
