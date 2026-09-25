import { isSupabaseConfigured, supabase } from '../lib/supabase.ts'
import { STORAGE_KEYS, storageService } from './storageService.ts'
import { countWorkspaceRecords, createWorkspaceBackup, readWorkspaceData, SYNCHRONIZED_STORAGE_KEYS, type WorkspaceBackup } from './cloudSyncModel.ts'
import { removeLegacyFixtures } from '../utils/legacyFixtures.ts'
import { changedWorkspaceKeys, rememberWorkspaceRow } from './workspacePayloadCache.ts'

export { SYNCHRONIZED_STORAGE_KEYS, type WorkspaceBackup } from './cloudSyncModel.ts'

const WORKSPACE_ID = 'wisevendor'
const DEVICE_ID_KEY = 't3_company_os_cloud_device_id'
const MIGRATION_COMPLETED_KEY = 't3_company_os_cloud_migration_completed'
const STATUS_EVENT = 't3-cloud-sync-status'

export type CloudSyncStatus = 'connecting' | 'synced' | 'migration_required' | 'setup_required' | 'error'

type WorkspaceStateRow = {
  workspace_id: string
  storage_key: string
  payload: unknown
  deleted: boolean
  revision: number
  source_device_id: string | null
  updated_at: string
}

type StatusDetail = { status: CloudSyncStatus; message: string; syncedAt?: string }

let statusDetail: StatusDetail = { status: 'connecting', message: '공용 데이터를 확인하고 있습니다.' }
let stopCurrentSync: (() => void) | null = null
const remoteUpdatedAt = new Map<string, string>()
const pendingTimers = new Map<string, number>()

function setStatus(next: StatusDetail) {
  statusDetail = next
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(STATUS_EVENT, { detail: next }))
}

function getDeviceId() {
  if (typeof localStorage === 'undefined') return 'server'
  const existing = localStorage.getItem(DEVICE_ID_KEY)
  if (existing) return existing
  const created = crypto.randomUUID()
  localStorage.setItem(DEVICE_ID_KEY, created)
  return created
}

function readLocalData() {
  if (typeof localStorage === 'undefined') return {}
  return readWorkspaceData(localStorage)
}

function applyRow(row: WorkspaceStateRow) {
  const knownUpdatedAt = remoteUpdatedAt.get(row.storage_key)
  if (knownUpdatedAt && knownUpdatedAt >= row.updated_at) return
  remoteUpdatedAt.set(row.storage_key, row.updated_at)
  if (row.deleted) storageService.removeItemFromCloud(row.storage_key)
  else storageService.setItemFromCloud(row.storage_key, row.payload)
  void rememberWorkspaceRow(row.storage_key, row.updated_at, localStorage.getItem(row.storage_key))
}

async function fetchRows(keys?: string[]) {
  if (!supabase) throw new Error('공용 데이터베이스가 설정되지 않았습니다.')
  if (keys?.length === 0) return []
  let query = supabase
    .from('workspace_state')
    .select('workspace_id,storage_key,payload,deleted,revision,source_device_id,updated_at')
    .eq('workspace_id', WORKSPACE_ID)
  if (keys) query = query.in('storage_key', keys)
  const { data, error } = await query
  if (error) throw error
  return (data ?? []) as WorkspaceStateRow[]
}

function isMissingTable(error: unknown) {
  const message = error instanceof Error ? error.message : String(error)
  return /workspace_state|relation.*does not exist|schema cache|42P01/i.test(message)
}

