import type { SampleCostOwner, SampleRequest, SampleStatus } from './types'

export function calculateSampleSettlementTarget(sample: Pick<SampleRequest, 'paymentType' | 'costOwner'>) {
  if (sample.paymentType === '무상') return '정산 반영 금액 0원'
  if (sample.costOwner === '회사') return '회사 수익 차감 예정'
  if (sample.costOwner === '셀러') return '셀러 지급액 차감 예정'
  if (sample.costOwner === '브랜드사') return '정산 미반영'
  if (sample.costOwner === '매니저') return '별도 비용 기록'
  return '비용 부담 확인 필요'
}

export function isSampleReturnOverdue(sample: SampleRequest) {
  return sample.returnRequired && !!sample.returnDueDate && !sample.returnedAt && sample.returnDueDate < '2026-07-15'
}

export function getSampleStatusTone(status: SampleStatus) {
  if (status === '요청 접수' || status === '승인 대기') return 'warning'
  if (status === '발주 대기' || status === '발주 완료' || status === '배송 중') return 'progress'
  if (status === '수령 완료') return 'teal'
  if (status === '회수 예정') return 'danger'
  if (status === '정산 반영 대기') return 'settlement'
  if (status === '완료') return 'complete'
  return 'muted'
}

export function isCostOwnerInvalid(paymentType: string, costOwner: SampleCostOwner) {
  return paymentType === '유상' && costOwner === '미정'
}

export function formatWon(value: number) {
  return `${value.toLocaleString('ko-KR')}원`
}
