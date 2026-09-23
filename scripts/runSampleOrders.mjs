import assert from 'node:assert/strict'
import { createServer } from 'vite'
import { createSampleOrder, inputMoney, reserveSampleExport, sampleCsv, sampleExportRows, sampleRecipientDefaults, sampleTotals, selectSampleSku, skuCostSnapshot, transitionSample, validateSampleDraft } from '../src/features/samples/sampleOrderModel.ts'
import XLSX from 'xlsx'

// Isolated fixtures only. No operational database reads/writes, no real orders.
const actor = { id: 'test-manager', name: '테스트 매니저' }
const at = '2026-09-20T01:00:00.000Z'
const sku = { id: 'existing-sku', productId: 'existing-product', active: true, optionName: '2단', optionValues: { 컬러: '베이지' }, supplyPrice: 22000,
  currentTradeTerms: { sellerSupplyPrice: 30000, companySupplyPrice: 22000 } }
const product = { id: 'existing-product', brandName: '미스더데코', productName: '빨래바구니', active: true, skus: [sku] }
const untouched = JSON.stringify(product)
const draft = { sellerId: 'test-seller', sellerName: '테스트 셀러', campaignId: 'other-campaign', campaignName: '다른 브랜드 공구',
  productId: '', skuId: '', brandName: '', productName: '', optionName: '', detailOption: '', quantity: 1,
  recipient: '테스트 수령인', phone: '010-0000-0000', address: '테스트 주소', purpose: '이벤트', deliveryMemo: '문 앞, "안전하게"', memo: '',
  payer: 'seller', supportType: 'full', supportAmount: null, costs: { sellerUnitPrice: null, companyUnitCost: null, source: 'sku', capturedAt: at } }
