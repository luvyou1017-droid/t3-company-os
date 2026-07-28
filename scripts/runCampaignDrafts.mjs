const memory = new Map()
globalThis.localStorage = {
  getItem: (key) => memory.get(key) ?? null,
  setItem: (key, value) => memory.set(key, value),
  removeItem: (key) => memory.delete(key),
}
globalThis.window = { setTimeout, dispatchEvent: () => {} }
globalThis.CustomEvent = class { constructor(type, options) { this.type = type; this.detail = options?.detail } }

const { campaignDraftService } = await import('../src/shared/services/campaignDraftService.ts')
const { scrollToFirstInvalidCampaignField } = await import('../src/shared/utils/campaignFormValidation.ts')
const { STORAGE_KEYS, storageService } = await import('../src/shared/services/storageService.ts')
const base = {
  sellerName: '', businessType: 'general_business', brandId: '', products: [],
  salesChannelType: 'supplier_link', startDate: '', endDate: '', linkOpenTime: '',
  linkCloseTime: '', settlementDueDate: '', settlementDueDateOverridden: false,
  winnerAnnouncementDate: '', winnerAnnouncementDateOverride: false, managerId: '',
  mdId: 'u-004', memo: '', events: [], campaignName: '', nameOverridden: false,
}
const first = campaignDraftService.createCampaignDraft('u-001', '허윤정', { ...base, sellerName: '첫 셀러' })
const second = campaignDraftService.createCampaignDraft('u-001', '허윤정', { ...base, sellerName: '둘째 셀러' })
campaignDraftService.updateCampaignDraft(first.id, { ...first.formData, brandId: 'brand-locknlock' }, '첫 초안')
const afterUpdate = campaignDraftService.listCampaignDraftsByOwner('u-001')
campaignDraftService.deleteCampaignDraft(first.id)
const afterDelete = campaignDraftService.listCampaignDraftsByOwner('u-001')
const registrationDraft = campaignDraftService.createCampaignDraft('u-001', '허윤정', { ...base, sellerName: '등록 대상' })
campaignDraftService.completeDraftAfterCampaignCreated(registrationDraft.id, false)
const keptAfterFailure = Boolean(campaignDraftService.getCampaignDraftById(registrationDraft.id))
campaignDraftService.completeDraftAfterCampaignCreated(registrationDraft.id, true)
const removedAfterSuccess = !campaignDraftService.getCampaignDraftById(registrationDraft.id)
const registrationCleanupPassed = removedAfterSuccess && Boolean(campaignDraftService.getCampaignDraftById(second.id))

let scrolled = false
let focused = false
globalThis.document = {
  getElementById: (id) => id === 'campaign-field-seller' ? {
    scrollIntoView: (options) => { scrolled = options.behavior === 'smooth' && options.block === 'center' },
    querySelector: () => ({ focus: () => { focused = true } }),
  } : null,
}
const firstError = scrollToFirstInvalidCampaignField({ sellerId: '셀러를 선택해주세요.', brandId: '브랜드를 선택해주세요.' })
await new Promise((resolve) => setTimeout(resolve, 380))

storageService.setItem(STORAGE_KEYS.campaigns, [{ id: 'campaign-regression' }])
storageService.removeItem(STORAGE_KEYS.campaignCreateDrafts)
storageService.removeItem(STORAGE_KEYS.campaignCreateDraftMigrationCompleted)
storageService.setItem(STORAGE_KEYS.campaignCreateDraft, { ...base, sellerName: '레거시 셀러' })
const migratedLegacy = campaignDraftService.listCampaignDraftsByOwner('u-001', '허윤정')
const checks = [
  ['임시저장 2건 생성', afterUpdate.length === 2],
  ['draftId별 이어서 작성 데이터', afterUpdate.find((draft) => draft.id === first.id)?.formData.sellerName === '첫 셀러'],
  ['새 일정이 기존 draft를 유지', afterUpdate.some((draft) => draft.id === second.id)],
  ['특정 draft만 삭제', afterDelete.length === 1 && afterDelete[0].id === second.id],
  ['등록 실패 시 draft 유지', keptAfterFailure],
  ['등록 성공 후 해당 draft 삭제', registrationCleanupPassed],
  ['필수값 첫 오류 스크롤·focus', firstError === 'sellerId' && scrolled && focused],
  ['Campaign과 draft 저장소 분리', storageService.getItem(STORAGE_KEYS.campaigns, []).length === 1 && afterDelete.length === 1],
  ['기존 단일 draft 보존·호환', migratedLegacy.length === 1 && migratedLegacy[0].formData.sellerName === '레거시 셀러' && Boolean(storageService.getItem(STORAGE_KEYS.campaignCreateDraft, null))],
]
for (const [name, passed] of checks) console.log(`${passed ? 'PASS' : 'FAIL'} ${name}`)
console.log(`TOTAL ${checks.filter(([, passed]) => passed).length}/${checks.length}`)
if (checks.some(([, passed]) => !passed)) process.exitCode = 1
