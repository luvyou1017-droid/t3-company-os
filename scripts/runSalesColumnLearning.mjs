import assert from 'node:assert/strict'
import { mapSalesSheet, findLearnedRule, headerSignature, suggestColumns } from '../src/shared/utils/salesColumnLearning.ts'
import { parseSalesDataFile } from '../src/shared/utils/salesDataFileParser.ts'

const sheet = { name: '판매 요약', rows: [['품목명', '판매개수', '공구가', '매출합', '취소개수', '반품개수'], ['A', 10, 10000, 100000, 2, 1], ['합 계', 10, null, 100000, 2, 1]] }
const suggested = suggestColumns(sheet.rows[0])
assert.equal(suggested.quantity, 1)
assert.equal(suggested.gross, undefined)
const mapping = { ...suggested, gross: 3 }
const file = mapSalesSheet(sheet, 0, mapping)
const parsed = await parseSalesDataFile(file, { id: 'test', campaignId: 'test' })
assert.equal(parsed.rows.length, 1)
assert.equal(parsed.rows[0].quantity, 10)
assert.equal(parsed.rows[0].canceledQuantity, 2)
assert.equal(parsed.rows[0].refundedQuantity, 1)
assert.equal(parsed.analysis.includedGrossSales, 70000)
const rules = [{ scope: 'supplier-a', signature: headerSignature(sheet.rows[0]), mapping, updatedAt: '' }]
assert.ok(findLearnedRule([sheet], 'supplier-a', rules))
assert.equal(findLearnedRule([sheet], 'supplier-b', rules), undefined)
assert.equal(findLearnedRule([{ ...sheet, rows: [['변경된 제목']] }], 'supplier-a', rules), undefined)
assert.throws(() => mapSalesSheet({ ...sheet, rows: [sheet.rows[0], ['A', 10, 10000, 90000, 0, 0]] }, 0, mapping), /다릅니다/)
assert.throws(() => mapSalesSheet(sheet, 0, { ...mapping, quantity: 0 }), /같은 열/)
assert.throws(() => mapSalesSheet({ ...sheet, rows: [sheet.rows[0], ['A', 10, 10000, 100000, 11, 0]] }, 0, mapping), /큽니다/)
assert.throws(() => mapSalesSheet({ ...sheet, rows: [sheet.rows[0], ['A', 10, 'not a price', 100000, 0, 0]] }, 0, mapping), /숫자/)
console.log('PASS synonyms, uncertain term, claim quantities, totals, supplier isolation, changed header, arithmetic mismatch and invalid mappings')
