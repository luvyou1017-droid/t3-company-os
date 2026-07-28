import type { Campaign } from '../types/campaign'
import type { CampaignCreationBusinessType, CampaignEvent, CampaignProductSelection } from '../types/campaignCreation'
import { STORAGE_KEYS, storageService } from './storageService.ts'

export interface CampaignCreationFormData {
  sellerId: string
  sellerName: string
  businessType: CampaignCreationBusinessType | ''
  brandId: string
  products: CampaignProductSelection[]
  salesChannelType: NonNullable<Campaign['salesChannelType']> | ''
  salesChannelSource: NonNullable<Campaign['salesChannelSource']>
  salesChannelManuallyOverridden: boolean
  sellerExtraPgRate: number
  startDate: string
  endDate: string
  linkOpenTime: string
  linkCloseTime: string
  settlementDueDate: string
  settlementDueDateOverridden: boolean
  winnerAnnouncementDate: string
  winnerAnnouncementDateOverride: boolean
  managerId: string
  mdId: string
  memo: string
  events: CampaignEvent[]
  campaignName: string
  nameOverridden: boolean
  notionImportMetadata?: Campaign['notionImportMetadata']
  aiDraftMetadata?: Campaign['aiDraftMetadata']
}

export interface CampaignDraft {
  id: string
  ownerId: string
  ownerName: string
  formData: CampaignCreationFormData
  generatedCampaignName?: string
  completionRate: number
  missingRequiredFields: string[]
  createdAt: string
  updatedAt: string
}

export const CAMPAIGN_REQUIRED_FIELD_LABELS = {
  sellerId: '셀러',
  businessType: '사업자 유형',
  brandId: '브랜드',
  campaignProducts: '상품',
  startDate: '시작일',
  endDate: '종료일',
  managerId: '담당 매니저',
  mdId: '담당 MD',
  salesChannelType: '판매 링크 유형',
} as const

export function getDraftMissingFields(form: CampaignCreationFormData) {
  return [
    !form.sellerId && CAMPAIGN_REQUIRED_FIELD_LABELS.sellerId,
    !form.businessType && CAMPAIGN_REQUIRED_FIELD_LABELS.businessType,
    !form.brandId && CAMPAIGN_REQUIRED_FIELD_LABELS.brandId,
    !form.products?.length && CAMPAIGN_REQUIRED_FIELD_LABELS.campaignProducts,
    !form.startDate && CAMPAIGN_REQUIRED_FIELD_LABELS.startDate,
    !form.endDate && CAMPAIGN_REQUIRED_FIELD_LABELS.endDate,
    !form.managerId && CAMPAIGN_REQUIRED_FIELD_LABELS.managerId,
    !form.mdId && CAMPAIGN_REQUIRED_FIELD_LABELS.mdId,
    !form.salesChannelType && CAMPAIGN_REQUIRED_FIELD_LABELS.salesChannelType,
  ].filter(Boolean) as string[]
}

export function calculateDraftCompletionRate(form: CampaignCreationFormData) {
  const total = Object.keys(CAMPAIGN_REQUIRED_FIELD_LABELS).length
  return Math.round(((total - getDraftMissingFields(form).length) / total) * 100)
}

function enrich(draft: CampaignDraft): CampaignDraft {
  const formData = {
    ...draft.formData,
    products: draft.formData.products ?? [],
    events: draft.formData.events ?? [],
  }
  return {
    ...draft,
    formData,
    completionRate: calculateDraftCompletionRate(formData),
    missingRequiredFields: getDraftMissingFields(formData),
  }
}

function migrateLegacyDraft(ownerId: string, ownerName: string) {
  const drafts = storageService.getItem<CampaignDraft[]>(STORAGE_KEYS.campaignCreateDrafts, [])
  if (storageService.getItem(STORAGE_KEYS.campaignCreateDraftMigrationCompleted, false)) return drafts
  const legacy = storageService.getItem<Partial<CampaignCreationFormData> | null>(STORAGE_KEYS.campaignCreateDraft, null)
  if (!legacy) {
    storageService.setItem(STORAGE_KEYS.campaignCreateDraftMigrationCompleted, true)
    return drafts
  }
  const now = new Date().toISOString()
  const migrated = enrich({
    id: 'draft-legacy-campaign-create',
    ownerId,
    ownerName,
    formData: legacy as CampaignCreationFormData,
    generatedCampaignName: legacy.campaignName,
    completionRate: 0,
    missingRequiredFields: [],
    createdAt: now,
    updatedAt: now,
  })
  const next = [migrated, ...drafts]
  storageService.setItem(STORAGE_KEYS.campaignCreateDrafts, next)
  storageService.setItem(STORAGE_KEYS.campaignCreateDraftMigrationCompleted, true)
  return next
}

export const campaignDraftService = {
  listCampaignDraftsByOwner(ownerId: string, ownerName = '') {
    return migrateLegacyDraft(ownerId, ownerName)
      .filter((draft) => draft.ownerId === ownerId)
      .map(enrich)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  },
  getCampaignDraftById(id: string) {
    return storageService.getItem<CampaignDraft[]>(STORAGE_KEYS.campaignCreateDrafts, []).find((draft) => draft.id === id)
  },
  createCampaignDraft(ownerId: string, ownerName: string, formData: CampaignCreationFormData, generatedCampaignName?: string) {
    const now = new Date().toISOString()
    const draft = enrich({
      id: `draft-${crypto.randomUUID()}`, ownerId, ownerName, formData,
      generatedCampaignName, completionRate: 0, missingRequiredFields: [], createdAt: now, updatedAt: now,
    })
    storageService.setItem(STORAGE_KEYS.campaignCreateDrafts, [draft, ...storageService.getItem<CampaignDraft[]>(STORAGE_KEYS.campaignCreateDrafts, [])])
    return draft
  },
  updateCampaignDraft(id: string, formData: CampaignCreationFormData, generatedCampaignName?: string) {
    let updated: CampaignDraft | undefined
    const drafts = storageService.getItem<CampaignDraft[]>(STORAGE_KEYS.campaignCreateDrafts, []).map((draft) => {
      if (draft.id !== id) return draft
      updated = enrich({ ...draft, formData, generatedCampaignName, updatedAt: new Date().toISOString() })
      return updated
    })
    storageService.setItem(STORAGE_KEYS.campaignCreateDrafts, drafts)
    return updated
  },
  deleteCampaignDraft(id: string) {
    const drafts = storageService.getItem<CampaignDraft[]>(STORAGE_KEYS.campaignCreateDrafts, [])
    storageService.setItem(STORAGE_KEYS.campaignCreateDrafts, drafts.filter((draft) => draft.id !== id))
  },
  completeDraftAfterCampaignCreated(id: string | null, campaignCreated: boolean) {
    if (id && campaignCreated) this.deleteCampaignDraft(id)
  },
}
