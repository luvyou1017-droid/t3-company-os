import { effectiveBurden } from './sampleProvision.ts'
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

export function sampleSettlementCandidate(order: SampleOrder, campaignId: string, finalSales?: number): {
  reason?: string
  deduction?: Omit<SettlementDeduction, 'id' | 'settlementId' | 'createdAt' | 'updatedAt'>
} {
  if (order.campaignId !== campaignId) return { reason: '다른 공구의 샘플입니다.' }
  if (order.status === '취소') return { reason: '취소된 샘플입니다.' }
  if (!ORDERED.has(order.status)) return { reason: '발주 완료 후 반영할 수 있습니다.' }
  if (order.provision) return provisionCandidate(order, campaignId, finalSales)
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

export function sampleSettlementCandidates(order: SampleOrder, campaignId: string, finalSales?: number) {
  if (!order.provision) { const result = sampleSettlementCandidate(order, campaignId); return { reason: result.reason, deductions: result.deduction ? [result.deduction] : [] } }
  if (order.campaignId !== campaignId || order.status === '취소' || !ORDERED.has(order.status)) return { reason: '공구 연결·발주 완료 확인 필요', deductions: [] }
  const result = effectiveBurden(order, finalSales)
  if (!result.shares) return { reason: result.reason, deductions: [] }
  const p = order.provision
  const deductions: Array<Omit<SettlementDeduction, 'id' | 'settlementId' | 'createdAt' | 'updatedAt'>> = []
  const add = (owner: SettlementDeduction['costOwner'], amount: number, location: SettlementDeduction['applyLocation'], suffix: string) => {
    if (!amount) return
    deductions.push({ campaignId, type:'sample', title:`${order.productName} 샘플비·배송비 (${suffix})`, amount, costOwner:owner, applyLocation:location, linkedData:`${sampleOrderLink(order.id)}:${suffix}`, evidenceStatus:'pending',reflected:true,memo:`요청 조건 ${p.capturedAt} · ${p.method} · ${p.paymentMethod} · 최종 매출 ${finalSales ?? '미확인'}원 · 총비용 ${result.total}원` })
  }
  add('seller',result.shares.seller,'seller_payment','셀러')
  add('manager',result.shares.manager,'manager_payment','매니저')
  if (p.paymentMethod === '매니저 선입금') add('company',result.shares.company,'manager_reimbursement','회사 부담·매니저 선지급')
  else add('company',result.shares.company,'net_company_commission','회사')
  return { deductions, reason: deductions.length ? undefined : '정산 차감 불필요' }
}
function provisionCandidate(order: SampleOrder, campaignId: string, finalSales?: number) {
  const result = sampleSettlementCandidates(order,campaignId,finalSales)
  return { reason: result.reason, deduction:result.deductions[0] }
}
