import type { Settlement } from '../types/settlement'
import { canEditSettlement, type AppUser } from '../data/users'
import { supabase } from '../lib/supabase'
import { STORAGE_KEYS, storageService } from './storageService'
import { cloudSyncService } from './cloudSyncService'
import { campaignService } from './campaignService'
import { createCalculationSteps } from '../utils/settlement'
import { calculateFinalSellerPayment } from '../utils/sellerSettlement'
import { sellerAdditionalPayments } from '../utils/settlementAdjustments'
import { changeReceivableStatus, eligibleForOffset, financialLocked, offsetDeductions, receivableBalance, type ReceivableStatus } from '../utils/sellerReceivable'

export function applyReceivableOffsets(items: Settlement[], sourceId: string, targetIds: string[], requested: number, actor: string, sellerFor: (s: Settlement) => string | undefined, recalculate: (s: Settlement) => Settlement): Settlement[] {
  const source = items.find(s => s.id === sourceId)
  const r = source?.sellerReceivable
  if (!r || !eligibleForOffset(r)) throw new Error('현재 상계 가능한 미수금이 아닙니다.')
  if (!Number.isSafeInteger(requested) || requested <= 0 || requested > receivableBalance(items, r)) throw new Error('미수금 잔액 이내의 원 단위 금액을 입력해주세요.')
  const ids = [...new Set(targetIds)]
  if (!ids.length || ids.includes(sourceId)) throw new Error('다른 공구의 정산을 선택해주세요.')
  let remaining = requested
  const next = [...items]
  for (const id of ids) {
    const index = next.findIndex(s => s.id === id)
    const target = next[index]
    if (!target || financialLocked(target) || sellerFor(target) !== r.sellerId) throw new Error('동일 셀러의 미확정·미지급 정산만 상계할 수 있습니다.')
    const fresh = recalculate(target)
    const amount = Math.min(remaining, Math.floor(fresh.currentCalculation.finalSellerPaymentAmount))
    if (amount <= 0) continue
    const allocation = { id: `offset-${crypto.randomUUID()}`, sourceSettlementId: sourceId, receivableId: r.id, amount, at: new Date().toISOString(), actor }
    next[index] = recalculate({ ...fresh, sellerReceivableOffsets: [...(target.sellerReceivableOffsets ?? []), allocation] })
    remaining -= amount
  }
  if (remaining > 0) throw new Error('선택한 정산의 지급 가능액이 부족합니다. 상계 금액 또는 정산 선택을 조정해주세요.')
  const status: ReceivableStatus = receivableBalance(next, r) === 0 ? '상계 완료' : '다음 정산 상계 예정'
  return next.map(s => s.id !== sourceId ? s : { ...s, sellerReceivable: { ...r, status, history: [...r.history, { at: new Date().toISOString(), actor, action: '사용자 확인 상계', amount: requested, memo: `대상 정산: ${ids.join(', ')}` }] } })
}

export function cancelReceivableOffset(items: Settlement[], targetId: string, offsetId: string, actor: string, recalculate: (s: Settlement) => Settlement) {
  const target = items.find(s => s.id === targetId)
  const offset = target?.sellerReceivableOffsets?.find(o => o.id === offsetId)
  const source = items.find(s => s.id === offset?.sourceSettlementId)
  if (!target || !offset || !source?.sellerReceivable || financialLocked(target)) throw new Error('미확정 정산의 상계만 취소할 수 있습니다.')
  const r = source.sellerReceivable
  if (r.invoiceDate || r.receivedDate || !['상계 완료','다음 정산 상계 예정','미처리'].includes(r.status)) throw new Error('계산서 또는 수동 처리 이력을 먼저 확인해주세요.')
  return items.map(s => s.id === targetId ? recalculate({ ...s, sellerReceivableOffsets: s.sellerReceivableOffsets?.filter(o => o.id !== offsetId) }) : s.id === source.id ? { ...s, sellerReceivable: { ...r, status: '다음 정산 상계 예정' as const, history: [...r.history, { at: new Date().toISOString(), actor, action: '상계 취소', amount: offset.amount, memo: `대상 정산: ${targetId}` }] } } : s)
}

