import { initialCsCases } from '../../features/cs/mockData'
import type { CsCase } from '../../features/cs/types'
import { notificationService } from './notificationService'
import { STORAGE_KEYS, storageService } from './storageService'
import { workService } from './workService'

export const csService = {
  getCsCases() {
    return storageService.getItem<CsCase[]>(STORAGE_KEYS.csCases, initialCsCases)
  },
  saveCsCases(cases: CsCase[]) {
    storageService.setItem(STORAGE_KEYS.csCases, cases)
  },
  getCsCasesByCampaignId(campaignId: string) {
    return this.getCsCases().filter((csCase) => csCase.campaignId === campaignId)
  },
  createCsCase(csCase: CsCase) {
    this.saveCsCases([csCase, ...this.getCsCases().filter((item) => item.id !== csCase.id)])
    workService.syncWorkItemFromSource('cs', csCase)
    notificationService.createNewCsNotification(csCase)
    return csCase
  },
  updateCsCase(nextCase: CsCase) {
    this.saveCsCases(this.getCsCases().map((item) => (item.id === nextCase.id ? nextCase : item)))
    if (nextCase.status === '처리 완료') this.completeCsCase(nextCase)
    return nextCase
  },
  completeCsCase(csCase: CsCase) {
    workService.completeByCsCase(csCase)
    const notification = notificationService.getNotifications().find((item) => item.relatedId === csCase.id || item.csCaseId === csCase.id)
    if (notification) notificationService.markAsRead(notification.id)
  },
}
