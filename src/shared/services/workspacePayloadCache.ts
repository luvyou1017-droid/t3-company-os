type WorkspaceVersion = { storage_key: string; updated_at: string; deleted: boolean }
type CachedVersion = { updated_at: string; digest: string | null }

const CACHE_KEY = 't3_company_os_workspace_versions_v1'

async function digest(value: string): Promise<string> {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, '0')).join('')
}

function readCache(): Record<string, CachedVersion> {
  try { return JSON.parse(sessionStorage.getItem(CACHE_KEY) ?? '{}') as Record<string, CachedVersion> }
  catch { return {} }
}

export async function changedWorkspaceKeys(versions: WorkspaceVersion[], storage: Pick<Storage, 'getItem'>): Promise<string[]> {
  const cached = readCache()
  return (await Promise.all(versions.map(async (row) => {
    const previous = cached[row.storage_key]
    if (!previous || previous.updated_at !== row.updated_at) return row.storage_key
    const raw = storage.getItem(row.storage_key)
    if (row.deleted) return raw === null && previous.digest === null ? null : row.storage_key
    if (raw === null || !previous.digest || !crypto?.subtle) return row.storage_key
    return await digest(raw) === previous.digest ? null : row.storage_key
  }))).filter((key): key is string => key !== null)
}

export async function rememberWorkspaceRow(key: string, updatedAt: string, raw: string | null) {
  try {
    const hashed = raw === null ? null : await digest(raw)
    const cache = readCache()
    cache[key] = { updated_at: updatedAt, digest: hashed }
    sessionStorage.setItem(CACHE_KEY, JSON.stringify(cache))
  } catch { /* Cache failure only costs another download on next load. */ }
}
