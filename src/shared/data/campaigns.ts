import type { Campaign } from '../types/campaign'

// 운영 데이터는 사용자가 등록한 일정만 표시합니다.
export const campaigns: Campaign[] = []

export function getCampaignName(campaignId: string) {
  return campaigns.find((item) => item.id === campaignId)?.campaignName ?? campaignId
}

export function findCampaignByName(campaignName: string) {
  return campaigns.find((item) => item.campaignName === campaignName)
}
