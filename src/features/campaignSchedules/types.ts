export type LinkOwner = '자사' | '브랜드사' | '셀러'

export type CampaignSchedule = {
  id: string
  campaignName: string
  sellerName: string
  brandName: string
  productName: string
  managerName: string
  mdName: string
  startDate?: string
  endDate?: string
  linkOwner: LinkOwner
  landingPageCompleted: boolean
  sellerBusinessType: string
  pendingTaskCount: number
  pendingCsCount: number
  pendingSampleCount: number
  linkReviewPending: boolean
  orderPending: boolean
  vendorSettlementCompleted: boolean
  settlementDocumentCompleted: boolean
  sellerPaymentCompleted: boolean
  managerPaymentCompleted: boolean
  todayTask: string
}

export type CampaignStatus =
  | '😊 최종 완료'
  | '7️⃣ 매니저 정산 완료'
  | '6️⃣ 셀러 정산 완료'
  | '5️⃣ 정산서 완성'
  | '4️⃣ 업체 정산 완료'
  | '3️⃣ 어제 공구 마감'
  | '3️⃣ 공구 종료'
  | '2️⃣ 진행 중'
  | '1️⃣ 일정 픽스'
  | '미정'

export type CampaignViewTab = '전체' | '내 일정' | '발주·링크' | 'CS' | '샘플' | '정산' | '완료'

export type CampaignFilters = {
  search: string
  managerName: string
  status: string
  linkOwner: string
  startDate: string
  endDate: string
}