let settlementSyncQueue: Promise<void> = Promise.resolve()
function syncKey(key: string): Promise<void> {
  if (key !== STORAGE_KEYS.settlements) return performSyncKey(key)
  const next = settlementSyncQueue.catch(() => undefined).then(() => performSyncKey(key))
  settlementSyncQueue = next
  return next
}
async function performSyncKey(key: string) {
  if (!supabase || !SYNCHRONIZED_STORAGE_KEYS.includes(key as (typeof SYNCHRONIZED_STORAGE_KEYS)[number])) return
  const raw = localStorage.getItem(key)
  let payload: unknown = null
  if (raw !== null) {
    try { payload = JSON.parse(raw) } catch { payload = raw }
  }
  if (key === STORAGE_KEYS.settlements && remoteUpdatedAt.has(key)) {
    const { data, error } = await supabase.from('workspace_state').update({ payload, deleted: raw === null, source_device_id: getDeviceId() })
      .eq('workspace_id', WORKSPACE_ID).eq('storage_key', key).eq('updated_at', remoteUpdatedAt.get(key)!).select('updated_at').maybeSingle()
    if (error) throw error
    if (!data) throw new Error('다른 사용자가 정산을 변경했습니다. 공용 데이터를 새로 불러온 뒤 다시 시도해주세요.')
    remoteUpdatedAt.set(key, data.updated_at)
    void rememberWorkspaceRow(key, data.updated_at, raw)
    return
  }
  const { data, error } = await supabase.from('workspace_state').upsert({
    workspace_id: WORKSPACE_ID,
    storage_key: key,
    payload,
    deleted: raw === null,
    source_device_id: getDeviceId(),
  }, { onConflict: 'workspace_id,storage_key' }).select('updated_at').single()
  if (error) throw error
  const row = data as Pick<WorkspaceStateRow, 'updated_at'>
  remoteUpdatedAt.set(key, row.updated_at)
  void rememberWorkspaceRow(key, row.updated_at, raw)
  setStatus({ status: 'synced', message: '모든 업무 데이터가 공용 저장소에 저장되었습니다.', syncedAt: row.updated_at })
}

async function cleanLegacyFixtures() {
  const changedKeys: string[] = []
  for (const key of [STORAGE_KEYS.samples, STORAGE_KEYS.csCases, STORAGE_KEYS.workItems, STORAGE_KEYS.notifications]) {
    const raw = localStorage.getItem(key)
    if (raw === null) continue
    try {
      const current = JSON.parse(raw) as unknown
      const cleaned = removeLegacyFixtures(key, current)
      if (JSON.stringify(cleaned) === JSON.stringify(current)) continue
      storageService.setItemFromCloud(key, cleaned)
      changedKeys.push(key)
    } catch {
      // Keep malformed data untouched so it can still be recovered from a backup.
    }
  }
  await Promise.all(changedKeys.map(syncKey))
}

