import type { WorkStatus } from '../../features/myWork/types'

export type WorkSourceType = 'manual' | 'cs' | 'sample' | 'settlement' | 'payment' | 'ai'

export type WorkEntity = {
  id: string
  campaignId: string
  sourceType: WorkSourceType
  sourceId: string
  assigneeId: string
  status: WorkStatus
  dueAt: string
  createdAt?: string
  updatedAt?: string
}
