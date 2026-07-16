export type WorkRole = '대표' | '팀장' | '매니저' | 'MD' | '정산 담당자'

export type WorkPriority = 'urgent' | 'high' | 'medium' | 'low'

export type WorkStatus = 'todo' | 'in_progress' | 'blocked' | 'completed' | 'on_hold'

export type WorkType =
  | '링크 요청'
  | '링크 검수'
  | '배너 검수'
  | '샘플 발주'
  | '샘플 회수'
  | '10시 매출 전달'
  | '17시 매출 전달'
  | 'CS 답변'
  | '판매 데이터 요청'
  | '판매 데이터 검수'
  | '정산서 작성'
  | '정산서 검토'
  | '세금계산서 발행'
  | '셀러 증빙 확인'
  | '지급 승인'
  | '매니저 지급'
  | '최저가 확인'
  | '재고 확인'
  | '회사 수익 확인'
  | '예외 승인'
  | '일정 충돌 확인'

export type WorkUser = {
  id: string
  name: string
  role: WorkRole
}

export type WorkActivityLog = {
  id: string
  at: string
  message: string
}

export type WorkItem = {
  id: string
  title: string
  description: string
  workType: WorkType
  status: WorkStatus
  campaignId: string
  sourceType: 'manual' | 'cs' | 'sample' | 'sales_data' | 'settlement' | 'payment' | 'ai'
  sourceId: string
  campaignName: string
  sellerName: string
  brandName: string
  assigneeId: string
  assigneeName: string
  assigneeRole: WorkRole
  dueDate: string
  dueTime: string
  dueAt: string
  completedAt?: string
  createdReason: string
  relatedMenu: string
  checklistName: string
  relatedLink: string
  hasLinkError?: boolean
  hasPriceError?: boolean
  isDdayCampaign?: boolean
  isSettlementDelayed?: boolean
  isCsOver24h?: boolean
  activityLogs: WorkActivityLog[]
}

export type WorkFilter = {
  quick: '전체' | '긴급' | '오늘' | '지연' | '완료' | '승인 대기' | '이번 주'
  workType: string
  campaignName: string
  assigneeName: string
  date: string
  search: string
}

export type DailyBriefing = {
  userId: string
  message: string
}