function startBackgroundSync() {
  stopCurrentSync?.()
  const onStorageUpdated = (event: Event) => {
    const detail = (event as CustomEvent<{ key?: string; origin?: 'local' | 'cloud' }>).detail
    const key = detail?.key
    if (!key || detail.origin === 'cloud' || !SYNCHRONIZED_STORAGE_KEYS.includes(key as (typeof SYNCHRONIZED_STORAGE_KEYS)[number])) return
    const existing = pendingTimers.get(key)
    if (existing) window.clearTimeout(existing)
    pendingTimers.set(key, window.setTimeout(() => {
      pendingTimers.delete(key)
      void syncKey(key).catch((error) => setStatus({ status: 'error', message: `저장 동기화에 실패했습니다. ${error instanceof Error ? error.message : ''}`.trim() }))
    }, 500))
  }
  window.addEventListener('t3-storage-updated', onStorageUpdated)

  const channel = supabase?.channel(`workspace-state-${getDeviceId()}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'workspace_state', filter: `workspace_id=eq.${WORKSPACE_ID}` }, (change) => {
      const row = change.new as WorkspaceStateRow | undefined
      if (!row || row.source_device_id === getDeviceId()) return
      applyRow(row)
      setStatus({ status: 'synced', message: '다른 컴퓨터의 변경사항을 반영했습니다.', syncedAt: row.updated_at })
    })
    .subscribe()

  // Check lightweight versions first; download payloads only for changed keys.
  // Share one in-flight refresh between focus events and the polling interval.
  let refreshing = false
  const refresh = async () => {
    if (document.visibilityState !== 'visible' || refreshing || !supabase) return
    refreshing = true
    try {
      const { data: versions, error } = await supabase.from('workspace_state')
        .select('storage_key,updated_at').eq('workspace_id', WORKSPACE_ID)
      if (error) throw error
      const changedKeys = (versions ?? []).filter((row) => {
        const known = remoteUpdatedAt.get(row.storage_key)
        return !known || known < row.updated_at
      }).map((row) => row.storage_key)
      if (!changedKeys.length) return
      const { data, error: payloadError } = await supabase.from('workspace_state')
        .select('workspace_id,storage_key,payload,deleted,revision,source_device_id,updated_at')
        .eq('workspace_id', WORKSPACE_ID).in('storage_key', changedKeys)
      if (payloadError) throw payloadError
      ;(data as WorkspaceStateRow[] ?? []).forEach(applyRow)
    } catch {
      // Keep the local workspace intact; the next refresh retries failed keys.
    } finally {
      refreshing = false
    }
  }
  const interval = window.setInterval(refresh, 60_000)
  window.addEventListener('focus', refresh)

  stopCurrentSync = () => {
    window.removeEventListener('t3-storage-updated', onStorageUpdated)
    window.removeEventListener('focus', refresh)
    window.clearInterval(interval)
    pendingTimers.forEach((timer) => window.clearTimeout(timer))
    pendingTimers.clear()
    if (channel) void supabase?.removeChannel(channel)
  }
  return stopCurrentSync
}

export const cloudSyncService = {
  getStatus: () => statusDetail,
  hasCompletedInitialSync() {
    return typeof localStorage !== 'undefined' && localStorage.getItem(MIGRATION_COMPLETED_KEY) === 'true'
  },
  subscribe(listener: (detail: StatusDetail) => void) {
    const handler = (event: Event) => listener((event as CustomEvent<StatusDetail>).detail)
    window.addEventListener(STATUS_EVENT, handler)
    listener(statusDetail)
    return () => window.removeEventListener(STATUS_EVENT, handler)
  },
  getLocalData: readLocalData,
  getLocalRecordCount(): number {
    return countWorkspaceRecords(readLocalData())
  },
  acceptSettlementCommit(payload: unknown, updatedAt: string) {
    const timer = pendingTimers.get(STORAGE_KEYS.settlements)
    if (timer !== undefined && typeof window !== 'undefined') window.clearTimeout(timer)
    pendingTimers.delete(STORAGE_KEYS.settlements)
    remoteUpdatedAt.set(STORAGE_KEYS.settlements, updatedAt)
    storageService.setItemFromCloud(STORAGE_KEYS.settlements, payload)
    void rememberWorkspaceRow(STORAGE_KEYS.settlements, updatedAt, localStorage.getItem(STORAGE_KEYS.settlements))
  },
  async syncKeys(keys: string[]) {
    for (const key of keys) {
      const timer = pendingTimers.get(key)
      if (timer !== undefined && typeof window !== 'undefined') window.clearTimeout(timer)
      pendingTimers.delete(key)
    }
    await Promise.all(keys.map(syncKey))
  },
  createBackup(): WorkspaceBackup {
    return createWorkspaceBackup(localStorage, getDeviceId())
  },
  downloadBackup() {
    const backup = this.createBackup()
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `t3-company-os-backup-${new Date().toISOString().slice(0, 10)}.json`
    anchor.click()
    URL.revokeObjectURL(url)
    return backup
  },
  async initialize() {
    if (!isSupabaseConfigured() || !supabase) {
      setStatus({ status: 'error', message: '공용 데이터베이스 연결 정보가 없습니다.' })
      return { status: 'error' as const, stop: () => undefined }
    }
    setStatus({ status: 'connecting', message: '공용 데이터를 확인하고 있습니다.' })
    try {
      const { data: versions, error: versionsError } = await supabase.from('workspace_state')
        .select('storage_key,updated_at,deleted').eq('workspace_id', WORKSPACE_ID)
      if (versionsError) throw versionsError
      const rows = await fetchRows(await changedWorkspaceKeys(versions ?? [], localStorage))
      rows.forEach(applyRow)
      for (const row of versions ?? []) remoteUpdatedAt.set(row.storage_key, row.updated_at)
      const migrationCompleted = localStorage.getItem(MIGRATION_COMPLETED_KEY) === 'true'
      // The approved company account and its shared workspace are authoritative.
      // A new browser may contain stale local records, but that must never block
      // loading an already-populated company workspace or show a migration banner.
      await cleanLegacyFixtures()
      if (!versions?.length && !migrationCompleted && Object.keys(readLocalData()).length) {
        setStatus({ status: 'migration_required', message: '이 컴퓨터의 기존 자료를 공용 DB로 이전해 주세요.' })
        return { status: 'migration_required' as const, stop: () => undefined }
      }
      localStorage.setItem(MIGRATION_COMPLETED_KEY, 'true')
      setStatus({ status: 'synced', message: '공용 데이터가 연결되었습니다.', syncedAt: new Date().toISOString() })
      return { status: 'synced' as const, stop: startBackgroundSync() }
    } catch (error) {
      const detail: StatusDetail = isMissingTable(error)
        ? { status: 'setup_required', message: '공용 동기화 테이블 설정이 필요합니다.' }
        : { status: 'error', message: `공용 데이터를 불러오지 못했습니다. ${error instanceof Error ? error.message : ''}`.trim() }
      setStatus(detail)
      return { status: detail.status, stop: () => undefined }
    }
  },
  async migrateThisComputer() {
    if (!supabase) throw new Error('공용 데이터베이스가 연결되지 않았습니다.')
    const localData = readLocalData()
    const deviceId = getDeviceId()
    const rows = SYNCHRONIZED_STORAGE_KEYS.map((key) => ({
      workspace_id: WORKSPACE_ID,
      storage_key: key,
      payload: Object.prototype.hasOwnProperty.call(localData, key) ? localData[key] : null,
      deleted: !Object.prototype.hasOwnProperty.call(localData, key),
      source_device_id: deviceId,
    }))
    const { data, error } = await supabase.from('workspace_state').upsert(rows, { onConflict: 'workspace_id,storage_key' })
      .select('workspace_id,storage_key,payload,deleted,revision,source_device_id,updated_at')
    if (error) throw error
    ;((data ?? []) as WorkspaceStateRow[]).forEach((row) => remoteUpdatedAt.set(row.storage_key, row.updated_at))
    localStorage.setItem(MIGRATION_COMPLETED_KEY, 'true')
    setStatus({ status: 'synced', message: `${Object.keys(localData).length}개 데이터 영역을 공용 DB로 이전했습니다.`, syncedAt: new Date().toISOString() })
    startBackgroundSync()
    return { storageAreas: Object.keys(localData).length, records: this.getLocalRecordCount() }
  },
  async adoptSharedWorkspace() {
    if (!supabase) throw new Error('공용 데이터베이스가 연결되지 않았습니다.')
    const rows = await fetchRows()
    if (!rows.length) throw new Error('공용 DB에 적용할 회사 자료가 없습니다.')
    rows.forEach(applyRow)
    await cleanLegacyFixtures()
    localStorage.setItem(MIGRATION_COMPLETED_KEY, 'true')
    setStatus({ status: 'synced', message: '이 컴퓨터에 공용 데이터를 적용했습니다.', syncedAt: new Date().toISOString() })
    startBackgroundSync()
    return { storageAreas: rows.filter((row) => !row.deleted).length, records: this.getLocalRecordCount() }
  },
  async importBackup(file: File) {
    const parsed = JSON.parse(await file.text()) as WorkspaceBackup
    if (parsed.format !== 't3-company-os-workspace-backup' || parsed.version !== 1 || !parsed.data) throw new Error('T3 Company OS 백업 파일이 아닙니다.')
    Object.entries(parsed.data).forEach(([key, value]) => {
      if (SYNCHRONIZED_STORAGE_KEYS.includes(key as (typeof SYNCHRONIZED_STORAGE_KEYS)[number])) storageService.setItemFromCloud(key, value)
    })
    return this.migrateThisComputer()
  },
  stop() { stopCurrentSync?.(); stopCurrentSync = null },
}
