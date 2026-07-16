import type { CsCase, CsNotification } from '../../features/cs/types'
import type { SampleRequest } from '../../features/samples/types'
import { STORAGE_KEYS, storageService } from './storageService'

export interface NotificationProvider {
  sendNewCsNotification: (csCase: CsCase) => void
  sendCsStatusChangedNotification: (csCase: CsCase) => void
  sendCsCompletedNotification: (csCase: CsCase) => void
}

export class MockNotificationProvider implements NotificationProvider {
  private record(type: string, csCase: CsCase) {
    const logs = storageService.getItem<string[]>(STORAGE_KEYS.notificationSendLogs, [])
    storageService.setItem(STORAGE_KEYS.notificationSendLogs, [`${type}: ${csCase.caseNumber}`, ...logs])
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
  getNotifications() {
    return storageService.getItem<CsNotification[]>(STORAGE_KEYS.notifications, [])
  },
  createNotification(notification: CsNotification) {
    storageService.setItem(STORAGE_KEYS.notifications, [notification, ...this.getNotifications().filter((item) => item.id !== notification.id)])
    return notification
  },
  createNewCsNotification(csCase: CsCase) {
    const notification: CsNotification = {
      id: crypto.randomUUID(),
      campaignId: csCase.campaignId,
      relatedType: 'cs',
      relatedId: csCase.id,
      recipientId: csCase.assigneeId,
      recipientName: csCase.assigneeName,
      csCaseId: csCase.id,
      caseNumber: csCase.caseNumber,
      title: '새로운 CS가 접수되었습니다.',
      message: `공동구매: ${csCase.campaignName}\n유형: ${csCase.csType}\n첨부: 이미지 ${csCase.attachments.filter((item) => item.fileType === 'image').length}개, 영상 ${csCase.attachments.filter((item) => item.fileType === 'video').length}개\n접수번호: ${csCase.caseNumber}`,
      createdAt: csCase.receivedAt,
      read: false,
      isRead: false,
    }
    this.createNotification(notification)
    notificationProvider.sendNewCsNotification(csCase)
    return notification
  },
  createSampleNotification(sample: SampleRequest, title: string) {
    return this.createNotification({
      id: crypto.randomUUID(),
      campaignId: sample.campaignId,
      relatedType: 'sample',
      relatedId: sample.id,
      recipientId: sample.orderManagerName === '허수정' ? 'u-002' : sample.orderManagerName === '김병희' ? 'u-005' : 'u-001',
      recipientName: sample.orderManagerName,
      csCaseId: sample.id,
      caseNumber: sample.id,
      title,
      message: `공동구매: ${sample.campaignName}\n상품: ${sample.productName}\n상태: ${sample.status}`,
      createdAt: sample.requestedAt,
      read: false,
      isRead: false,
    })
  },
  markAsRead(id: string) {
    if (!id) return
    storageService.setItem(
      STORAGE_KEYS.notifications,
      this.getNotifications().map((item) => (item.id === id ? { ...item, read: true, isRead: true } : item)),
    )
  },
  getRelatedCs(notification: CsNotification, cases: CsCase[]) {
    return notification.relatedType === 'cs' ? cases.find((item) => item.id === notification.relatedId) : undefined
  },
  getRelatedSample(notification: CsNotification, samples: SampleRequest[]) {
    return notification.relatedType === 'sample' ? samples.find((item) => item.id === notification.relatedId) : undefined
  },
}
