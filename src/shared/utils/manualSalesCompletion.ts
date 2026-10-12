import type { SalesDataImport } from '../types/salesData'

export function buildManualSalesCompletion(item: SalesDataImport, grossSales: number, actor: { id: string; name: string }, completedAt: string) {
  if (!Number.isSafeInteger(grossSales) || grossSales < 0) throw new Error('매출을 0원 이상의 정수로 입력해주세요.')
  if (!actor.id || !actor.name.trim()) throw new Error('완료 처리자를 확인해주세요.')
  if (item.manualCompletion) return item
  return { ...item, settlementStatus: '정산 완료' as const, manualCompletion: { grossSales, completedAt, completedBy: actor.id, completedByName: actor.name, reason: '외부 정산 완료 · 사이트 정산 계산 생략', previousSettlementStatus: item.settlementStatus } }
}
