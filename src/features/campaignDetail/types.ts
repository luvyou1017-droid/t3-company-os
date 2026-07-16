import type { LinkOwner } from '../campaignSchedules/types'

export type CampaignChecklistGroup =
  | 'D-14'
  | 'D-13'
  | 'D-12'
  | 'D-11'
  | 'D-10'
  | 'D-7'
  | 'D-5 ~ D-3'
  | 'D-1'
  | 'D-DAY'
  | '진행 중'
  | '종료 다음 날'
  | 'D+14'
  | 'D+21 ~ D+28'

export type CampaignChecklistItem = {
  id: string
  group: CampaignChecklistGroup
  title: string
  completed: boolean
}

export type CampaignLinkInfo = {
  linkOwner: LinkOwner
  salesLink: string
  externalOrderLink: string
  linkRequester: string
  requestedAt: string
  receivedAt: string
  reviewer: string
  deliveredToSellerAt: string
  reviewChecklist: Record<'판매가' | '옵션' | '배송비' | '오픈 시간' | '종료 시간' | '최저가', boolean>
  reviewCompleted: boolean
  sellerDelivered: boolean
}

export type ProposalCondition = {
  label: string
  proposedValue: string
  confirmedValue: string
}

export type Proposal = {
  id: string
  title: string
  author: string
  createdAt: string
  conditions: ProposalCondition[]
}

export type PriceBannerTemplate = 'detail' | 'feed' | 'story'

export type BannerApprovalStatus = '초안' | '매니저 검수 대기' | '수정 요청' | '확정'

export type PriceBannerConfig = {
  sellerName: string
  headline: string
  brandName: string
  productName: string
  originalPrice: string
  groupBuyPrice: string
  discountRate: string
  saleStartDate: string
  saleEndDate: string
  shippingText: string
  eventText: string
  imageUrl: string
  cautionText: string
  backgroundColor: string
  accentColor: string
  template: PriceBannerTemplate
  status: BannerApprovalStatus
}

export type CampaignDetail = {
  id: string
  campaignName: string
  sellerName: string
  brandName: string
  productName: string
  options: string[]
  round: string
  managerName: string
  mdName: string
  startDate: string
  endDate: string
  settlementDueDate: string
  linkOwner: LinkOwner
  sellerBusinessType: string
  contact: string
  linkReviewStatus: string
  sampleStatus: string
  pendingCsCount: number
  salesDataStatus: string
  settlementStatus: string
  summary: string[]
  checklist: CampaignChecklistItem[]
  linkInfo: CampaignLinkInfo
  proposal: Proposal
  priceBanner: PriceBannerConfig
}
