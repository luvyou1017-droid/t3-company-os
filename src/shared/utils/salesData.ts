import type { Campaign } from '../types/campaign'
import type { SalesDataImport, SalesDataRow, SalesDataTotals, SalesValidationResult, SalesValidationStatus } from '../types/salesData'

export function formatCurrency(value: number) {
  return `${Math.round(value).toLocaleString('ko-KR')}원`
}

export function formatFileSize(size: number) {
  if (!size) return '-'
  if (size < 1024 * 1024) return `${Math.round(size / 1024).toLocaleString('ko-KR')}KB`
  return `${(size / 1024 / 1024).toFixed(1)}MB`
}

export function calculateSalesRow(row: Omit<SalesDataRow, 'grossSales' | 'netQuantity' | 'netSales' | 'validationStatus' | 'validationMessage'>): SalesDataRow {
  const grossSales = row.quantity * row.unitPrice
  const netQuantity = row.quantity - row.canceledQuantity - row.refundedQuantity
  const netSales = netQuantity * row.unitPrice

  return {
    ...row,
    grossSales,
    netQuantity,
    netSales,
    validationStatus: 'valid',
    validationMessage: '검증 전',
  }
}

export function calculateSalesTotals(rows: SalesDataRow[], source?: Pick<SalesDataImport, 'commissionRate' | 'sampleDeductionAmount' | 'eventDeductionAmount'>): SalesDataTotals {
  const totalQuantity = rows.reduce((sum, row) => sum + row.quantity, 0)
  const totalSalesAmount = rows.reduce((sum, row) => sum + row.grossSales, 0)
  const canceledQuantity = rows.reduce((sum, row) => sum + row.canceledQuantity, 0)
  const refundedQuantity = rows.reduce((sum, row) => sum + row.refundedQuantity, 0)
  const netQuantity = rows.reduce((sum, row) => sum + row.netQuantity, 0)
  const netSales = rows.reduce((sum, row) => sum + row.netSales, 0)
  const expectedCommission = netSales * ((source?.commissionRate ?? 17) / 100)
  const companyRemainingCommission = expectedCommission - (source?.sampleDeductionAmount ?? 0) - (source?.eventDeductionAmount ?? 0)

  return {
    totalQuantity,
    totalSalesAmount,
    canceledQuantity,
    refundedQuantity,
    netQuantity,
    netSales,
    expectedCommission,
    companyRemainingCommission,
  }
}

function worstStatus(results: SalesValidationResult[]): SalesValidationStatus {
  if (results.some((result) => result.status === 'error')) return 'error'
  if (results.some((result) => result.status === 'warning')) return 'warning'
  return 'valid'
}

export function validateSalesRows(salesImport: SalesDataImport, rows: SalesDataRow[], campaign?: Campaign) {
  const results: SalesValidationResult[] = []

  const nextRows = rows.map((row) => {
    const rowResults: SalesValidationResult[] = []
    if (!row.optionName.trim()) rowResults.push({ status: 'error', message: '옵션명이 비어 있습니다.', rowId: row.id })
    if (row.quantity < 0) rowResults.push({ status: 'error', message: '판매수량은 음수일 수 없습니다.', rowId: row.id })
    if (row.unitPrice <= 0) rowResults.push({ status: 'error', message: '판매가는 0보다 커야 합니다.', rowId: row.id })
    if (row.canceledQuantity > row.quantity) rowResults.push({ status: 'error', message: '취소수량이 판매수량보다 큽니다.', rowId: row.id })
    if (row.refundedQuantity > row.quantity) rowResults.push({ status: 'error', message: '환불수량이 판매수량보다 큽니다.', rowId: row.id })
    if (row.netQuantity < 0) rowResults.push({ status: 'error', message: '순판매수량이 음수입니다.', rowId: row.id })

    const status = rowResults.length ? worstStatus(rowResults) : 'valid'
    results.push(...rowResults)

    return {
      ...row,
      validationStatus: status,
      validationMessage: rowResults.map((result) => result.message).join(' / ') || '이상 없음',
    }
  })

  const totals = calculateSalesTotals(nextRows, salesImport)
  if (totals.totalQuantity !== salesImport.totalQuantity || totals.totalSalesAmount !== salesImport.totalSalesAmount) {
    results.push({ status: 'error', message: '판매행 합계와 헤더 총합이 다릅니다.' })
  }

  if (campaign && salesImport.uploadedProductName && salesImport.uploadedProductName !== campaign.productName) {
    results.push({ status: 'warning', message: 'Campaign 상품 정보와 업로드 상품명이 다릅니다.' })
  }

  if (campaign && salesImport.salesStartDate && salesImport.salesEndDate && (salesImport.salesStartDate !== campaign.startDate || salesImport.salesEndDate !== campaign.endDate)) {
    results.push({ status: 'warning', message: '판매기간이 Campaign 기간과 다릅니다.' })
  }

  if (!results.length) results.push({ status: 'valid', message: '판매 데이터 검증을 통과했습니다.' })

  return {
    rows: nextRows,
    results,
    status: worstStatus(results),
    totals,
  }
}

export function buildSalesAnalysis(salesImport: SalesDataImport, rows: SalesDataRow[], campaign?: Campaign) {
  const validation = validateSalesRows(salesImport, rows, campaign)
  const totals = calculateSalesTotals(rows, salesImport)
  const messages = [
    validation.status === 'error' ? '오류 확인 필요' : '판매수량 이상 없음',
    totals.totalSalesAmount === salesImport.totalSalesAmount ? '옵션별 합계 일치' : '옵션별 합계 불일치',
    totals.canceledQuantity > 0 ? '취소수량 확인 필요' : '취소수량 이상 없음',
    salesImport.sampleDeductionAmount ? '샘플비 반영됨' : '샘플비 미반영',
    salesImport.eventDeductionAmount ? '이벤트비 반영됨' : '이벤트비 확인 필요',
    `회사 잔여 수수료 예상 ${formatCurrency(totals.companyRemainingCommission)}`,
    `셀러 지급 예상 ${formatCurrency(Math.max(totals.netSales - totals.expectedCommission, 0))}`,
  ]

  return { messages, validation, totals }
}
