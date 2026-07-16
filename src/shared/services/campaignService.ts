import { campaigns } from '../data/campaigns'
import type { Campaign, CampaignRelatedCounts, CampaignSummary } from '../types/campaign'
import { STORAGE_KEYS, storageService } from './storageService'

const toSummary = (campaign: Campaign): CampaignSummary => ({
  id: campaign.id,
  campaignCode: campaign.campaignCode,
  campaignName: campaign.campaignName,
  sellerName: campaign.sellerName,
  brandName: campaign.brandName,
  productName: campaign.productName,
  managerName: campaign.managerName,
  mdName: campaign.mdName,
  period: [campaign.startDate, campaign.endDate].filter(Boolean).join(' ~ '),
  linkOwner: campaign.linkOwner,
  businessType: campaign.businessType,
})

export const campaignService = {
  getCampaigns() {
    return storageService.getItem<Campaign[]>(STORAGE_KEYS.campaigns, campaigns)
  },
  getCampaignById(id: string) {
    return this.getCampaigns().find((campaign) => campaign.id === id)
  },
  getCampaignByCode(campaignCode: string) {
    return this.getCampaigns().find((campaign) => campaign.campaignCode === campaignCode)
  },
  getCampaignSummary(id: string) {
    const campaign = this.getCampaignById(id)
    return campaign ? toSummary(campaign) : undefined
  },
  getCampaignRelatedCounts(campaignId: string): CampaignRelatedCounts {
    const csCases = storageService.getItem<Array<{ campaignId: string }>>(STORAGE_KEYS.csCases, [])
    const samples = storageService.getItem<Array<{ campaignId: string }>>(STORAGE_KEYS.samples, [])
    const workItems = storageService.getItem<Array<{ campaignId: string }>>(STORAGE_KEYS.workItems, [])
    const notifications = storageService.getItem<Array<{ campaignId?: string }>>(STORAGE_KEYS.notifications, [])

    return {
      csCount: csCases.filter((item) => item.campaignId === campaignId).length,
      sampleCount: samples.filter((item) => item.campaignId === campaignId).length,
      workItemCount: workItems.filter((item) => item.campaignId === campaignId).length,
      notificationCount: notifications.filter((item) => item.campaignId === campaignId).length,
    }
  },
}
