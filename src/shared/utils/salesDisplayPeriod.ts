import type { SalesDataImport } from '../types/salesData'
import type { Campaign } from '../types/campaign'

// Empty upload queues have no independent source period. Derive their dates
// without rewriting the import, sales rows, or any settlement Snapshot.
export function getSalesDisplayPeriod(item: SalesDataImport, campaign?: Campaign) {
  const waiting = item.reviewStatus === '업로드 대기' && item.settlementStatus === '정산 전'
    && item.totalQuantity === 0 && item.totalSalesAmount === 0
    && !item.fileName && !item.fileSize && !item.uploadedAt
    && !item.originalSalesFileStoragePath && !item.fileAnalysis
    && !item.manualSettlement && !item.manualCompletion
  return waiting && campaign
    ? { startDate: campaign.startDate, endDate: campaign.endDate }
    : { startDate: item.salesStartDate, endDate: item.salesEndDate }
}
