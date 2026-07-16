export type NotificationRelatedType = 'cs' | 'sample' | 'work' | 'settlement' | 'payment' | 'campaign'

export type NotificationEntity = {
  id: string
  campaignId: string
  relatedType: NotificationRelatedType
  relatedId: string
  recipientId: string
  isRead: boolean
  createdAt: string
}