function recalculate(s: Settlement): Settlement {
  const current = s.currentCalculation
  const offset = (s.sellerReceivableOffsets ?? []).reduce((sum, o) => sum + o.amount, 0)
  const previousOffset = current.sellerReceivableOffset ?? 0
  const sellerDeduction = current.sellerDeductionTotal - previousOffset + offset
  const deductions = [...current.deductions.filter(d => !d.linkedData?.startsWith('receivable:')), ...offsetDeductions(s)]
  const payout = calculateFinalSellerPayment(current.sellerCommissionAmount, s.taxType === 'withholding_3_3' ? 'freelancer' : s.taxType === 'cash_receipt' ? 'simplified_business' : 'general_business', sellerDeduction, 2, sellerAdditionalPayments(deductions, current.adjustmentCalculationVersion), offset)
  if ((payout.unappliedReceivableOffset ?? 0) > 0) throw new Error('상계액이 지급 가능액보다 큽니다. 금액을 다시 확인해주세요.')
  const calculation = { ...current, deductions, sellerReceivableOffset: offset, sellerDeduction, sellerDeductionTotal: sellerDeduction, deductionTotal: current.deductionTotal - previousOffset + offset, finalSellerPaymentAmount: payout.finalSellerPaymentAmount, sellerPaymentAmount: payout.finalSellerPaymentAmount, taxAmount: payout.withholdingTaxAmount, calculatedAt: new Date().toISOString() }
  return { ...s, currentCalculation: calculation, calculationSteps: createCalculationSteps(calculation), updatedAt: new Date().toISOString() }
}

// Source debt and every destination allocation are one compare-and-set write.
// A conflict fails closed; it never retries with the user's stale selection.
export async function persistReceivableChange(transform: (items: Settlement[]) => Settlement[], user: AppUser, client = supabase) {
  if (!canEditSettlement(user.role)) throw new Error('정산 관리 권한이 필요합니다.')
  if (!client) {
    const next = transform(storageService.getItem<Settlement[]>(STORAGE_KEYS.settlements, []))
    storageService.setItem(STORAGE_KEYS.settlements, next)
    return next
  }
  await cloudSyncService.syncKeys([STORAGE_KEYS.settlements])
  const { data: current, error } = await client.from('workspace_state').select('payload,updated_at,deleted').eq('workspace_id', 'wisevendor').eq('storage_key', STORAGE_KEYS.settlements).single()
  if (error) throw error
  if (!current || current.deleted || !Array.isArray(current.payload)) throw new Error('공용 정산 데이터를 확인해주세요.')
  const next = transform(current.payload as Settlement[])
  const { data: saved, error: saveError } = await client.from('workspace_state').update({ payload: next, source_device_id: localStorage.getItem('t3_company_os_cloud_device_id') }).eq('workspace_id', 'wisevendor').eq('storage_key', STORAGE_KEYS.settlements).eq('updated_at', current.updated_at).select('updated_at').maybeSingle()
  if (saveError) throw saveError
  if (!saved) throw new Error('다른 사용자가 정산을 변경했습니다. 새로고침 후 잔액을 확인해주세요. 상계는 저장하지 않았습니다.')
  cloudSyncService.acceptSettlementCommit(next, saved.updated_at)
  return next
}
export const sellerReceivableService = {
  getItems: () => storageService.getItem<Settlement[]>(STORAGE_KEYS.settlements, []),
  apply: (sourceId: string, targets: string[], amount: number, user: AppUser) => persistReceivableChange(items => applyReceivableOffsets(items, sourceId, targets, amount, user.name, s => campaignService.getCampaignById(s.campaignId)?.sellerId, recalculate), user),
  cancel: (targetId: string, offsetId: string, user: AppUser) => persistReceivableChange(items => cancelReceivableOffset(items, targetId, offsetId, user.name, recalculate), user),
  setStatus: (sourceId: string, status: ReceivableStatus, memo: string, invoiceDate: string, receivedDate: string, user: AppUser) => persistReceivableChange(items => changeReceivableStatus(items, sourceId, status, user.name, memo, invoiceDate, receivedDate), user),
}
