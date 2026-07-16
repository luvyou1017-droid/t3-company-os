import type { WorkPriority } from '../myWork/types'

export type CsType = '불량·교환' | '배송 누락' | '오발송' | '배송 지연' | '반품·환불' | '상품 문의' | '기타'
export type CsStatus =
  | '신규'
  | '담당자 확인'
  | '브랜드 전달'
  | '브랜드 답변 대기'
  | '고객 답변 대기'
  | '처리 중'
  | '처리 완료'
  | '보류'
  | '운영 기간 종료'
export type CsSource = 'kakao-channel-form' | 'direct-form' | 'phone' | 'seller-dm' | 'brand' | 'internal'
export type CsPriority = WorkPriority

export type CsAttachment = {
  id: string
  csCaseId: string
  fileName: string
  fileType: 'image' | 'video'
  mimeType: string
  fileSize: number
  previewUrl?: string
  storagePath: string
  uploadedAt: string
  verifiedAt?: string
  verifiedBy?: string
}

export type CsActivityLog = {
  id: string
  at: string
  actor: string
  action: string
  before?: string
  after?: string
  memo?: string
}

export type CsNotification = {
  id: string
  campaignId: string
  relatedType: 'cs' | 'sample' | 'work' | 'settlement' | 'payment' | 'campaign'
  relatedId: string
  recipientId: string
  recipientName: string
  csCaseId: string
  caseNumber: string
  title: string
  message: string
  createdAt: string
  read: boolean
  isRead: boolean
}

export type CsIntakeFormData = {
  customerName: string
  customerPhone: string
  productName: string
  optionName: string
  csType: CsType | ''
  description: string
  privacyConsent: boolean
  quantity: string
  purchaseDate: string
  receivedDate: string
  desiredResolution: string
  contactAvailableTime: string
}

export type CsCase = {
  id: string
  caseNumber: string
  campaignId: string
  campaignCode: string
  campaignName: string
  sellerName: string
  brandName: string
  productName: string
  customerName: string
  customerPhone: string
  optionName: string
  quantity?: string
  purchaseDate?: string
  receivedDate?: string
  csType: CsType
  desiredResolution?: string
  description: string
  source: CsSource
  status: CsStatus
  priority: CsPriority
  assigneeId: string
  assigneeName: string
  receivedAt: string
  dueAt: string
  completedAt?: string
  privacyConsent: boolean
  attachments: CsAttachment[]
  activityLogs: CsActivityLog[]
}

export type CsCampaign = {
  campaignId: string
  campaignCode: string
  campaignName: string
  sellerName: string
  brandName: string
  productName: string
  period: string
  supportCompany: string
  linkOwner: '자사' | '브랜드사' | '셀러'
  managerName: string
}
