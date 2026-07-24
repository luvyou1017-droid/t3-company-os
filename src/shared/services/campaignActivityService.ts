import type { CampaignActivity } from '../types/campaignWorkspace'
import { STORAGE_KEYS, storageService } from './storageService'

export const campaignActivityService = {
  getActivities() {
    return storageService.getItem<CampaignActivity[]>(STORAGE_KEYS.campaignActivities, [])
  },
  getByCampaignId(campaignId: string) {
    return this.getActivities()
      .filter((item) => item.campaignId === campaignId)
      .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt))
  },
  add(activity: CampaignActivity) {
    storageService.setItem(STORAGE_KEYS.campaignActivities, [
      activity,
      ...this.getActivities().filter((item) => item.id !== activity.id),
    ])
    return activity
  },
}
