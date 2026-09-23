import assert from 'node:assert/strict'
import { buildImportedSeller, mapNotionSeller, previewNotionSeller } from '../src/features/sellers/notionSellerSyncModel.ts'

const seller = {
  id: 'seller-existing', name: '러브율홈', instagramId: 'loveyul_home', contact: '010-1111-2222',
  recipientName: '김셀러', shippingPhone: '010-1111-2222', shippingAddress: '서울시 기존 주소',
  defaultMdId: 'u-004', defaultManagerId: 'u-006', active: true,
  businesses: [{ id: 'business-existing', businessName: '러브율홈', businessNumber: '1234567890', businessType: 'general_business', bankName: '신한은행', accountNumber: '110-111-222222', accountHolder: '김셀러', isPrimary: true, active: true }],
}

const changedSource = {
  pageId: 'notion-page-1', lastEditedTime: '2026-09-20T10:00:00.000Z', name: '러브율홈', instagramId: '@loveyul_home',
  contact: '010-1111-2222', shippingText: '성함: 김셀러\n주소: 서울시 변경 주소\n연락처: 010-9999-8888',
  businessType: '일반/법인 사업자', businessNumberOrResidentId: '123-45-67890', businessName: '러브율홈', bankAccount: '신한은행 110-111-222222 김셀러',
  managerPageIds: ['192ddc8b-71f1-803f-b1bf-c3c7f39393f3'],
}
const changed = previewNotionSeller(changedSource, [seller])
assert.equal(changed.status, 'changed')
assert.equal(changed.matchedSellerId, seller.id)
assert.deepEqual(changed.differences.map((item) => item.field).sort(), ['shippingAddress', 'shippingPhone'])

const applied = buildImportedSeller(changed, seller, 'apply', '2026-09-20T11:00:00.000Z')
assert.equal(applied?.id, seller.id)
assert.equal(applied?.shippingAddress, '서울시 변경 주소')
assert.equal(applied?.businesses?.[0].id, 'business-existing')
assert.equal(applied?.notionPageId, changedSource.pageId)

const protectedId = mapNotionSeller({ ...changedSource, pageId: 'sensitive', businessNumberOrResidentId: '900101-1234567' })
assert.equal(protectedId.mapped.businesses?.[0].businessNumber, undefined)
assert.ok(protectedId.warnings.some((warning) => warning.includes('자동 반영하지 않았습니다')))

const ambiguous = previewNotionSeller({ ...changedSource, pageId: 'ambiguous', businessNumberOrResidentId: '', contact: '', instagramId: '', name: '러브율' }, [seller])
assert.equal(ambiguous.status, 'needs_review')
assert.throws(() => buildImportedSeller(ambiguous, undefined, 'apply', new Date().toISOString()))

const novel = previewNotionSeller({ ...changedSource, pageId: 'new', name: '완전히새로운셀러', contact: '010-5555-6666', instagramId: 'brand_new', businessNumberOrResidentId: '5556677777' }, [seller])
assert.equal(novel.status, 'new')
const created = buildImportedSeller(novel, undefined, 'apply', new Date().toISOString())
assert.ok(created?.id)
assert.notEqual(created?.id, seller.id)

const connected = buildImportedSeller(ambiguous, seller, 'connect', '2026-09-20T12:00:00.000Z')
assert.equal(connected?.contact, seller.contact)
assert.equal(connected?.notionPageId, 'ambiguous')

console.log('Notion seller sync safety tests passed')
