import assert from 'node:assert/strict'
import { applyReviewed, buildInput, parseProposalOptionIdentity, reviewCandidate } from '../src/features/productMaster/utils/proposalImportReview.ts'

const metadata = { brandName: '에어메이드', vendorName: '테스트 공급사', productUrl: '', shippingFee: 3000, shippingFeeKnown: true, courierName: 'CJ', sampleSupportType: '협의', draft: false }
const row = (option, sale = 26900) => ({ '카테고리': '생활', '상품명': '윈드맥스', '구성명': option, '정상가': 30000, '공구판매가': sale, '총 매입가(VAT포함)': 22000, '셀러 수수료율': 10, '가격 적용 방식': '고정가', '최소 수량': 0, '최대 수량': 0, '상태': '판매 가능' })
const base = buildInput({ key: 'base', fileName: 'base.xlsx', productName: '윈드맥스', rows: [row('민트')], metadata })
const product = { ...base, id: 'product-fixed', skus: base.skus.map((sku) => ({ ...sku, id: 'sku-fixed', productId: 'product-fixed' })), companyCommissionRate: 8, createdAt: '2026-01-01', updatedAt: '2026-01-01', version: 4 }
const originalIds = product.skus.map((sku) => sku.id)
const historicalSnapshot = JSON.stringify({ skuId: 'sku-fixed', salePrice: 22900, capturedAt: '2026-08-01' })
const structured = parseProposalOptionIdentity(row('2단 베이지'))
assert.equal(structured.optionName, '2단', '옵션과 세부옵션 분리')
assert.equal(structured.optionValues.컬러, '베이지', '컬러 세부옵션 저장')

const newCandidate = reviewCandidate({ key: 'new', fileName: 'new.xlsx', productName: '윈드맥스', rows: [row('화이트')], metadata }, [product])
assert.equal(newCandidate.items[0].state, '신규')
newCandidate.items[0].selected = true
const added = applyReviewed(newCandidate, [product])
assert.ok(added)
assert.deepEqual(added.skus.slice(0, originalIds.length).map((sku) => sku.id), originalIds, '기존 SKU ID 유지')
assert.equal(added.skus.length, 2, '신규 SKU만 추가')

const changedCandidate = reviewCandidate({ key: 'change', fileName: 'change.xlsx', productName: '윈드맥스', rows: [row('민트', 27900)], metadata }, [product])
assert.equal(changedCandidate.items[0].state, '조건변경')
changedCandidate.items[0].selected = true
const changed = applyReviewed(changedCandidate, [product])
assert.ok(changed)
assert.equal(changed.skus.length, 1, '조건 변경은 상품/SKU를 새로 만들지 않음')
assert.equal(changed.skus[0].id, 'sku-fixed', '조건 변경 시 SKU ID 유지')
assert.equal(changed.skus[0].currentTradeTerms.salePrice, 27900, '현재 거래조건만 갱신')

const similar = reviewCandidate({ key: 'similar', fileName: 'similar.xlsx', productName: '에어메이드 윈드맥스', rows: [row('민트')], metadata }, [product])
assert.equal(similar.items[0].state, '확인필요', '유사 상품은 자동 통합하지 않음')
assert.ok(similar.candidateProductIds.length > 0, '유사 상품 후보 표시')
assert.equal(historicalSnapshot, JSON.stringify({ skuId: 'sku-fixed', salePrice: 22900, capturedAt: '2026-08-01' }), '과거 Snapshot 불변')

console.log('product import safety: ok')
