import type { Campaign, CampaignSalesChannelType } from '../types/campaign'

const salesChannelTypes = new Set<CampaignSalesChannelType>(['supplier_link', 'wise_shop_link', 'seller_checkout'])

export function getCampaignSalesChannel(campaign?: Pick<Campaign, 'salesChannelType' | 'landingPageType' | 'linkOwner'>): CampaignSalesChannelType | undefined {
  if (!campaign) return undefined
  if (campaign.salesChannelType) return campaign.salesChannelType
  if (campaign.landingPageType && salesChannelTypes.has(campaign.landingPageType as CampaignSalesChannelType)) {
    return campaign.landingPageType as CampaignSalesChannelType
  }
  if (campaign.linkOwner === '셀러') return 'seller_checkout'
  if (campaign.linkOwner === '자사') return 'wise_shop_link'
  if (campaign.linkOwner === '브랜드사') return 'supplier_link'
  return undefined
}
