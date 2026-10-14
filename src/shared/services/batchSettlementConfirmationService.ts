import { STORAGE_KEYS, captureStorageWrites, storageService } from './storageService'
import { settlementService } from './settlementService'
import { salesDataService } from './salesDataService'
import { campaignEventOperationService } from './campaignEventOperationService'
import { cloudSyncService } from './cloudSyncService'
import { validateSettlement } from '../utils/settlement'
import type { Settlement } from '../types/settlement'

export type ConfirmationCandidate = { id: string; reason: string; fingerprint: string }

function confirmationReason(settlement: Settlement) {
  if (['completed', 'canceled'].includes(settlement.status)) return '완료·취소된 정산'
  if (settlementService.isSettlementConfirmed(settlement)) return '이미 확정된 정산'
  if (settlementService.getPendingRevisionRequest(settlement.id) || settlement.hasSourceChanged) return '원본 변경·수정 요청 확인 필요'
  const source = salesDataService.getSalesDataImportById(settlement.salesDataImportId)
  if (!source) return '판매 데이터 확인 필요'
  const exempt = source.commissionSyncIssues?.filter(issue => source.otherSalesAggregate?.sourceRowIds.includes(issue.rowId)).length ?? 0
  if (Math.max((source.commissionSyncUnmatchedRows ?? 0) - exempt, 0) > 0) return 'SKU·수수료 미연결 판매행 확인 필요'
  const rows = salesDataService.getSettlementRowsByImportId(source.id)
  if (!rows.length || rows.some(row => {
    const total = row.totalCommissionRate ?? settlement.currentCalculation.totalCommissionRate
    const seller = row.sellerCommissionRate ?? settlement.currentCalculation.sellerCommissionRate
    return source.commissionSyncIssues?.some(issue => issue.rowId === row.id) || !Number.isFinite(total) || !Number.isFinite(seller) || total < seller || seller < 0 || total > 100
  })) return 'SKU별 수수료율 확인 필요'
  const events = campaignEventOperationService.validateForSettlementConfirmation(settlement.campaignId)
  if (events.length) return events.join(' · ')
  const validation = validateSettlement(settlement)
  if (!validation.valid) return validation.errors.join(' · ')
  return ''
}

export function previewBatchSettlementConfirmations(ids: string[], confirmedBy: string): ConfirmationCandidate[] {
  const seed = new Map<string, unknown>(Object.values(STORAGE_KEYS).map(key => [key, storageService.getItem(key, [])]))
  const stored = storageService.getItem<Settlement[]>(STORAGE_KEYS.settlements, [])
  return [...new Set(ids)].map(id => {
    const settlement = settlementService.getSettlementById(id)
    if (!settlement) return { id, reason: '정산서를 찾을 수 없습니다.', fingerprint: '' }
    const fingerprint = JSON.stringify(stored.find(item => item.id === id))
    let reason = confirmationReason(settlement)
    if (!reason) {
      try { captureStorageWrites(seed, () => settlementService.confirmSettlement(id, confirmedBy)) }
      catch (error) { reason = error instanceof Error ? error.message : '확정 조건 확인 필요' }
    }
    return { id, reason, fingerprint }
  })
}

export async function submitBatchSettlementConfirmations(candidates: ConfirmationCandidate[], confirmedBy: string, sync: (keys: string[]) => Promise<unknown> = keys => cloudSyncService.syncKeys(keys)) {
  let saved = 0
  for (const candidate of candidates.filter(item => !item.reason)) {
    const current = settlementService.getSettlementById(candidate.id)
    const stored = storageService.getItem<Settlement[]>(STORAGE_KEYS.settlements, []).find(item => item.id === candidate.id)
    if (!current || JSON.stringify(stored) !== candidate.fingerprint || confirmationReason(current)) {
      throw new Error(`${saved}건 확정 후 데이터가 달라졌습니다. 목록을 새로 확인해주세요.`)
    }
    settlementService.confirmSettlement(candidate.id, confirmedBy)
    try {
      await sync([STORAGE_KEYS.settlements, STORAGE_KEYS.salesDataImports, STORAGE_KEYS.settlementVersions, STORAGE_KEYS.settlementActivityLogs])
    } catch (error) {
      throw new Error(`${saved}건 저장 후 서버 동기화가 중단됐습니다. 현재 건의 저장 여부를 새로고침하여 확인해주세요. ${error instanceof Error ? error.message : ''}`)
    }
    saved++
  }
  return saved
}
