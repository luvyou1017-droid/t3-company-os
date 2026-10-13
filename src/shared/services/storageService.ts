export const STORAGE_KEYS = {
  vendorSkuTerms: 't3_company_os_vendor_sku_terms',
  campaigns: 't3_company_os_campaigns',
  csCases: 't3_company_os_cs_cases',
  samples: 't3_company_os_samples',
  workItems: 't3_company_os_work_items',
  notifications: 't3_company_os_notifications',
  campaignChecklistItems: 't3_company_os_campaign_checklist_items',
  campaignCreateDraft: 't3_company_os_campaign_create_draft',
  campaignCreateDrafts: 't3_company_os_campaign_create_drafts',
  campaignCreateDraftMigrationCompleted: 't3_company_os_campaign_create_draft_migration_completed',
  salesDataImports: 't3_company_os_sales_data_imports',
  salesDataRows: 't3_company_os_sales_data_rows',
  salesColumnRules: 't3_company_os_sales_column_rules',
  settlements: 't3_company_os_settlements',
  settlementVersions: 't3_company_os_settlement_versions',
  settlementDeductions: 't3_company_os_settlement_deductions',
  settlementActivityLogs: 't3_company_os_settlement_activity_logs',
  settlementRevisionRequests: 't3_company_os_settlement_revision_requests',
  notificationSendLogs: 't3_company_os_notification_send_logs',
  campaignActivities: 't3_company_os_campaign_activities',
  campaignFiles: 't3_company_os_campaign_files',
  communications: 't3_company_os_communications',
  campaignListState: 't3_company_os_campaign_list_state',
  sellerSettlementRules: 't3_company_os_seller_settlement_rules',
  sellerSettlementDocuments: 't3_company_os_seller_settlement_documents',
  paymentRequests: 't3_company_os_payment_requests',
  paymentEvidence: 't3_company_os_payment_evidence',
  evidenceAiReviews: 't3_company_os_evidence_ai_reviews',
  withholdingTaxItems: 't3_company_os_withholding_tax_items',
  sellerMasters: 't3_company_os_seller_masters',
  managerMasters: 't3_company_os_manager_masters',
  paymentRequestBatches: 't3_company_os_payment_request_batches',
  campaignEventOperations: 't3_company_os_campaign_event_operations',
} as const

const LEGACY_KEYS: Partial<Record<(typeof STORAGE_KEYS)[keyof typeof STORAGE_KEYS], string>> = {
  [STORAGE_KEYS.csCases]: 't3.cs.cases',
  [STORAGE_KEYS.samples]: 't3.samples',
  [STORAGE_KEYS.workItems]: 't3.work.items',
  [STORAGE_KEYS.notifications]: 't3.notifications',
  [STORAGE_KEYS.notificationSendLogs]: 't3.notification.sendLogs',
}

export type StorageUpdateOrigin = 'local' | 'cloud'

let stagedValues: Map<string, unknown> | undefined
let stagedWrites: Map<string, unknown> | undefined
/** Run existing synchronous rules without local writes or cloud-sync events. */
export function captureStorageWrites<T>(seed: Map<string, unknown>, action: () => T) {
  if (stagedValues) throw new Error('저장 미리보기가 이미 진행 중입니다.')
  stagedValues = new Map(seed)
  stagedWrites = new Map()
  try {
    const result = action()
    if (result && typeof (result as { then?: unknown }).then === 'function') throw new Error('저장 미리보기는 동기 작업만 지원합니다.')
    return { result, writes: new Map(stagedWrites) }
  } finally { stagedValues = undefined; stagedWrites = undefined }
}

function notifyStorageUpdated(key: string, origin: StorageUpdateOrigin = 'local') {
  if (typeof window === 'undefined') return
  queueMicrotask(() => window.dispatchEvent(new CustomEvent('t3-storage-updated', { detail: { key, origin } })))
}

export const storageService = {
  getItem<T>(key: string, fallback: T): T {
    if (stagedValues) return JSON.parse(JSON.stringify(stagedValues.get(key) ?? fallback)) as T
    if (typeof localStorage === 'undefined') return fallback
    const value = localStorage.getItem(key) ?? (LEGACY_KEYS[key as keyof typeof LEGACY_KEYS] ? localStorage.getItem(LEGACY_KEYS[key as keyof typeof LEGACY_KEYS] ?? '') : null)
    if (!value) return fallback
    try {
      return JSON.parse(value) as T
    } catch {
      // Preserve the original bytes for recovery instead of overwriting them.
      return fallback
    }
  },
  setItem<T>(key: string, value: T) {
    if (stagedValues && stagedWrites) {
      const copy: unknown = JSON.parse(JSON.stringify(value))
      stagedValues.set(key, copy); stagedWrites.set(key, copy); return
    }
    if (typeof localStorage === 'undefined') return
    localStorage.setItem(key, JSON.stringify(value))
    notifyStorageUpdated(key)
  },
  setItemFromCloud<T>(key: string, value: T) {
    if (typeof localStorage === 'undefined') return
    localStorage.setItem(key, JSON.stringify(value))
    notifyStorageUpdated(key, 'cloud')
  },
  removeItem(key: string) {
    if (typeof localStorage === 'undefined') return
    localStorage.removeItem(key)
    notifyStorageUpdated(key)
  },
  removeItemFromCloud(key: string) {
    if (typeof localStorage === 'undefined') return
    localStorage.removeItem(key)
    notifyStorageUpdated(key, 'cloud')
  },
  resetPrototypeData() {
    Object.values(STORAGE_KEYS).forEach((key) => this.removeItem(key))
  },
}
