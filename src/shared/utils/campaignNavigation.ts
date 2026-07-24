import type { CampaignTab } from '../types/campaignWorkspace'

export function openCampaignDetail(campaignId: string, tab: CampaignTab = 'overview') {
  window.history.pushState({}, '', `/campaigns/${encodeURIComponent(campaignId)}?tab=${tab}`)
  window.dispatchEvent(new PopStateEvent('popstate'))
}
