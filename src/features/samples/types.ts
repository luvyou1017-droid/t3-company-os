export type SampleStatus =
  | '요청 접수'
  | '승인 대기'
  | '발주 대기'
  | '발주 완료'
  | '배송 중'
  | '수령 완료'
  | '회수 예정'
  | '회수 완료'
  | '정산 반영 대기'
  | '완료'
  | '취소'

export type SamplePaymentType = '유상' | '무상'
export type SampleCostOwner = '회사' | '셀러' | '브랜드사' | '매니저' | '미정'
export type SampleDeliveryStatus = '발주 전' | '발주 완료' | '배송 중' | '수령 완료' | '배송 지연' | '없음'
export type SampleReturnStatus = '회수 불필요' | '회수 예정' | '회수 완료' | '회수 지연'

export type SampleActivityLog = {
  id: string
  at: string
  actor: string
  action: string
  before?: string
  after?: string
  memo?: string
}

export type SampleAttachment = {
  id: string
  fileName: string
  fileType: string
  storagePath: string
  uploadedAt: string
}

export type SampleRequest = {
  id: string
  campaignId: string
  campaignName: string
  sellerName: string
  brandName: string
  productName: string
  optionName: string
  quantity: number
  requestedAt: string
  requestedBy: string
  managerName: string
  orderManagerName: string
  orderMethod: '브랜드사 링크' | '발주 프로그램' | '카카오톡 요청' | '직접 구매' | '기타'
  paymentType: SamplePaymentType
  costOwner: SampleCostOwner
  sampleCost: number
  shippingCost: number
  deliveryStatus: SampleDeliveryStatus
  trackingNumber?: string
  shippedAt?: string
  receivedAt?: string
  returnRequired: boolean
  returnDueDate?: string
  returnedAt?: string
  settlementReflected: boolean
  settlementAmount: number
  status: SampleStatus
  memo: string
  attachments: SampleAttachment[]
  activityLogs: SampleActivityLog[]
}

export type SampleFilter = {
  quick: string
  search: string
  managerName: string
  orderManagerName: string
  paymentType: string
  costOwner: string
  startDate: string
  endDate: string
}