let checks = 0
function test(name, run) { run(); checks++; console.log(`PASS ${name}`) }
const chosen = selectSampleSku(draft, product, sku)
test('기존 SKU ID와 세부옵션, 다른 공구 브랜드 선택', () => {
  assert.equal(chosen.skuId, 'existing-sku'); assert.equal(chosen.detailOption, '컬러: 베이지'); assert.equal(chosen.campaignId, 'other-campaign')
  assert.equal(JSON.stringify(product), untouched)
})
test('빠른 등록 콜백과 같은 선택 경로로 신규 SKU 즉시 연결', () => {
  assert.equal(selectSampleSku(chosen, product, { ...sku, id: 'new-sku' }).skuId, 'new-sku')
})
test('30,000원 / 22,000원 → 차액 8,000원', () => {
  assert.deepEqual(sampleTotals(chosen), { companyCost: 22000, sellerDeduction: 30000, support: 0, companyBurden: 22000, difference: 8000 })
})
test('빈 가격과 legacy 0은 확인 필요, 명시적 0은 유지', () => {
  assert.equal(inputMoney(''), null)
  assert.equal(skuCostSnapshot({ ...sku, supplyPrice: 0, currentTradeTerms: undefined }).companyUnitCost, null)
  assert.equal(skuCostSnapshot({ ...sku, currentTradeTerms: { companySupplyPrice: 0, sellerSupplyPrice: 0 } }).companyUnitCost, 0)
  assert.equal(skuCostSnapshot({ ...sku, currentTradeTerms: undefined }).sellerUnitPrice, null)
})
test('부담주체별 비용 저장 / 전액·일부 지원', () => {
  for (const payer of ['seller', 'company', 'manager', 'supplier']) assert.equal(createSampleOrder({ ...chosen, payer }, actor, payer, at).payer, payer)
  assert.equal(sampleTotals({ ...chosen, payer: 'supplier' }).companyBurden, 0)
  assert.equal(sampleTotals({ ...chosen, payer: 'supplier', supportType: 'partial', supportAmount: 2000 }).companyBurden, 20000)
  assert.throws(() => validateSampleDraft({ ...chosen, payer: 'supplier', supportType: 'partial', supportAmount: 23000 }), /초과/)
})
test('수량·수령정보 필수 및 비용 미확인 승인 차단', () => {
  for (const quantity of [0, -1, 0.5, NaN]) assert.throws(() => validateSampleDraft({ ...chosen, quantity }))
  assert.throws(() => validateSampleDraft({ ...chosen, recipient: '' }))
  assert.throws(() => validateSampleDraft({ ...chosen, costs: { ...chosen.costs, companyUnitCost: null } }, true), /확인/)
})
let order = createSampleOrder(chosen, actor, 'SAMPLE-202609-test', at)
const immutable = JSON.stringify(order.costs)
test('요청 → 승인대기 → 발주대기, 이력 유지', () => {
  order = transitionSample(order, '승인대기', actor, at)
  order = transitionSample(order, '발주대기', actor, at)
  assert.equal(order.history.length, 3)
  assert.equal(order.settlementReflected, false)
  assert.throws(() => transitionSample(order, '발주완료', actor, at, '발주번호'), /파일 생성/)
})
let book = { schemaVersion: 1, orders: [order] }
test('파일 생성 후 같은 샘플 중복 Export 차단', () => {
  book = reserveSampleExport(book, [order.id], 'batch-1', actor, at)
  assert.equal(book.orders[0].status, '발주대기')
  assert.throws(() => reserveSampleExport(book, [order.id], 'batch-2', actor, at), /중복/)
  assert.throws(() => reserveSampleExport(book, [order.id, order.id], 'batch-2', actor, at), /중복/)
  assert.throws(() => reserveSampleExport(book, ['unknown'], 'batch-2', actor, at), /찾을/)
})
test('발주완료·배송·수령 상태 및 비용 Snapshot 불변', () => {
  order = transitionSample(book.orders[0], '발주완료', actor, at, 'TEST-ORDER')
  assert.throws(() => transitionSample(order, '발주완료', actor, at, 'TEST-ORDER'))
  order = transitionSample(order, '배송중', actor, at)
  order = transitionSample(order, '수령완료', actor, at)
  assert.equal(order.settlementReflected, false)
  assert.equal(JSON.stringify(order.costs), immutable)
})
test('CSV 헤더·인용부호·한글 BOM 및 수식 주입 방지', () => {
  const csv = sampleCsv([{ ...order, productName: '=HYPERLINK("evil")' }])
  assert.ok(csv.startsWith('\uFEFF'))
  assert.ok(csv.includes('주문/샘플 식별번호')); assert.ok(csv.includes("'=HYPERLINK")); assert.ok(csv.includes('""안전하게""'))
  assert.ok(csv.includes('010-0000-0000'))
})
test('셀러 수령정보 자동 채움 / 없는 정보는 공란', () => {
  assert.deepEqual(sampleRecipientDefaults({ realName: '테스트', contact: '01000000000', shippingAddress: '테스트 주소' }), { recipient: '테스트', phone: '01000000000', address: '테스트 주소' })
  assert.deepEqual(sampleRecipientDefaults(), { recipient: '', phone: '', address: '' })
})
test('Excel 실제 생성·재읽기 / 전화번호 0과 텍스트 유지', () => {
  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(sampleExportRows([{ ...order, phone: '01000000000', productName: '=1+1' }])), '내부 샘플 발주')
  const bytes = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' })
  const sheet = XLSX.read(bytes, { type: 'buffer' }).Sheets['내부 샘플 발주']
  assert.equal(sheet.F2.v, '01000000000'); assert.equal(sheet.F2.t, 's')
  assert.equal(sheet.B2.v, '=1+1'); assert.equal(sheet.B2.f, undefined)
  assert.equal(sheet.D2.v, 1)
})

const server = await createServer({ server: { middlewareMode: true }, appType: 'custom' })
try {
  const { makeSampleOrderStore } = await server.ssrLoadModule('/src/features/samples/sampleOrderStore.ts')
  let stored = { book: { schemaVersion: 1, orders: [] }, revision: null }
  const repo = {
    async read() { return structuredClone(stored) },
    async write(next, expected) {
      if (expected !== stored.revision) throw new Error('revision conflict')
      stored = { book: structuredClone(next), revision: (stored.revision ?? 0) + 1 }
      return structuredClone(stored)
    },
  }
  const store = makeSampleOrderStore(repo, async () => actor)
  await store.create(chosen, 'stable-id')
  await assert.rejects(store.create(chosen, 'stable-id'), /이미 저장/)
  await store.transition('stable-id', '요청', '승인대기')
  await store.transition('stable-id', '승인대기', '발주대기')
  const results = await Promise.allSettled([store.export(['stable-id']), store.export(['stable-id'])])
  assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1)
  assert.equal(results.filter((result) => result.status === 'rejected').length, 1)
  assert.equal(stored.book.orders.length, 1)
  assert.equal(stored.book.orders[0].history.filter((item) => item.action.startsWith('내부 발주파일')).length, 1)
  await assert.rejects(store.edit('stable-id', chosen, 1), /수정/)
  checks++; console.log('PASS 동시 Export CAS 한 번만 성공, 저장 재시도 중복 차단, 승인 후 수정 차단')
  assert.equal(JSON.stringify(product), untouched)
} finally { await server.close() }
console.log(`sample orders: ${checks} isolated checks passed (live-data/browser tests NOT run)`)
