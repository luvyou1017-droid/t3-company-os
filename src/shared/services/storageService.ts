export const STORAGE_KEYS = {
  campaigns: 't3_company_os_campaigns',
  csCases: 't3_company_os_cs_cases',
  samples: 't3_company_os_samples',
  workItems: 't3_company_os_work_items',
  notifications: 't3_company_os_notifications',
  salesDataImports: 't3_company_os_sales_data_imports',
  salesDataRows: 't3_company_os_sales_data_rows',
  settlements: 't3_company_os_settlements',
  settlementVersions: 't3_company_os_settlement_versions',
  settlementDeductions: 't3_company_os_settlement_deductions',
  settlementActivityLogs: 't3_company_os_settlement_activity_logs',
  notificationSendLogs: 't3_company_os_notification_send_logs',
} as const

const LEGACY_KEYS: Partial<Record<(typeof STORAGE_KEYS)[keyof typeof STORAGE_KEYS], string>> = {
  [STORAGE_KEYS.csCases]: 't3.cs.cases',
  [STORAGE_KEYS.samples]: 't3.samples',
  [STORAGE_KEYS.workItems]: 't3.work.items',
  [STORAGE_KEYS.notifications]: 't3.notifications',
  [STORAGE_KEYS.notificationSendLogs]: 't3.notification.sendLogs',
}

function notifyStorageUpdated(key: string) {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent('t3-storage-updated', { detail: { key } }))
}

export const storageService = {
  getItem<T>(key: string, fallback: T): T {
    if (typeof localStorage === 'undefined') return fallback
    const value = localStorage.getItem(key) ?? (LEGACY_KEYS[key as keyof typeof LEGACY_KEYS] ? localStorage.getItem(LEGACY_KEYS[key as keyof typeof LEGACY_KEYS] ?? '') : null)
    if (!value) return fallback
    try {
      return JSON.parse(value) as T
    } catch {
      this.setItem(key, fallback)
      return fallback
    }
  },
  setItem<T>(key: string, value: T) {
    if (typeof localStorage === 'undefined') return
    localStorage.setItem(key, JSON.stringify(value))
    notifyStorageUpdated(key)
  },
  removeItem(key: string) {
    if (typeof localStorage === 'undefined') return
    localStorage.removeItem(key)
    notifyStorageUpdated(key)
  },
  resetPrototypeData() {
    Object.values(STORAGE_KEYS).forEach((key) => this.removeItem(key))
  },
}
