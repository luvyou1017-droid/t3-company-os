export const STORAGE_KEYS = {
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
  demoDataCleanupCompleted: 't3_company_os_demo_data_cleanup_v1',
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
  queueMicrotask(() => window.dispatchEvent(new CustomEvent('t3-storage-updated', { detail: { key } })))
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

const DEMO_CAMPAIGN_IDS = new Set(Array.from({ length: 12 }, (_, index) => `SCH-${String(index + 1).padStart(3, '0')}`))
const DEMO_SALES_IDS = new Set(Array.from({ length: 10 }, (_, index) => `sales-${String(index + 1).padStart(3, '0')}`))
const DEMO_SETTLEMENT_IDS = new Set(['settlement-sales-004', 'settlement-sales-005', 'settlement-sales-006'])
const DEMO_RECORD_IDS = new Set([
  ...Array.from({ length: 15 }, (_, index) => `s-${String(index + 1).padStart(3, '0')}`),
  ...Array.from({ length: 26 }, (_, index) => `w-${String(index + 1).padStart(3, '0')}`),
  ...Array.from({ length: 12 }, (_, index) => `sales-row-${String(index + 1).padStart(3, '0')}`),
  'cs-seed-001',
  ...DEMO_SALES_IDS,
  ...DEMO_SETTLEMENT_IDS,
])

function isDemoRecord(value: unknown) {
  if (!value || typeof value !== 'object') return false
  const record = value as Record<string, unknown>
  const id = typeof record.id === 'string' ? record.id : ''
  const campaignId = typeof record.campaignId === 'string' ? record.campaignId : ''
  const salesDataImportId = typeof record.salesDataImportId === 'string' ? record.salesDataImportId : ''
  const settlementId = typeof record.settlementId === 'string' ? record.settlementId : ''
  return DEMO_RECORD_IDS.has(id)
    || DEMO_CAMPAIGN_IDS.has(campaignId)
    || DEMO_SALES_IDS.has(salesDataImportId)
    || DEMO_SETTLEMENT_IDS.has(settlementId)
}

/** 기존 브라우저에 남은 초기 화면용 데이터만 한 번 제거합니다. */
export function removeInitialDemoData() {
  if (typeof localStorage === 'undefined') return
  if (localStorage.getItem(STORAGE_KEYS.demoDataCleanupCompleted) === 'true') return

  const dataKeys = Object.values(STORAGE_KEYS).filter((key) => key !== STORAGE_KEYS.demoDataCleanupCompleted)
  dataKeys.forEach((key) => {
    const raw = localStorage.getItem(key)
    if (!raw) return
    try {
      const parsed: unknown = JSON.parse(raw)
      if (!Array.isArray(parsed)) return
      const cleaned = parsed.filter((item) => !isDemoRecord(item))
      if (cleaned.length !== parsed.length) localStorage.setItem(key, JSON.stringify(cleaned))
    } catch {
      // 다른 형식의 운영 설정값은 그대로 둡니다.
    }
  })

  const standaloneKeys = ['t3_company_os_product_masters', 't3_company_os_proposal_masters']
  standaloneKeys.forEach((key) => {
    const raw = localStorage.getItem(key)
    if (!raw) return
    try {
      const parsed: unknown = JSON.parse(raw)
      if (!Array.isArray(parsed)) return
      const cleaned = parsed.filter((item) => {
        if (!item || typeof item !== 'object') return true
        const record = item as Record<string, unknown>
        return record.testData !== true && !(typeof record.id === 'string' && record.id.includes('-test-'))
      })
      if (cleaned.length !== parsed.length) localStorage.setItem(key, JSON.stringify(cleaned))
    } catch {
      // 상품·제안서 운영 데이터가 아닌 값은 건드리지 않습니다.
    }
  })

  Object.values(LEGACY_KEYS).filter(Boolean).forEach((key) => {
    const raw = localStorage.getItem(key as string)
    if (!raw) return
    try {
      const parsed: unknown = JSON.parse(raw)
      if (!Array.isArray(parsed)) return
      localStorage.setItem(key as string, JSON.stringify(parsed.filter((item) => !isDemoRecord(item))))
    } catch {
      // 손상되거나 다른 형식인 레거시 값은 건드리지 않습니다.
    }
  })

  localStorage.setItem(STORAGE_KEYS.demoDataCleanupCompleted, 'true')
}
