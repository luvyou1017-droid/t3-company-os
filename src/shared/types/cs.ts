import type { WorkPriority } from '../../features/myWork/types'

export type CsSourceType = 'kakao-channel-form' | 'direct-form' | 'phone' | 'seller-dm' | 'brand' | 'internal'

export type CsBaseStatus =
  | '신규'
  | '담당자 확인'
  | '브랜드 전달'
  | '브랜드 답변 대기'
  | '고객 답변 대기'
  | '처리 중'
  | '처리 완료'
  | '보류'
  | '운영 기간 종료'

export type CsEntity = {
  id: string
  campaignId: string
  caseNumber: string
  assigneeId: string
  status: CsBaseStatus
  priority: WorkPriority
  source: CsSourceType
  relatedWorkItemId?: string
  createdAt?: string
  updatedAt?: string
}
