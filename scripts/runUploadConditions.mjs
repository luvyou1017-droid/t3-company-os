import assert from 'node:assert/strict'
import * as XLSX from 'xlsx'
import { parseSalesDataFile, UnmatchedSalesPricesError } from '../src/shared/utils/salesDataFileParser.ts'
import { applyReviewedUpload, campaignChannel, captureUploadTerms, getUploadConditions } from '../src/shared/utils/uploadSettlementConditions.ts'
import { captureProposalSnapshots } from '../src/shared/services/campaignCreationService.ts'
import { campaignProductCatalogService } from '../src/shared/services/campaignProductCatalogService.ts'

const condition = { skuId: 'sku-a', productId: 'product-a', productName: '테스트 상품', optionName: '기본형', groupBuyPrice: 10000, totalCommissionRate: 30, sellerCommissionRate: 20 }
const catalog = [{ id: 'product-a', productName: '테스트 상품', totalCommissionRate: 25, sellerCommissionRate: 17,
  skus: [{ id: 'sku-a', optionName: '기본형', active: true, groupBuyPrice: 20000 }] }]
const campaign = { id: 'campaign', productId: 'product-a', salesChannelType: 'seller_checkout', proposalSnapshots: [{ skuConditions: [condition] }] }
const source = { id: 'source', campaignId: 'campaign', documentAuthor: 'supplier' }
function file(rows, name = '주문') {
  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(rows), name)
  return new File([XLSX.write(workbook, { bookType: 'xlsx', type: 'array' })], 'fixture.xlsx')
}
const orders = file([
  ['상품명', '옵션명', '수량', '주문상태'],
  ['테스트 상품', '기본형', 2, '배송완료'],
  ['테스트 상품', '기본형', 1, '결제대기'],
  ['테스트 상품', '기본형', 1, '취소완료'],
])
const conditions = getUploadConditions(catalog, campaign, source)
assert.equal(conditions.candidates[0].groupBuyPrice, 10000)
const parsed = await parseSalesDataFile(orders, source, conditions.candidates)
assert.equal(parsed.rows[0].skuId, 'sku-a')
assert.equal(parsed.rows[0].unitPrice, 10000)
assert.equal(parsed.rows[0].sellerCommissionRate, 20)
assert.equal(parsed.analysis.includedQuantity, 2)
const reviewed = applyReviewedUpload(parsed, parsed.rowsIncludingPending.map((row) => ({ ...row, unitPrice: 12000, agreedUnitPrice: 12000 })))
assert.equal(reviewed.analysis.includedGrossSales, 24000)
assert.equal(reviewed.analysis.pendingPaymentSales, 12000)
assert.equal(reviewed.analysis.sourceGrossSales, 48000)
const terms = captureUploadTerms(campaignChannel(campaign, source), reviewed.rows)
assert.equal(terms.moneyCollector, 'seller') // supplier-authored documents do not change the collector
const restored = JSON.parse(JSON.stringify({ ...source, settlementTerms: terms }))
catalog[0].skus[0].groupBuyPrice = 99999
const reloaded = getUploadConditions(catalog, campaign, restored)
assert.equal(reloaded.candidates[0].groupBuyPrice, 12000)
assert.equal((await parseSalesDataFile(orders, restored, reloaded.candidates)).rows[0].unitPrice, 12000)
assert.throws(() => captureUploadTerms('seller_checkout', [{ ...reviewed.rows[0], sellerCommissionRate: undefined }]), /수수료율/)
const unknown = file([['상품명', '옵션명', '수량'], ['테스트 상품', '새 옵션', 2]])
await assert.rejects(() => parseSalesDataFile(unknown, source, conditions.candidates), UnmatchedSalesPricesError)
const selected = await parseSalesDataFile(unknown, source, [{ ...condition, optionName: '새 옵션', confirmed: true }])
assert.equal(selected.rows[0].unitPrice, 10000)
assert.equal(selected.rows[0].skuId, 'sku-a')
const supply = file([
  ['품명', '판매수량', '개당 공급가', '총 공급가'],
  ['기본형', 2, 7000, 14000],
  ['택배비', 1, 3000, 3000],
  ['공급가 합계', '', '', 17000],
], '최종정산')
const supplied = await parseSalesDataFile(supply, source, conditions.candidates)
assert.equal(supplied.analysis.sourceDocumentType, 'supplier_dispatch')
assert.equal(supplied.analysis.supplyTotal, 14000)
assert.equal(supplied.analysis.includedGrossSales, 20000)
assert.equal(supplied.analysis.supplierShippingCost, 3000)
const sameOptions = file([['상품명', '옵션명', '수량', '판매금액'], ['상품 A', 'M', 1, 10000], ['상품 B', 'M', 1, 10000]])
const separate = await parseSalesDataFile(sameOptions, source, [
  { ...condition, skuId: 'a', productName: '상품 A', optionName: 'M', exactMatchOnly: true },
  { ...condition, skuId: 'b', productName: '상품 B', optionName: 'M', exactMatchOnly: true },
])
assert.equal(separate.rows.length, 2)
assert.deepEqual(separate.rows.map((row) => row.skuId), ['a', 'b'])
campaignProductCatalogService.registerProductMasters([{ ...catalog[0], active: true, version: 3, brandId: 'brand', brandName: '브랜드', shippingFee: 0, defaultSalesChannelType: 'supplier_link', supplierLinkPgPolicy: 'deduct_from_commission_rate', supplierLinkPgDeductionRate: 2 }])
const scheduled = captureProposalSnapshots([{ productId: 'product-a', productName: '테스트 상품' }], 1, 'supplier_link')[0]
assert.equal(scheduled.skuConditions[0].groupBuyPrice, 99999)
assert.equal(scheduled.skuConditions[0].totalCommissionRate, 23)
assert.equal(scheduled.skuConditions[0].sellerCommissionRate, 18)
assert.equal(condition.groupBuyPrice, 10000)
console.log('PASS campaign SKU snapshots, no-price SKU selection, condition persistence, supplier source separation, pending claims, supply-only sheets, and distinct products')
