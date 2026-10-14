export const SELLER_SAFE_PREFIX = 'settlement-exports/seller-safe'
export const SELLER_SAFE_RETENTION_DAYS = 14

const uuid = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'
const generatedFile = new RegExp(`^${SELLER_SAFE_PREFIX}/${uuid}/v[0-9]+/${uuid}\\.xlsx$`, 'i')

export function expiredGeneratedPath(path: string, createdAt: string | null, now: number): boolean {
  if (!generatedFile.test(path) || !createdAt) return false
  const created = Date.parse(createdAt)
  return Number.isFinite(created) && created <= now - SELLER_SAFE_RETENTION_DAYS * 24 * 60 * 60 * 1000
}
