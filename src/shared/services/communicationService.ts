import type { CampaignCommunication } from '../types/campaignWorkspace'
import { campaignActivityService } from './campaignActivityService'
import { campaignService } from './campaignService'
import { STORAGE_KEYS, storageService } from './storageService'
import { workService } from './workService'

export const communicationService = {
  getCommunications() {
    return storageService.getItem<CampaignCommunication[]>(STORAGE_KEYS.communications, [])
  },
  getByCampaignId(campaignId: string) {
    return this.getCommunications().filter((item) => item.campaignId === campaignId)
  },
  create(communication: CampaignCommunication) {
    let saved = communication
    if (communication.followUpRequired && communication.assigneeId && communication.dueDate) {
      const campaign = campaignService.getCampaignById(communication.campaignId)
      const work = workService.createCampaignWorkItem({
        campaignId: communication.campaignId,
        title: communication.title,
        description: communication.content,
        assigneeId: communication.assigneeId,
        assigneeName: communication.assigneeName ?? '미배정',
        dueDate: communication.dueDate,
        priority: 'high',
        category: '소통',
        campaignName: campaign?.campaignName,
        sellerName: campaign?.sellerName,
        brandName: campaign?.brandName,
      })
      saved = { ...communication, followUpWorkItemId: work.id }
    }
    storageService.setItem(STORAGE_KEYS.communications, [saved, ...this.getCommunications()])
    campaignActivityService.add({
      id: crypto.randomUUID(), campaignId: saved.campaignId, occurredAt: saved.occurredAt,
      actor: saved.author, eventType: '소통 기록', description: saved.title,
      relatedMenu: '소통', relatedDataId: saved.id, memo: saved.content,
    })
    return saved
  },
}
