import type { Settlement, SettlementDeduction } from '../types/settlement'

export const receivableStatuses = ['미처리', '계산서 발행 예정', '계산서 발행 완료', '다음 정산 상계 예정', '상계 완료', '수동 처리 완료'] as const
export type ReceivableStatus = typeof receivableStatuses[number]
export type SellerReceivable = {
  id: string; sellerId: string; principal: number; amount: number; createdAt: string
  status: ReceivableStatus; invoiceAmount?: number; invoiceDate?: string; receivedDate?: string
  history: { at: string; actor: string; action: string; amount: number; memo: string }[]
}
export type ReceivableOffset = { id: string; sourceSettlementId: string; receivableId: string; amount: number; at: string; actor: string }
export function financialLocked(s: Settlement) {
  const confirmed = s.settlementConfirmed === false ? false : Boolean(s.settlementConfirmed || s.settlementConfirmedAt || s.calculationSnapshot)
  return Boolean(confirmed || s.sellerPaymentCompleted || s.managerPaymentCompleted || ['manager_reviewed','approval_pending','approved','payment_ready','partially_paid','completed','canceled'].includes(s.status) || (s.sellerPaymentRequestStatus && s.sellerPaymentRequestStatus !== 'canceled') || (s.managerPaymentRequestStatus && s.managerPaymentRequestStatus !== 'canceled'))
}
export function allocatedAmount(items: Settlement[], receivableId: string) {
  return items.reduce((sum, s) => sum + (s.sellerReceivableOffsets ?? []).filter(o => o.receivableId === receivableId).reduce((n, o) => n + o.amount, 0), 0)
}
export function receivableBalance(items: Settlement[], r: SellerReceivable) {
  return r.receivedDate || r.status === '수동 처리 완료' ? 0 : Math.max(r.amount - allocatedAmount(items, r.id), 0)
}
export function eligibleForOffset(r: SellerReceivable) {
  return !r.receivedDate && ['미처리','다음 정산 상계 예정'].includes(r.status)
}
export function offsetDeductions(s: Settlement): SettlementDeduction[] {
  return (s.sellerReceivableOffsets ?? []).map(o => ({
    id: o.id, settlementId: s.id, campaignId: s.campaignId, type: 'other', direction: 'deduction',
    title: '이전 공구 미수금 상계', amount: o.amount, unitPrice: o.amount, quantity: 1,
    costOwner: 'seller', linkedData: `receivable:${o.receivableId}`, evidenceStatus: 'confirmed',
    applyLocation: 'seller_payment', reflected: true, memo: `원정산 ${o.sourceSettlementId} · 확인자 ${o.actor}`,
    createdAt: o.at, updatedAt: o.at,
  }))
}
// Receivables are metadata alongside the settlement, never inside historical snapshots.
export function reconcileReceivable(next: Settlement, previous: Settlement | undefined, sellerId?: string): Settlement {
  if (previous && financialLocked(previous)) return { ...next, sellerReceivable: previous.sellerReceivable }
  const value = next.currentCalculation.sellerReceivableAmount
  if (value === undefined) return next
  const prior = previous?.sellerReceivable ?? next.sellerReceivable
  if (prior && prior.amount !== value && prior.status !== '미처리') throw new Error('처리 중인 미수금이 있습니다. 미수금 처리 이력을 먼저 확인해주세요.')
  if (!prior && !value) return next
  if (!sellerId && !prior) throw new Error('미수금을 저장하려면 기존 셀러 연결을 확인해주세요.')
  if (prior?.amount === value) return { ...next, sellerReceivable: prior }
  const at = new Date().toISOString()
  const record: SellerReceivable = prior ?? { id: `receivable-${next.id}`, sellerId: sellerId!, principal: value, amount: value, createdAt: at, status: '미처리', history: [] }
  return { ...next, sellerReceivable: { ...record, amount: value, history: [...record.history, { at, actor: next.currentCalculation.calculatedBy || next.assigneeName, action: prior ? '미확정 원금 변경' : '미수금 발생', amount: value, memo: `정산 v${next.settlementVersion}` }] } }
}

export function changeReceivableStatus(items: Settlement[], sourceId: string, status: ReceivableStatus, actor: string, memo: string, invoiceDate?: string, receivedDate?: string) {
  const source = items.find(s => s.id === sourceId)
  const r = source?.sellerReceivable
  if (!source || !r) throw new Error('미수금을 찾을 수 없습니다.')
  if (receivableBalance(items, r) <= 0) throw new Error('이미 처리 완료된 미수금입니다.')
  if (!receivableStatuses.includes(status) || status === '상계 완료') throw new Error('상계 완료는 실제 상계 시 자동 처리됩니다.')
  if (status === '수동 처리 완료' && !memo.trim()) throw new Error('수동 처리 사유를 입력해주세요.')
  for (const date of [invoiceDate, receivedDate].filter(Boolean)) if (!/^\d{4}-\d{2}-\d{2}$/.test(date!) || Number.isNaN(Date.parse(date!))) throw new Error('올바른 날짜를 입력해주세요.')
  if (status === '계산서 발행 완료' && !invoiceDate) throw new Error('계산서 발행일을 입력해주세요.')
  if (receivedDate && status !== '계산서 발행 완료') throw new Error('계산서 발행 완료 후 입금일을 기록해주세요.')
  if (r.invoiceDate && !['계산서 발행 완료','수동 처리 완료'].includes(status)) throw new Error('발행된 계산서가 있습니다. 자동 상계로 변경할 수 없습니다.')
  return items.map(s => s.id !== sourceId ? s : { ...s, sellerReceivable: { ...r, status, invoiceAmount: ['계산서 발행 예정','계산서 발행 완료'].includes(status) ? (r.invoiceAmount ?? receivableBalance(items, r)) : undefined, invoiceDate: invoiceDate || r.invoiceDate, receivedDate: receivedDate || undefined, history: [...r.history, { at: new Date().toISOString(), actor, action: receivedDate ? '계산서 입금 확인' : status, amount: receivableBalance(items, r), memo }] } })
}
