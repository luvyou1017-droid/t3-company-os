import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { basename } from 'node:path'
import { createServer } from 'vite'
const path = process.argv[2]
if (!path) throw new Error('Pass a real proposal .xlsx path')
const server = await createServer({ configFile: false, server: { middlewareMode: true, hmr: false }, appType: 'custom' })
try {
  const { parseWiseProposalFile, inferProposalProductName } = await server.ssrLoadModule('/src/features/productMaster/utils/wiseProposalParser.ts')
  const { reviewCandidate, reviewBatch, applyReviewed, buildInput } = await server.ssrLoadModule('/src/features/productMaster/utils/proposalImportReview.ts')
  const file = new File([await readFile(path)], basename(path))
  const parsed = await parseWiseProposalFile(file)
  const candidate = { key: 'real', fileName: file.name, productName: inferProposalProductName(parsed.rows, file.name), rows: parsed.rows, metadata: parsed.metadata }
  const materialize = (input, id = 'existing-product') => ({ ...input, id, skus: input.skus.map(sku => ({ ...sku, productId: id })), version: 1, createdAt: '2026-01-01', updatedAt: '2026-01-01', companyCommissionRate: input.totalCommissionRate - input.sellerCommissionRate })
  let review = reviewCandidate(candidate, [])
  assert.ok(review.items.every(item => item.state === '신규' && !item.selected))
  assert.equal(applyReviewed(review, []), null)
  review.items.forEach(item => { item.selected = true })
  const product = materialize(applyReviewed(review, []))
  assert.equal(product.skus.length, parsed.rows.length)
  review = reviewCandidate(candidate, [product])
  assert.ok(review.items.every(item => item.state === '기존'), JSON.stringify(review.items))
  review.items.forEach(item => { item.selected = true })
  assert.equal(applyReviewed(review, [product]), null, 'Repeat import is a no-op; no duplicate product')
  const snapshot = structuredClone(product)
  const alteredRows = structuredClone(parsed.rows.slice(0, -1))
  alteredRows[0]['공구판매가'] += 1000
  alteredRows[1]['총 매입가(VAT포함)'] += 500
  alteredRows.push({ ...parsed.rows[0], '상품명': '완전히새로운추가품목', '구성명': '독립옵션' })
  const changed = { ...candidate, rows: alteredRows }
  review = reviewCandidate(changed, [product])
  assert.equal(review.items[0].state, '조건변경')
  assert.deepEqual(review.items[0].differences.map(diff => diff.label), ['판매가'])
  assert.equal(review.items[1].state, '조건변경')
  assert.equal(review.items.at(-1).state, '신규')
  review.items[0].selected = true
  review.items.at(-1).selected = true
  const merged = applyReviewed(review, [product])
  assert.equal(merged.id, product.id)
  assert.deepEqual(merged.skus.slice(0, product.skus.length).map(sku => sku.id), product.skus.map(sku => sku.id))
  assert.equal(merged.skus.length, product.skus.length + 1)
  assert.deepEqual(merged.skus[1], product.skus[1], 'Excluded change stays untouched')
  assert.deepEqual(merged.skus[product.skus.length - 1], product.skus.at(-1), 'Missing SKU stays untouched')
  assert.equal(merged.skus[0].groupBuyPrice, product.skus[0].groupBuyPrice + 1000)
  assert.deepEqual(product, snapshot, 'Input and historical snapshot are not mutated')
  assert.throws(() => applyReviewed(review, [{ ...product, version: 2 }]), /변경/)
  const ambiguous = reviewCandidate(candidate, [product, { ...product, id: 'duplicate-id' }])
  assert.ok(ambiguous.items.every(item => item.state === '확인필요'))
  ambiguous.items.forEach(item => { item.selected = true })
  assert.equal(applyReviewed(ambiguous, [product]), null)
  const sameFile = { ...product, id: 'other-product', productName: '다른상품' }
  const preserved = applyReviewed(review, [product, sameFile])
  assert.equal(sameFile.active, true)
  assert.equal(preserved.id, product.id)
  assert.ok(reviewCandidate({ ...candidate, productName: candidate.productName + '리뉴얼' }, [product]).items.every(item => item.state === '확인필요'))
  assert.ok(reviewBatch([candidate, { ...candidate, key: 'second' }], [product]).every(c => c.items.every(item => item.state === '확인필요')))
  const legacy = { ...product, skus: product.skus.map(sku => ({ ...sku, optionName: parsed.rows[0]['상품명'] })) }
  assert.ok(reviewCandidate(candidate, [legacy]).items.some(item => item.state === '확인필요'))
  const legacySingle = { ...product, skus: [{ ...product.skus[0], optionName: parsed.rows[0]['상품명'] }] }
  assert.equal(reviewCandidate({ ...candidate, rows: [parsed.rows[0]] }, [legacySingle]).items[0].state, '확인필요')
  const shipping = reviewCandidate({ ...candidate, metadata: { ...candidate.metadata, shippingFee: 3000 } }, [product])
  shipping.items[0].selected = true
  const shipped = applyReviewed(shipping, [product])
  assert.equal(shipped.skus[0].shippingFee, 3000)
  assert.equal(shipped.shippingFee, product.shippingFee)
  assert.deepEqual(shipped.skus[1], product.skus[1])
  assert.ok(reviewCandidate({ ...candidate, metadata: { ...candidate.metadata, shippingFeeKnown: false } }, [product]).items.every(item => item.state === '확인필요'))
  const vendor = materialize(buildInput({ ...candidate, settlementVendorName: '테스트벤더' }))
  assert.ok(reviewCandidate(candidate, [vendor]).items.every(item => item.state === '신규'))
  console.log(`PASS real proposal: ${file.name} (${parsed.rows.length} rows); repeat/no duplicates, stable IDs, append-only SKUs, excluded/missing preservation, exact differences, ambiguous block, stale review, file collision, shipping isolation, snapshot immutability, vendor isolation`)
} finally { await server.close() }
