import type { CsCase } from '../types'
import {
  MockNotificationProvider,
  notificationProvider,
  notificationService as sharedNotificationService,
  type NotificationProvider,
} from '../../../shared/services/notificationService'

export { MockNotificationProvider, notificationProvider, type NotificationProvider }

export const notificationService = {
  list() {
    return sharedNotificationService.getNotifications()
  },
  createNewCsNotification(csCase: CsCase) {
    return sharedNotificationService.createNewCsNotification(csCase)
  },
  markRead(id: string) {
    sharedNotificationService.markAsRead(id)
  },
}
