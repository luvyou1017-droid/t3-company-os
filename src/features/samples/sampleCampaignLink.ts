import type { Campaign } from '../../shared/types/campaign'
import type { SampleOrder } from './sampleOrderModel'
import { itemLoanOrder, sampleItems } from './sampleProvision'

export function sameSampleSeller(order: SampleOrder, campaign: Pick<Campaign, 'sellerId' | 'sellerName'>) {
  // IDs take precedence: equal names must never join different Master records.
  if (order.sellerId && campaign.sellerId) return order.sellerId === campaign.sellerId
  return !!order.sellerName.trim() && order.sellerName.trim() === campaign.sellerName.trim()
}

export function sampleProductMatches(order: SampleOrder, campaign: Campaign) {
  const products = [{ productId: campaign.productId, productName: campaign.productName }, ...(campaign.campaignProducts ?? [])]
  return sampleItems(order).some(item => products.some(product => item.productId && product.productId
    ? item.productId === product.productId
    : !!item.productName.trim() && item.productName.trim() === product.productName.trim()))
}

export function sampleLinkBlockReason(order: SampleOrder) {
  if (order.status === '취소') return '취소된 샘플입니다.'
  if (order.campaignId) return '이미 공구에 연결된 샘플입니다.'
  if (order.settlementClaim) return '정산 반영 기록을 먼저 확인해주세요.'
  if (sampleItems(order).some(item => {
    const view = itemLoanOrder(order, item.itemId)
    return view.provision?.method === '테스트 후 진행' && view.operations?.testStatus !== '진행 확정'
  })) return '샘플관리에서 진행 확정 후 연결해주세요.'
  return ''
}

export function unlinkedSampleCandidates(orders: SampleOrder[], campaign: Campaign) {
  return orders.filter(order => !order.campaignId && order.status !== '취소' && sameSampleSeller(order, campaign))
    .map(order => ({ order, productMatch: sampleProductMatches(order, campaign), blockReason: sampleLinkBlockReason(order) }))
    .sort((a, b) => Number(b.productMatch) - Number(a.productMatch))
}
