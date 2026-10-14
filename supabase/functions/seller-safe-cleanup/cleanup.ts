import { expiredGeneratedPath, SELLER_SAFE_PREFIX } from './retention.ts'

const PAGE_SIZE = 100
const MAX_ENTRIES = 10000

type StorageEntry = { name: string; id: string | null; created_at: string | null }
type Bucket = {
  list: (prefix: string, options: { limit: number; offset: number; sortBy: { column: 'name'; order: 'asc' } }) => Promise<{ data: StorageEntry[] | null; error: { message: string } | null }>
  remove: (paths: string[]) => Promise<{ error: { message: string } | null }>
}

export async function cleanupSellerSafeFiles(bucket: Bucket, action: 'inspect' | 'cleanup', now = Date.now()) {
  let scanned = 0
  const eligible: string[] = []
  const list = async (prefix: string) => {
    const entries: StorageEntry[] = []
    for (let offset = 0; ; offset += PAGE_SIZE) {
      const { data, error } = await bucket.list(prefix, { limit: PAGE_SIZE, offset, sortBy: { column: 'name', order: 'asc' } })
      if (error) throw new Error(error.message)
      entries.push(...(data ?? []))
      scanned += data?.length ?? 0
      if (scanned > MAX_ENTRIES) throw new Error('Scan limit reached; no files deleted')
      if (!data || data.length < PAGE_SIZE) break
    }
    return entries
  }

  // Finish listing before any removal. Deleting while paginating skips entries.
  for (const settlement of await list(SELLER_SAFE_PREFIX)) {
    if (settlement.id || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(settlement.name)) continue
    const settlementPath = `${SELLER_SAFE_PREFIX}/${settlement.name}`
    for (const version of await list(settlementPath)) {
      if (version.id || !/^v[0-9]+$/.test(version.name)) continue
      const versionPath = `${settlementPath}/${version.name}`
      for (const file of await list(versionPath)) {
        if (file.id && expiredGeneratedPath(`${versionPath}/${file.name}`, file.created_at, now)) eligible.push(`${versionPath}/${file.name}`)
      }
    }
  }

  if (action === 'cleanup') {
    for (let index = 0; index < eligible.length; index += PAGE_SIZE) {
      const { error } = await bucket.remove(eligible.slice(index, index + PAGE_SIZE))
      if (error) throw new Error(error.message)
    }
  }
  return { scanned, eligible: eligible.length, deleted: action === 'cleanup' ? eligible.length : 0 }
}
