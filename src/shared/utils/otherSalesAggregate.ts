import type { SalesDataImport, SalesDataRow } from '../types/salesData.ts'

/** The imported rows are immutable evidence. Only this derived view enters settlement. */
export function effectiveSalesRows(rows: SalesDataRow[], source: SalesDataImport): SalesDataRow[] {
  const aggregate = source.otherSalesAggregate
  if (!aggregate) return rows
  if (source.commissionCalculationType === 'campaign_total') throw new Error('기타 품목은 품목별 수수료 계산으로 저장해주세요.')
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

/** Editing other items must not delete or rewrite the original rows in the aggregate. */
export function assertOtherSourceRowsPreserved(previous: SalesDataRow[], next: SalesDataRow[], source: SalesDataImport) {
  for (const id of source.otherSalesAggregate?.sourceRowIds ?? []) {
    const before = previous.find((row) => row.id === id)
    const after = next.find((row) => row.id === id)
    const keys = ['salesDataImportId', 'campaignId', 'optionName', 'quantity', 'unitPrice', 'grossSales', 'canceledQuantity', 'refundedQuantity', 'netQuantity', 'netSales'] as const
    if (!before || !after || keys.some((key) => before[key] !== after[key])) throw new Error('기타로 묶은 원본 판매행은 수정·삭제할 수 없습니다. 먼저 기타 묶음을 해제해주세요.')
  }
}

/** Save an unconfirmed settlement revision while keeping its aggregate's source rows. */
export function prepareOtherSalesRevision(source: SalesDataImport, original: SalesDataRow[], revised: SalesDataRow[]) {
  if (!source.otherSalesAggregate) return { source, rows: revised }
  const current = effectiveSalesRows(original, source)
  const aggregate = revised.find((row) => row.aggregateKind === 'other')
  if (!aggregate || aggregate.id !== `${source.id}:other-aggregate` || aggregate.quantity !== 1
    || aggregate.canceledQuantity !== 0 || aggregate.refundedQuantity !== 0 || aggregate.skuId
    || aggregate.salesDataImportId !== source.id || aggregate.campaignId !== source.campaignId
    || revised.filter((row) => row.aggregateKind === 'other').length !== 1
    || new Set(revised.map((row) => row.id)).size !== revised.length
    || current.length !== revised.length || current.some((row) => !revised.some((item) => item.id === row.id)))
    throw new Error('기타 정산 수정은 기존 품목과 원본 연결을 유지해주세요.')
  const nextSource = { ...source, otherSalesAggregate: { ...source.otherSalesAggregate,
    totalSales: aggregate.unitPrice, totalCommissionRate: aggregate.totalCommissionRate!, sellerCommissionRate: aggregate.sellerCommissionRate!, savedAt: new Date().toISOString() } }
  const selected = new Set(source.otherSalesAggregate.sourceRowIds)
  const rows = [...original.filter((row) => selected.has(row.id)), ...revised.filter((row) => !row.aggregateKind)]
  effectiveSalesRows(rows, nextSource)
  return { source: nextSource, rows }
}
