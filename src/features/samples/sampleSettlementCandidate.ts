import { sampleTotals, type SampleOrder } from './sampleOrderModel.ts'
import type { SettlementDeduction } from '../../shared/types/settlement'

const ORDERED = new Set<SampleOrder['status']>(['발주완료', '배송중', '수령완료'])

export function sampleOrderLink(orderId: string) {
  return `sample:${orderId}`
}

export function isLinkedSampleDeduction(item: SettlementDeduction, orderId: string) {
  const link = sampleOrderLink(orderId)
  return item.type === 'sample' && (item.linkedData === link || item.linkedData.startsWith(`${link}:`) || item.linkedData === `sample_request_id:${orderId}`)
}

export function sampleSettlementCandidate(order: SampleOrder, campaignId: string): {
  reason?: string
  deduction?: Omit<SettlementDeduction, 'id' | 'settlementId' | 'createdAt' | 'updatedAt'>
} {
  if (order.campaignId !== campaignId) return { reason: '다른 공구의 샘플입니다.' }
  if (order.status === '취소') return { reason: '취소된 샘플입니다.' }
  if (!ORDERED.has(order.status)) return { reason: '발주 완료 후 반영할 수 있습니다.' }
  const totals = sampleTotals(order)
  if (totals.companyCost === null || (order.payer === 'seller' && totals.sellerDeduction === null) || totals.companyBurden === null) return { reason: '회사 원가 또는 셀러 적용 공급가를 확인해주세요.' }
  const amount = order.payer === 'seller' ? totals.sellerDeduction! : order.payer === 'supplier' ? totals.companyBurden : totals.companyCost
  if (!Number.isSafeInteger(amount) || amount <= 0) return { reason: '정산에 반영할 금액이 없습니다.' }
  const costOwner = order.payer === 'supplier' ? 'company' : order.payer
  const applyLocation = costOwner === 'seller' ? 'seller_payment' : costOwner === 'manager' ? 'manager_payment' : 'net_company_commission'
  return { deduction: {
    campaignId,
    type: 'sample',
    title: `${order.productName} ${order.optionName} 샘플비`,
    amount,
    unitPrice: order.payer === 'seller' ? order.costs.sellerUnitPrice! : order.costs.companyUnitCost!,
    quantity: order.quantity,
    sampleCompanyCost: order.payer === 'seller' ? totals.companyCost : undefined,
    costOwner,
    linkedData: sampleOrderLink(order.id),
    evidenceStatus: 'pending',
    applyLocation,
    reflected: true,
    memo: `샘플관리 연결 · ${order.id} · 회사 실제원가 ${totals.companyCost.toLocaleString('ko-KR')}원${order.payer === 'seller' ? ` · 회사 귀속 차액 ${totals.difference!.toLocaleString('ko-KR')}원` : ''}`,
  } }
}
