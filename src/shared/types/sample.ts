import type { SampleCostOwner, SampleStatus } from '../../features/samples/types'

export type SampleEntity = {
  id: string
  campaignId: string
  managerId: string
  orderManagerId: string
  status: SampleStatus
  costOwner: SampleCostOwner
  settlementReflected: boolean
  relatedWorkItemId?: string
  createdAt?: string
  updatedAt?: string
}
