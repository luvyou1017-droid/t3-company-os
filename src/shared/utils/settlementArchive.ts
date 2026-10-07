import type { Settlement } from '../types/settlement'

// Visibility only. Partial payment and review confirmation still require work.
export function isArchivedSettlement(settlement: Pick<Settlement, 'status'>) {
  return settlement.status === 'completed'
}

export function isCompletedSalesImport(salesImport: { id: string; settlementStatus: string }, settlements: Array<Pick<Settlement, 'salesDataImportId' | 'status'>>) {
  const linked = settlements.filter(item => item.salesDataImportId === salesImport.id && item.status !== 'canceled')
  // A reopened settlement takes precedence over a stale sales-data label.
  return linked.length ? linked.every(isArchivedSettlement) : salesImport.settlementStatus === '정산 완료'
}
