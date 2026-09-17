import assert from 'node:assert/strict'
import * as XLSX from 'xlsx'
import { parseSalesDataFile } from '../src/shared/utils/salesDataFileParser.ts'
const book = XLSX.utils.book_new()
XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([
  ['상품명', '수량', '단가'], ['합계', 35, 0],
]), '거래명세서')
XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([
  ['상품(옵션)명', '정산명', '공구가', '공구금액', '공급금액', '합산', '주문수량', 'CS'],
  ['본품', '청소기', 198000, 4554000, 3506580, 23, 24, -1],
  ['부품', '어댑터', 39800, 437800, 337106, 11, 11, 0],
]), '집계')
const file = new File([XLSX.write(book, { type: 'array', bookType: 'xlsx' })], 'supplier.xlsx')
const parsed = await parseSalesDataFile(file, { id: 'fixture', campaignId: 'fixture' })
assert.equal(parsed.rows.length, 2)
assert.equal(parsed.rows.reduce((sum, row) => sum + row.netQuantity, 0), 34)
assert.equal(parsed.rows.reduce((sum, row) => sum + row.netSales, 0), 4991800)
assert.equal(parsed.analysis.sheetName, '집계')
assert.ok(parsed.analysis.warnings.some((text) => text.includes('3,843,686')))
console.log('PASS supplier summary, invoice exclusion, net claims, sale/supply separation')
