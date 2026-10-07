import type { SalesDataImport, SalesDataRow } from '../types/salesData.ts'

/** The imported rows are immutable evidence. Only this derived view enters settlement. */
export function effectiveSalesRows(rows: SalesDataRow[], source: SalesDataImport): SalesDataRow[] {
  const aggregate = source.otherSalesAggregate
  if (!aggregate) return rows
  const selected = new Set(aggregate.sourceRowIds)
  if (!selected.size || selected.size !== aggregate.sourceRowIds.length || rows.some((row) => row.aggregateKind)
    || rows.filter((row) => selected.has(row.id)).length !== selected.size)
    throw new Error('기타 묶음의 원본 판매행이 변경되었습니다. 정산 전에 다시 확인해주세요.')
  const { totalSales, totalCommissionRate, sellerCommissionRate } = aggregate
  if (!Number.isSafeInteger(totalSales) || totalSales <= 0 || !Number.isFinite(totalCommissionRate)
    || totalCommissionRate <= 0 || totalCommissionRate > 100 || !Number.isFinite(sellerCommissionRate)
    || sellerCommissionRate < 0 || sellerCommissionRate > totalCommissionRate)
    throw new Error('기타 총매출과 수수료율을 확인해주세요.')
  return [...rows.filter((row) => !selected.has(row.id)), {
    id: `${source.id}:other-aggregate`, salesDataImportId: source.id, campaignId: source.campaignId,
    aggregateKind: 'other', optionName: '기타', quantity: 1, unitPrice: totalSales,
    grossSales: totalSales, canceledQuantity: 0, refundedQuantity: 0,
    netQuantity: 1, netSales: totalSales, totalCommissionRate, sellerCommissionRate,
    validationStatus: 'valid', validationMessage: '선택한 원본 판매행을 합산하여 수기 입력',
  }]
}
