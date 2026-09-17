import assert from 'node:assert/strict'
import * as XLSX from 'xlsx'
import { parseWiseProposalFile } from '../src/features/productMaster/utils/wiseProposalParser.ts'
import { reviewProposalRates } from '../src/features/productMaster/utils/proposalRateRepair.ts'

const header = ['상품명', '구성', '공구판매가', '총 매입가', '수수료', '총 수수료율']
const file = (rows, name = '셀러용') => {
  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(rows), name)
  return new File([XLSX.write(workbook, { type: 'array', bookType: 'xlsx' })], 'proposal.xlsx')
}
const parsed = await parseWiseProposalFile(file([['# 본사 네이버 스마트스토어 기준'], header, ['상품', '세트', 10000, 7800, .16, .22], ['# 백화점, 홈쇼핑 기준'], ['상품', '세트', 10000, 8700, .09, .13]]))
assert.deepEqual(parsed.rows.map(row => row['셀러 수수료율']), [16, 9])
assert.notEqual(parsed.rows[0]['구성명'], parsed.rows[1]['구성명'])
await assert.rejects(() => parseWiseProposalFile(file([header, ['상품', '세트', 10000, 7800, .16, .22]], '벤더용')), /셀러 수수료 열/)
await assert.rejects(() => parseWiseProposalFile(file([header, ['상품', '세트', 10000, 7800, null, .22]])), /비어/)
assert.equal((await parseWiseProposalFile(file([header, ['상품', '세트', 10000, 7800, 0, .22]]))).rows[0]['셀러 수수료율'], 0)
const evidence = [{source:'proposal.xlsx',product:'상품',option:'세트',sale:10000,supply:7800,rate:16}]
const product = {sourceFileName:'proposal.xlsx',productName:'상품',sellerCommissionRate:0,skus:[{id:'keep-id',productName:'상품',optionName:'세트',groupBuyPrice:10000,supplyPrice:7800,sellerCommissionRate:0,totalCommissionRate:22,active:true}]}
const fixed = reviewProposalRates(product,evidence)
assert.equal(fixed.product.skus[0].sellerCommissionRate,16)
assert.equal(fixed.product.skus[0].id,'keep-id')
assert.equal(fixed.product.sellerCommissionRate,16)
assert.equal(reviewProposalRates(fixed.product,evidence).changed,false)
assert.equal(reviewProposalRates({...product,sourceFileName:'another.xlsx'},evidence).changed,false)
assert.equal(reviewProposalRates(product,[{...evidence[0],supply:7900}]).changed,false)
assert.equal(reviewProposalRates({...product,sellerCommissionRate:18,skus:[{...product.skus[0],sellerCommissionRate:18}]},evidence).changed,false)
assert.equal(reviewProposalRates(product,[...evidence,{...evidence[0],rate:19}]).changed,false)
console.log('PASS seller/total separation, channel labels, missing vs explicit zero, exact-source repair, stable SKU IDs, conflict protection, repeat safety')
