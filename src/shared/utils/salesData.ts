import type { Campaign } from '../types/campaign'
import type { SalesDataImport, SalesDataRow, SalesDataTotals, SalesValidationResult, SalesValidationStatus } from '../types/salesData'
import { getCompanySalesEventCostTotal } from './salesEventCosts.ts'
import { calculateSrookPayFee, DEFAULT_SROOKPAY_FEE_RATE } from './srookPay.ts'
import { manualCommissionComparison } from './manualSettlement.ts'

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

export function calculateSalesTotals(rows: SalesDataRow[], source?: Pick<SalesDataImport, 'commissionRate' | 'commissionCalculationType' | 'totalCommissionRate' | 'sellerCommissionRate' | 'sampleDeductionAmount' | 'eventDeductionAmount' | 'eventName' | 'eventCostOwner' | 'eventCosts' | 'shippingRevenue' | 'srookPayFeeRate' | 'srookPayEstimatedFeeAmount' | 'srookPayActualFeeAmount'>): SalesDataTotals {
  const totalQuantity = rows.reduce((sum, row) => sum + row.quantity, 0)
  const totalSalesAmount = rows.reduce((sum, row) => sum + row.grossSales, 0)
  const canceledQuantity = rows.reduce((sum, row) => sum + row.canceledQuantity, 0)
  const refundedQuantity = rows.reduce((sum, row) => sum + row.refundedQuantity, 0)
  const netQuantity = rows.reduce((sum, row) => sum + row.netQuantity, 0)
  const netSales = rows.reduce((sum, row) => sum + row.netSales, 0)
  const fallbackTotalRate = source?.totalCommissionRate ?? 25
  const fallbackSellerRate = source?.sellerCommissionRate ?? source?.commissionRate ?? 17
  const campaignTotalCommission = source?.commissionCalculationType === 'campaign_total'
  const expectedCommission = campaignTotalCommission
    ? netSales * (fallbackSellerRate / 100)
    : rows.reduce((sum, row) => sum + row.netSales * ((row.sellerCommissionRate ?? fallbackSellerRate) / 100), 0)
  const companyCommission = campaignTotalCommission
    ? netSales * (Math.max(fallbackTotalRate - fallbackSellerRate, 0) / 100)
    : rows.reduce((sum, row) => {
    const totalRate = row.totalCommissionRate ?? fallbackTotalRate
    const sellerRate = row.sellerCommissionRate ?? fallbackSellerRate
    return sum + row.netSales * (Math.max(totalRate - sellerRate, 0) / 100)
    }, 0)
  const companyEventCost = source ? getCompanySalesEventCostTotal(source as SalesDataImport) : 0
  const srookPayFee = source?.shippingRevenue === undefined ? 0 : source.srookPayActualFeeAmount
    ?? calculateSrookPayFee(netSales, source.shippingRevenue, source.srookPayFeeRate ?? DEFAULT_SROOKPAY_FEE_RATE)
  const companyRemainingCommission = companyCommission - (source?.sampleDeductionAmount ?? 0) - companyEventCost - srookPayFee

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
  if (salesImport.documentKind && !salesImport.documentAuthor) results.push({ status: 'error', message: '정산 자료 작성 주체를 확인해주세요.' })

  const nextRows = rows.map((row) => {
    const rowResults: SalesValidationResult[] = []
    const item = row.optionName.trim() || `판매행 ${row.id}`
    if (!row.optionName.trim()) rowResults.push({ status: 'error', message: `${item}: 옵션명이 비어 있습니다.`, rowId: row.id })
    if (row.quantity < 0) rowResults.push({ status: 'error', message: `${item}: 판매수량은 음수일 수 없습니다.`, rowId: row.id })
    if (row.unitPrice <= 0) rowResults.push({ status: 'error', message: `${item}: 판매가는 0보다 커야 합니다.`, rowId: row.id })
    if (row.canceledQuantity > row.quantity) rowResults.push({ status: 'error', message: `${item}: 취소수량이 판매수량보다 큽니다.`, rowId: row.id })
    if (row.refundedQuantity > row.quantity) rowResults.push({ status: 'error', message: `${item}: 환불수량이 판매수량보다 큽니다.`, rowId: row.id })
    if (row.netQuantity < 0) rowResults.push({ status: 'error', message: `${item}: 순판매수량이 음수입니다.`, rowId: row.id })
    const totalRate = row.totalCommissionRate ?? salesImport.totalCommissionRate ?? 25
    const sellerRate = row.sellerCommissionRate ?? salesImport.sellerCommissionRate ?? salesImport.commissionRate ?? Number.NaN
    const commissionIssue = salesImport.commissionSyncIssues?.find((issue) => issue.rowId === row.id)
    if (commissionIssue) rowResults.push({ status: 'error', message: commissionIssue.message ?? '상품 SKU와 수수료 연결을 확인해주세요.', rowId: row.id })
    if (!Number.isFinite(totalRate) || totalRate < 0 || totalRate > 100) rowResults.push({ status: 'error', message: `${row.optionName || '해당 SKU'} 총수수료율은 0~100 사이여야 합니다.`, rowId: row.id })
    if (!Number.isFinite(sellerRate) || sellerRate < 0 || sellerRate > 100) rowResults.push({ status: 'error', message: `${row.optionName || '해당 SKU'} 셀러 수수료율은 0~100 사이여야 합니다.`, rowId: row.id })
    if (Number.isFinite(totalRate) && Number.isFinite(sellerRate) && totalRate < sellerRate) rowResults.push({ status: 'error', message: `${row.optionName || '해당 SKU'}: 총수수료율 ${totalRate}%가 셀러 수수료율 ${sellerRate}%보다 낮습니다.`, rowId: row.id })

    const status = rowResults.length ? worstStatus(rowResults) : 'valid'
    results.push(...rowResults)

    return {
      ...row,
      validationStatus: status,
      validationMessage: rowResults.map((result) => result.message).join(' / ') || '이상 없음',
    }
  })

  const totals = calculateSalesTotals(nextRows, salesImport)
  if (salesImport.manualSettlement) {
    const comparison = manualCommissionComparison(salesImport, nextRows)
    const reported = salesImport.manualSettlement.reportedCommissionAmount
    if (!comparison) results.push({ status: 'error', message: '수기 정산의 옵션·수량·판매가·수수료 조건을 모두 확인해주세요.' })
    if (reported === undefined || !Number.isFinite(reported) || reported < 0) results.push({ status: 'error', message: '업체 전달 합산 수수료를 입력해주세요.' })
    else if (comparison && comparison.difference !== 0) results.push({ status: 'error', message: `업체 전달 합산 수수료와 계산 금액이 ${formatCurrency(Math.abs(comparison.difference!))} 차이납니다. 수량·단가·수수료 조건을 확인해주세요.` })
  }
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
    salesImport.eventDeductionAmount ? '차감·조정내역 반영됨' : '차감·조정내역 확인 필요',
    `회사 잔여 수수료 예상 ${formatCurrency(totals.companyRemainingCommission)}`,
    `셀러 지급 예상 ${formatCurrency(Math.max(totals.netSales - totals.expectedCommission, 0))}`,
  ]

  return { messages, validation, totals }
}
