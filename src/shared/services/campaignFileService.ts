import type { CampaignFile } from '../types/campaignWorkspace'
import { campaignActivityService } from './campaignActivityService'
import { STORAGE_KEYS, storageService } from './storageService'

export const campaignFileService = {
  getFiles() {
    return storageService.getItem<CampaignFile[]>(STORAGE_KEYS.campaignFiles, [])
  },
  getByCampaignId(campaignId: string) {
    return this.getFiles().filter((item) => item.campaignId === campaignId)
  },
  create(file: CampaignFile) {
    storageService.setItem(STORAGE_KEYS.campaignFiles, [file, ...this.getFiles()])
    campaignActivityService.add({
      id: crypto.randomUUID(), campaignId: file.campaignId, occurredAt: file.uploadedAt,
      actor: file.uploadedBy, eventType: '파일 업로드', description: `${file.fileName} 등록`,
      relatedMenu: '제안서·파일', relatedDataId: file.id, after: file.version, memo: file.memo,
    })
    return file
  },
}
