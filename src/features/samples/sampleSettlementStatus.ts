import { effectiveBurden } from './sampleProvision.ts'
import { sampleTotals, type SampleOrder } from './sampleOrderModel.ts'
import type { SettlementDeduction } from '../../shared/types/settlement'
import { STORAGE_KEYS, storageService } from '../../shared/services/storageService.ts'

export type SampleSettlementStatus = '미반영' | '반영 대기' | '반영 완료' | '정산 대상 제외'

export function readSampleSettlementState() {
  const settlements = storageService.getItem<Array<{ id: string; status: string }>>(STORAGE_KEYS.settlements, [])
  return {
    deductions: storageService.getItem<SettlementDeduction[]>(STORAGE_KEYS.settlementDeductions, []),
    activeSettlementIds: new Set(settlements.filter((item) => item.status !== 'canceled').map((item) => item.id)),
  }
}

export function sampleSettlementStatus(
  order: SampleOrder,
  deductions: SettlementDeduction[],
  activeSettlementIds: ReadonlySet<string>,
): SampleSettlementStatus {
  const prefix = `sample:${order.id}`
  const linked = deductions.filter((item) => item.type === 'sample' && item.campaignId === order.campaignId
    && activeSettlementIds.has(item.settlementId)
    && (item.linkedData === prefix || item.linkedData.startsWith(`${prefix}:`) || item.linkedData === `sample_request_id:${order.id}`))
  if (linked.some((item) => item.reflected)) return order.settlementClaim && !order.settlementClaim.committedAt ? '반영 대기' : '반영 완료'
  if (order.provision && !effectiveBurden(order).shares && order.provision.method !== '조건부 제공') return '정산 대상 제외'
  if (order.operations?.offsetCompleted) return '정산 대상 제외'
  if (order.status === '취소') return '정산 대상 제외'
  if (linked.length) return '반영 대기'
  if (!['발주완료', '배송중', '수령완료'].includes(order.status)) return '미반영'
  if (order.provision) return effectiveBurden(order).shares ? '반영 대기' : '미반영'
  const totals = sampleTotals(order)
  if (totals.companyCost === null || (order.payer === 'seller' && totals.sellerDeduction === null)) return '미반영'
  return '반영 대기'
}
