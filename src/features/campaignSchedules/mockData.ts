import { campaigns } from '../../shared/data/campaigns'
import type { CampaignSchedule } from './types'

export const currentManagerName = '허윤정'

export const campaignSchedules: CampaignSchedule[] = campaigns.map((campaign) => ({
  id: campaign.id,
  campaignName: campaign.campaignName,
  sellerName: campaign.sellerName,
  brandName: campaign.brandName,
  productName: campaign.productName,
  managerName: campaign.managerName,
  mdName: campaign.mdName,
  startDate: campaign.startDate || undefined,
  endDate: campaign.endDate || undefined,
  linkOwner: campaign.linkOwner,
  landingPageCompleted: Boolean(campaign.landingPageCompleted),
  sellerBusinessType: campaign.businessType,
  pendingTaskCount: campaign.pendingTaskCount ?? 0,
  pendingCsCount: campaign.pendingCsCount ?? 0,
  pendingSampleCount: campaign.pendingSampleCount ?? 0,
  linkReviewPending: Boolean(campaign.linkReviewPending),
  orderPending: Boolean(campaign.orderPending),
  vendorSettlementCompleted: Boolean(campaign.vendorSettlementCompleted),
  settlementDocumentCompleted: Boolean(campaign.settlementDocumentCompleted),
  sellerPaymentCompleted: Boolean(campaign.sellerPaymentCompleted),
  managerPaymentCompleted: Boolean(campaign.managerPaymentCompleted),
  todayTask: campaign.todayTask ?? '',
}))
