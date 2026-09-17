import assert from 'node:assert/strict'
import { collectBrowserBackup, extractSupplierRowsFromBackup } from '../src/shared/services/browserBackupService.ts'
import { mergeSupplierBackup } from '../src/features/supplierMaster/services/supplierTextParser.ts'
const values = new Map([
  ['t3-suppliers-v1', '[{"id":"staff-created","memo":"원본"}]'],
  ['t3_company_os_seller_masters', '{broken-but-recoverable'],
  ['sb-project-auth-token', 'private'],
  ['t3-auth-session', 'private'],
  ['unrelated', 'other-app'],
])
const storage = {
  length: values.size,
  key: i => [...values.keys()][i] ?? null,
  getItem: key => values.get(key) ?? null,
  setItem: () => assert.fail('Backup must not write'),
  removeItem: () => assert.fail('Backup must not delete'),
  clear: () => assert.fail('Backup must not reset'),
}
const result = collectBrowserBackup(storage, 'https://example.test')
assert.deepEqual(result.entries, {
  't3-suppliers-v1': values.get('t3-suppliers-v1'),
  t3_company_os_seller_masters: '{broken-but-recoverable',
})
assert.equal(result.origin, 'https://example.test')
assert.equal(result.format, 'wise-browser-backup')
assert.equal(JSON.parse(JSON.stringify(result)).entries['t3-suppliers-v1'], values.get('t3-suppliers-v1'))
assert.deepEqual(extractSupplierRowsFromBackup(JSON.stringify(result)), [{ id: 'staff-created', memo: '원본' }])
const merged = mergeSupplierBackup(
  [{ id: 'main', companyName: '주식회사 거래처', businessNumber: '123-45-67890', bankAccount: '기존계좌', linkedProductCount: 1, brands: ['기존'] }],
  [
    { id: 'staff-duplicate', companyName: '(주) 거래처', businessNumber: '1234567890', bankAccount: '다른계좌', linkedProductCount: 3, brands: ['신규'] },
    { id: 'staff-new', companyName: '새 거래처', linkedProductCount: 1 },
  ],
)
assert.equal(merged.rows.length, 2)
assert.equal(merged.added, 1)
assert.equal(merged.merged, 1)
assert.equal(merged.rows[0].bankAccount, '기존계좌')
assert.deepEqual(merged.rows[0].brands, ['기존', '신규'])
assert.equal(merged.rows[0].linkedProductCount, 3)
console.log('Browser backup preservation and credential exclusion passed')
