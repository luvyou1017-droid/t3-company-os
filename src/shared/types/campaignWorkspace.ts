export type CampaignTab =
  | 'overview'
  | 'timeline'
  | 'work'
  | 'files'
  | 'communications'
  | 'samples'
  | 'cs'
  | 'sales'
  | 'settlement'
  | 'history'

export type CampaignActivity = {
  id: string
  campaignId: string
  occurredAt: string
  actor: string
  eventType: string
  description: string
  relatedMenu: string
  relatedDataId: string
  before?: string
  after?: string
  memo?: string
}

export type CampaignFileType =
  | '제안서' | '계약서' | '배너' | '상세페이지' | '가격 안내'
  | '링크 자료' | '정산서' | '세무 증빙' | '기타'

export type CampaignFile = {
  id: string
  campaignId: string
  fileName: string
  fileType: CampaignFileType
  uploadedAt: string
  uploadedBy: string
  version: string
  memo: string
  linkedStage: string
  expectedSampleQuantity?: number
  expectedSampleUnitPrice?: number
  expectedCostOwner?: string
  totalCommissionRate?: number
  sellerCommissionRate?: number
  salesConditions?: string
}

export type CommunicationChannel = '카카오톡' | '전화' | '이메일' | '노션' | '내부 메모' | '회의' | '기타'

export type CampaignCommunication = {
  id: string
  campaignId: string
  occurredAt: string
  target: string
  author: string
  channel: CommunicationChannel
  title: string
  content: string
  followUpRequired: boolean
  dueDate?: string
  assigneeId?: string
  assigneeName?: string
  followUpWorkItemId?: string
}
