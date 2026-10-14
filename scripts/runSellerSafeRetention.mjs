import assert from 'node:assert/strict'
import { expiredGeneratedPath, SELLER_SAFE_RETENTION_DAYS } from '../supabase/functions/seller-safe-cleanup/retention.ts'
import { cleanupSellerSafeFiles } from '../supabase/functions/seller-safe-cleanup/cleanup.ts'

const id = '11111111-1111-4111-8111-111111111111'
const generated = `settlement-exports/seller-safe/${id}/v2/${id}.xlsx`
const now = Date.parse('2026-10-14T00:00:00Z')
assert.equal(SELLER_SAFE_RETENTION_DAYS, 14)
assert.equal(expiredGeneratedPath(generated, '2026-09-30T00:00:00Z', now), true)
assert.equal(expiredGeneratedPath(generated, '2026-10-01T00:00:00Z', now), false)
assert.equal(expiredGeneratedPath(generated, null, now), false)
assert.equal(expiredGeneratedPath(`settlement-exports/campaigns/${id}/sales-imports/${id}/${id}.xlsx`, '2020-01-01T00:00:00Z', now), false)
assert.equal(expiredGeneratedPath(`settlement-exports/seller-safe/${id}/v2/other.xlsx`, '2020-01-01T00:00:00Z', now), false)
const prefix = `settlement-exports/seller-safe/${id}/v2`
const removed = []
const bucket = {
  async list(path) {
    if (path === 'settlement-exports/seller-safe') return { data: [{ name: id, id: null, created_at: null }], error: null }
    if (path === `settlement-exports/seller-safe/${id}`) return { data: [{ name: 'v2', id: null, created_at: null }], error: null }
    if (path === prefix) return { data: [
      { name: `${id}.xlsx`, id, created_at: '2026-09-30T00:00:00Z' },
      { name: 'other.xlsx', id, created_at: '2020-01-01T00:00:00Z' },
      { name: 'recent.xlsx', id, created_at: '2026-10-13T00:00:00Z' },
    ], error: null }
    throw new Error(`Unexpected path ${path}`)
  },
  async remove(paths) { removed.push(...paths); return { error: null } },
}
assert.deepEqual(await cleanupSellerSafeFiles(bucket, 'inspect', now), { scanned: 5, eligible: 1, deleted: 0 })
assert.deepEqual(removed, [])
assert.deepEqual(await cleanupSellerSafeFiles(bucket, 'cleanup', now), { scanned: 5, eligible: 1, deleted: 1 })
assert.deepEqual(removed, [generated])
console.log('셀러용 생성 파일 14일 보관·원본 보호 조건 확인 완료')
