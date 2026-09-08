import type { CsCampaign, CsCase } from './types'
import { campaigns } from '../../shared/data/campaigns'

export const csCampaigns: CsCampaign[] = campaigns.map((campaign) => ({
  campaignId: campaign.id,
  campaignCode: campaign.campaignCode,
  campaignName: campaign.campaignName,
  sellerName: campaign.sellerName,
  brandName: campaign.brandName,
  productName: campaign.productName,
  period: [campaign.startDate, campaign.endDate].filter(Boolean).join(' ~ '),
  supportCompany: campaign.supportCompany ?? 'T3 Company',
  linkOwner: campaign.linkOwner,
  managerName: campaign.managerName,
}))

export const initialCsCases: CsCase[] = []
