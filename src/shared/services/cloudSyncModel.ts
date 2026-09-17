import { STORAGE_KEYS } from './storageService.ts'

const PERSONAL_OR_TRANSIENT_KEYS = new Set<string>([
  STORAGE_KEYS.campaignListState,
  STORAGE_KEYS.campaignCreateDraft,
  STORAGE_KEYS.campaignCreateDrafts,
  STORAGE_KEYS.campaignCreateDraftMigrationCompleted,
])

export const SYNCHRONIZED_STORAGE_KEYS = [
  ...Object.values(STORAGE_KEYS).filter((key) => !PERSONAL_OR_TRANSIENT_KEYS.has(key)),
  't3_company_os_product_masters',
  't3_company_os_proposal_masters',
  't3-suppliers-v1',
] as const

export type WorkspaceBackup = {
  format: 't3-company-os-workspace-backup'
  version: 1
  exportedAt: string
  sourceDeviceId: string
  data: Record<string, unknown>
}

type ReadableStorage = Pick<Storage, 'getItem'>

export function readWorkspaceData(storage: ReadableStorage) {
  const data: Record<string, unknown> = {}
  SYNCHRONIZED_STORAGE_KEYS.forEach((key) => {
    const raw = storage.getItem(key)
    if (raw === null) return
    try { data[key] = JSON.parse(raw) }
    catch { data[key] = raw }
  })
  return data
}

export function countWorkspaceRecords(data: Record<string, unknown>) {
  return Object.values(data).reduce<number>((total, value) => total + (Array.isArray(value) ? value.length : value == null ? 0 : 1), 0)
}

export function createWorkspaceBackup(storage: ReadableStorage, sourceDeviceId: string, exportedAt = new Date().toISOString()): WorkspaceBackup {
  return { format: 't3-company-os-workspace-backup', version: 1, exportedAt, sourceDeviceId, data: readWorkspaceData(storage) }
}
