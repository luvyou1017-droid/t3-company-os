import type { Settlement } from '../types/settlement'

// Display only: no persisted state transition and no calculation changes.
export function settlementWorkflowLabel(settlement: Settlement, fallback: string) {
  const states = [settlement.sellerPaymentRequestStatus, settlement.managerPaymentRequestStatus].filter(Boolean)
  if (states.includes('approval_pending') || settlement.status === 'approval_pending') return '대표 승인 대기'
  if (states.includes('on_hold')) return '지급 보류'
  if (states.includes('evidence_pending')) return '지급 요청 · 증빙 확인 필요'
  if (states.includes('request_ready')) return '지급 요청 준비'
  const paid = (value: string | undefined) => value === 'payment_completed' || value === 'remittance_confirmed'
  if (states.length && states.every(paid)) {
    return settlement.status === 'completed' || (settlement.sellerPaymentCompleted && settlement.managerPaymentCompleted) ? '지급 완료' : '요청 건 지급 완료 · 나머지 정산 확인'
  }
  if (states.some(paid)) return '일부 지급 완료'
  if (states.includes('approved') || states.includes('sent')) return '승인 완료 · 지급 대기'
  return fallback
}
