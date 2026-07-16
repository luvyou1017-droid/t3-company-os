export type ChecklistStatus = 'pending' | 'completed' | 'overdue'

export type ChecklistCategory =
  | 'sample'
  | 'banner'
  | 'link'
  | 'faq'
  | 'sales'
  | 'cs'
  | 'settlement'
  | 'payment'
  | 'approval'

export type CampaignChecklistEntity = {
  id: string
  campaignId: string
  title: string
  category: ChecklistCategory
  group?: string
  dueDate: string
  assigneeId: string
  status: ChecklistStatus
  createdAt: string
}
