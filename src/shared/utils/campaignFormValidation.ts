export const CAMPAIGN_FIELD_ORDER = ['sellerId', 'businessType', 'brandId', 'campaignProducts', 'startDate', 'endDate', 'managerId', 'mdId', 'salesChannelType'] as const
export type CampaignFormErrorKey = (typeof CAMPAIGN_FIELD_ORDER)[number]

export const CAMPAIGN_FIELD_IDS: Record<CampaignFormErrorKey, string> = {
  sellerId: 'campaign-field-seller',
  businessType: 'campaign-field-business-type',
  brandId: 'campaign-field-brand',
  campaignProducts: 'campaign-field-products',
  startDate: 'campaign-field-start-date',
  endDate: 'campaign-field-end-date',
  managerId: 'campaign-field-manager',
  mdId: 'campaign-field-md',
  salesChannelType: 'campaign-field-sales-channel',
}

export function scrollToFirstInvalidCampaignField(
  errors: Partial<Record<CampaignFormErrorKey, string>>,
  keys: readonly CampaignFormErrorKey[] = CAMPAIGN_FIELD_ORDER,
) {
  const first = keys.find((key) => errors[key])
  if (!first || typeof document === 'undefined') return undefined
  const target = document.getElementById(CAMPAIGN_FIELD_IDS[first])
  target?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  window.setTimeout(() => {
    target?.querySelector<HTMLElement>('input:not([disabled]), select:not([disabled]), textarea, button')?.focus({ preventScroll: true })
  }, 350)
  return first
}
