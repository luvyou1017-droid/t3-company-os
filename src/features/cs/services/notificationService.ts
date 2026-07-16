import type { CsCase, CsNotification } from '../types'
import { storageService } from './storageService'

const NOTIFICATION_KEY = 't3.notifications'
const SEND_LOG_KEY = 't3.notification.sendLogs'

export interface NotificationProvider {
  sendNewCsNotification: (csCase: CsCase) => void
  sendCsStatusChangedNotification: (csCase: CsCase) => void
  sendCsCompletedNotification: (csCase: CsCase) => void
}

// Replace this with KakaoNotificationProvider, EmailNotificationProvider, or SlackNotificationProvider later.
export class MockNotificationProvider implements NotificationProvider {
  private record(type: string, csCase: CsCase) {
    const logs = storageService.get<string[]>(SEND_LOG_KEY, [])
    storageService.set(SEND_LOG_KEY, [`${type}: ${csCase.caseNumber}`, ...logs])
  }

  sendNewCsNotification(csCase: CsCase) {
    this.record('new-cs', csCase)
  }
  sendCsStatusChangedNotification(csCase: CsCase) {
    this.record('status-changed', csCase)
  }
  sendCsCompletedNotification(csCase: CsCase) {
    this.record('completed', csCase)
  }
}

export const notificationProvider = new MockNotificationProvider()

export const notificationService = {
  list() {
    return storageService.get<CsNotification[]>(NOTIFICATION_KEY, [])
  },
  createNewCsNotification(csCase: CsCase) {
    const notification: CsNotification = {
      id: crypto.randomUUID(),
      recipientId: csCase.assigneeId,
      recipientName: csCase.assigneeName,
      csCaseId: csCase.id,
      caseNumber: csCase.caseNumber,
      title: '새로운 CS가 접수되었습니다.',
      message: `공동구매: ${csCase.campaignName}\n유형: ${csCase.csType}\n첨부: 이미지 ${csCase.attachments.filter((item) => item.fileType === 'image').length}개, 영상 ${csCase.attachments.filter((item) => item.fileType === 'video').length}개\n접수번호: ${csCase.caseNumber}`,
      createdAt: csCase.receivedAt,
      read: false,
    }
    storageService.set(NOTIFICATION_KEY, [notification, ...this.list()])
    notificationProvider.sendNewCsNotification(csCase)
    return notification
  },
  markRead(id: string) {
    storageService.set(
      NOTIFICATION_KEY,
      this.list().map((item) => (item.id === id ? { ...item, read: true } : item)),
    )
  },
}
