// Export raw values so even an unreadable record can be recovered later.
// Authentication/session keys are deliberately outside the application namespace.
export function collectBrowserBackup(storage: Storage, origin: string) {
  const entries: Record<string, string> = {}
  for (let i = 0; i < storage.length; i += 1) {
    const key = storage.key(i)
    if (!key || !/^t3[._-]/.test(key) || /token|session|password|auth/i.test(key)) continue
    const value = storage.getItem(key)
    if (value !== null) entries[key] = value
  }
  return { format: 'wise-browser-backup', version: 1, exportedAt: new Date().toISOString(), origin, entries }
}

type WiseBrowserBackup = {
  format: 'wise-browser-backup'
  version: 1
  entries: Record<string, string>
}

type WorkspaceBackup = {
  format: 't3-company-os-workspace-backup'
  version: 1
  data: Record<string, unknown>
}

export function extractSupplierRowsFromBackup(raw: string): unknown[] {
  const parsed = JSON.parse(raw) as WiseBrowserBackup | WorkspaceBackup
  let supplierData: unknown
  if (parsed.format === 'wise-browser-backup' && parsed.version === 1) {
    const value = parsed.entries?.['t3-suppliers-v1']
    if (value === undefined) throw new Error('백업 파일에 공급처 자료가 없습니다.')
    supplierData = JSON.parse(value)
  } else if (parsed.format === 't3-company-os-workspace-backup' && parsed.version === 1) {
    supplierData = parsed.data?.['t3-suppliers-v1']
  } else {
    throw new Error('T3 Company OS 백업 파일이 아닙니다.')
  }
  if (!Array.isArray(supplierData)) throw new Error('백업 파일의 공급처 자료를 읽을 수 없습니다.')
  return supplierData
}

export function downloadBrowserBackup(suppliersOnly = false) {
  const backup = collectBrowserBackup(localStorage, window.location.origin)
  if (suppliersOnly) {
    const suppliers = backup.entries['t3-suppliers-v1']
    if (suppliers === undefined) throw new Error('이 브라우저에 저장된 공급처 자료가 없습니다.')
    backup.entries = { 't3-suppliers-v1': suppliers }
  }
  if (!Object.keys(backup.entries).length) throw new Error('이 브라우저에서 백업할 자료를 찾지 못했습니다.')
  const url = URL.createObjectURL(new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' }))
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = `wise-${suppliersOnly ? 'suppliers' : 'browser'}-${new Date().toISOString().replace(/[:.]/g, '-')}.json`
  document.body.append(anchor)
  anchor.click()
  anchor.remove()
  setTimeout(() => URL.revokeObjectURL(url), 60_000)
  return Object.keys(backup.entries).length
}
