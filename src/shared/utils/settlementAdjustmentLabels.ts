import type { SettlementDeduction } from '../types/settlement'

export function adjustmentLabel(item: SettlementDeduction) {
  if (item.title?.trim()) return item.title
  if (/^sales_data:.+:srookpay$/.test(item.linkedData ?? '')) return '스룩페이 결제 수수료'
  return ({ sample: '샘플비', event: '이벤트 비용', promotion: '프로모션', purchase: '구매비용', shipping: '배송비', refund: '환불', other: '기타 조정' })[item.type]
}

/** Display only: never change a stored amount when historical detail is incomplete. */
export function namedAdjustmentRows(items: SettlementDeduction[], total: number, fallback: string) {
  const rows = items.filter(item => item.amount > 0).map(item => ({ id: item.id, label: adjustmentLabel(item), amount: item.amount }))
  if (rows.reduce((sum, row) => sum + row.amount, 0) === total) return rows
  return total > 0 ? [{ id: 'stored-total', label: fallback, amount: total }] : []
}
