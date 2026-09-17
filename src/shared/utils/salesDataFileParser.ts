import * as XLSX from 'xlsx'
import type { SalesDataImport, SalesDataRow, SalesFileAnalysis } from '../types/salesData.ts'
import { calculateSalesRow } from './salesData.ts'
import { readDispatchWorkbook } from './dispatchWorkbook.ts'
import { sheetToRows } from './spreadsheetRows.ts'

type Cell = string | number | boolean | Date | null | undefined
type ParsedColumn = 'orderId' | 'product' | 'option' | 'quantity' | 'unitPrice' | 'grossSales' | 'collectedAmount' | 'orderStatus' | 'claimStatus' | 'eventType'

export type SalesPriceCandidate = {
  productName: string
  optionName: string
  groupBuyPrice: number
  confirmed?: boolean
  exactMatchOnly?: boolean
  skuId?: string
  productId?: string
  totalCommissionRate?: number
  sellerCommissionRate?: number
}

export class UnmatchedSalesPricesError extends Error {
  options: string[]
  constructor(options: string[]) {
    super(`판매가가 없는 주문자료의 옵션 ${options.length}개를 상품 DB 공구가와 연결하지 못했습니다: ${options.slice(0, 3).join(' / ')}`)
    this.options = options
  }
}

export const shouldAskPendingPaymentPolicy = (analysis: Pick<SalesFileAnalysis, 'pendingPaymentQuantity' | 'pendingPaymentSales'>) =>
  analysis.pendingPaymentQuantity !== 0 || analysis.pendingPaymentSales !== 0

const aliases: Record<ParsedColumn, string[]> = {
  orderId: ['주문번호', '상품주문번호', 'orderid', 'orderno'],
  product: ['상품명', '판매사상품명', '진행상품명', '제품명', '품명', 'productname'],
  option: ['판매사옵션명', '고객선택옵션', '옵션정보', '판매옵션정보', '옵션명', '구성명', '상품옵션', 'option'],
  quantity: ['수량', '판매수량', '주문수량', 'quantity', 'qty'],
  unitPrice: ['옵션판매가', '개당판매가', '공동구매가', '판매단가', '단가', '결제단가', 'unitprice'],
  // 할인 전 금액과 할인 후 금액이 모두 있는 파일은 실제 정산 기준 금액을 우선합니다.
  grossSales: ['상품금액(옵션포함)', '최종매출', '총주문금액', '실결제금액', '총판매가', '총판매금액', '결제금액', '판매금액', '판매가', '총매출', '옵션별총액', 'amount'],
  collectedAmount: ['결제금액(통합)', '실결제금액', '총결제금액', '결제금액', '총주문금액'],
  orderStatus: ['주문상태', '결제상태', '배송상태', 'status'],
  claimStatus: ['클레임상태', '취소상태', '환불상태', '반품상태', 'claimstatus'],
  eventType: ['발생구분'],
}

const normalize = (value: Cell) => String(value ?? '')
  .trim()
  .toLowerCase()
  .replace(/소세지/g, '소시지')
  .replace(/[\s_()\-/.]/g, '')
const numberValue = (value: Cell) => {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  const parsed = Number(String(value ?? '').replace(/[^0-9.-]/g, ''))
  return Number.isFinite(parsed) ? parsed : 0
}

function matchColumns(value: Cell): ParsedColumn[] {
  const normalized = normalize(value)
  return (Object.keys(aliases) as ParsedColumn[]).filter((key) => aliases[key].some((alias) => normalized === normalize(alias)))
}

function findHeader(rows: Cell[][], allowPriceLookup = false) {
  let best: { rowIndex: number; columns: Partial<Record<ParsedColumn, number>>; labels: Partial<Record<ParsedColumn, string>>; score: number } | undefined
  rows.slice(0, 80).forEach((row, rowIndex) => {
    const columns: Partial<Record<ParsedColumn, number>> = {}
    const labels: Partial<Record<ParsedColumn, string>> = {}
    const ranks: Partial<Record<ParsedColumn, number>> = {}
    row.forEach((cell, columnIndex) => {
      matchColumns(cell).forEach((key) => {
        const rank = aliases[key].findIndex((alias) => normalize(cell) === normalize(alias))
        if (columns[key] === undefined || rank < (ranks[key] ?? Number.POSITIVE_INFINITY)) {
          columns[key] = columnIndex
          labels[key] = String(cell ?? '').trim()
          ranks[key] = rank
        }
      })
    })
    const score = Object.keys(columns).length
    const usable = columns.quantity !== undefined
      && (allowPriceLookup || columns.grossSales !== undefined || columns.unitPrice !== undefined)
      && (columns.option !== undefined || columns.product !== undefined)
    if (usable && (!best || score > best.score)) best = { rowIndex, columns, labels, score }
  })
  return best
}

function isPendingStatus(orderStatus: string, claimStatus: string) {
  const text = `${orderStatus} ${claimStatus}`.replace(/\s/g, '')
  return ['결제대기', '입금대기', '미결제'].some((status) => text.includes(status))
}

function isHardExcludedStatus(orderStatus: string, claimStatus: string) {
  const text = `${orderStatus} ${claimStatus}`.replace(/\s/g, '')
  return ['주문취소', '취소완료', '환불완료', '반품완료'].some((status) => text.includes(status))
}

function findLabeledNumber(rows: Cell[][], labels: string[]) {
  for (const row of rows) {
    for (let columnIndex = 0; columnIndex < row.length; columnIndex += 1) {
      const label = normalize(row[columnIndex])
      if (!labels.some((candidate) => label.includes(normalize(candidate)))) continue
      for (let offset = 1; offset <= 4; offset += 1) {
        const value = numberValue(row[columnIndex + offset])
        if (value) return value
      }
    }
  }
  return undefined
}

function extractOrderHubOptionName(productName: string) {
  const embeddedOption = productName.includes('▶') ? productName.split('▶').pop() ?? productName : productName
  return embeddedOption.trim().replace(/\s*\(\d+개\)\s*$/, '').trim()
}

function extractEmbeddedPriceCandidates(rows: Cell[][]) {
  const candidates: SalesPriceCandidate[] = []
  rows.slice(0, 80).forEach((row, rowIndex) => {
    const columns: Partial<Record<ParsedColumn, number>> = {}
    row.forEach((cell, columnIndex) => {
      matchColumns(cell).forEach((key) => {
        if (columns[key] === undefined) columns[key] = columnIndex
      })
    })
    const nameIndex = columns.option ?? columns.product
    if (nameIndex === undefined || columns.quantity === undefined || columns.unitPrice === undefined || columns.grossSales === undefined) return
    for (const dataRow of rows.slice(rowIndex + 1)) {
      const optionName = String(dataRow[nameIndex] ?? '').trim()
      if (!optionName) break
      if (/^(합계|총계|소계)/.test(optionName.replace(/\s/g, ''))) break
      const quantity = numberValue(dataRow[columns.quantity])
      const groupBuyPrice = numberValue(dataRow[columns.unitPrice])
      const grossSales = numberValue(dataRow[columns.grossSales])
      if (quantity <= 0 || groupBuyPrice <= 0 || grossSales <= 0) continue
      if (Math.abs(quantity * groupBuyPrice - grossSales) > 1) continue
      const productName = columns.product === undefined || columns.product === nameIndex ? '' : String(dataRow[columns.product] ?? '').trim()
      candidates.push({ productName, optionName, groupBuyPrice, confirmed: true })
    }
  })
  return candidates
}

export async function parseSalesDataFile(file: File, salesImport: SalesDataImport, priceCandidates: SalesPriceCandidate[] = []): Promise<{ rows: SalesDataRow[]; rowsIncludingPending: SalesDataRow[]; analysis: SalesFileAnalysis }> {
  const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array', cellDates: true })
  // Supplier workbooks can contain an invoice, a final product summary and
  // duplicate order/CS sheets. Read the explicit net summary exactly once.
  for (const name of workbook.SheetNames) {
    const table = sheetToRows<Cell>(workbook.Sheets[name])
    const index = table.slice(0, 80).findIndex((row) => ['공구가', '공구금액', '공급금액', '합산', '주문수량', 'CS'].every((label) => row.some((cell) => normalize(cell) === normalize(label))))
    if (index < 0) continue
    const labels = table[index].map(normalize)
    const at = (row: Cell[], label: string) => row[labels.indexOf(normalize(label))]
    const normalized: Cell[][] = [['상품명', '수량', '개당판매가', '총판매금액']]
    let supply = 0
    let claims = 0
    for (const row of table.slice(index + 1)) {
      const product = String(at(row, '정산명') || at(row, '상품(옵션)명') || '').trim()
      if (!product || /^(합계|총계|소계)$/.test(product)) continue
      const quantity = numberValue(at(row, '합산'))
      const price = numberValue(at(row, '공구가'))
      const amount = numberValue(at(row, '공구금액'))
      if (quantity < 0 || !Number.isInteger(quantity) || price <= 0 || Math.abs(quantity * price - amount) > 1) throw new Error('집계 시트의 합산 수량 × 공구가와 공구금액이 다릅니다. 공급사에 확인해주세요.')
      normalized.push([product, quantity, price, amount])
      supply += numberValue(at(row, '공급금액'))
      claims += Math.abs(numberValue(at(row, 'CS')))
    }
    if (normalized.length === 1) continue
    const clean = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(clean, XLSX.utils.aoa_to_sheet(normalized), '정산집계')
    const parsed = await parseSalesDataFile(new File([XLSX.write(clean, { type: 'array', bookType: 'xlsx' })], file.name), salesImport, priceCandidates)
    parsed.analysis.sheetName = name
    parsed.analysis.headerRow = index + 1
    parsed.analysis.formatName = '공급사 공구·공급금액 집계'
    parsed.analysis.warnings = parsed.analysis.warnings.filter((warning) => !warning.includes('주문·클레임 상태 열이 없어'))
    parsed.analysis.warnings.push(`집계 시트의 최종 합산 수량을 사용했습니다. CS ${claims}개는 이미 반영되어 다시 차감하지 않습니다. 거래명세서·전체 주문·CS 시트는 중복 합산하지 않습니다.`, `제품 공급대금 ${Math.round(supply).toLocaleString('ko-KR')}원은 고객 매출과 별도입니다. 배송비·반품배송비는 별도 확인해주세요.`)
    return parsed
  }
  // Some settlement workbooks keep prices in a report and quantities/claims
  // in a separate order sheet. Use explicit prices from the same workbook.
  const reportPrices: SalesPriceCandidate[] = []
  for (const name of workbook.SheetNames) {
    const report = sheetToRows<Cell>(workbook.Sheets[name])
    reportPrices.push(...extractEmbeddedPriceCandidates(report))
    const headerIndex = report.slice(0, 80).findIndex((row) => row.some((cell) => normalize(cell) === '기간매출합계') && row.some((cell) => normalize(cell) === '판매가') && row.some((cell) => normalize(cell) === '옵션정보'))
    if (headerIndex < 0) continue
    const labels = report[headerIndex].map(normalize)
    const optionIndex = labels.indexOf('옵션정보')
    const priceIndex = labels.indexOf('판매가')
    for (const row of report.slice(headerIndex + 1)) {
      const optionName = String(row[optionIndex] ?? '').trim()
      const groupBuyPrice = numberValue(row[priceIndex])
      if (optionName && groupBuyPrice > 0) reportPrices.push({ productName: '', optionName, groupBuyPrice, confirmed: true })
    }
  }
  for (const candidate of reportPrices) {
    if (reportPrices.some((other) => normalize(other.optionName) === normalize(candidate.optionName) && other.groupBuyPrice !== candidate.groupBuyPrice)) throw new Error('매출리포트에 같은 옵션의 판매가가 여러 개 있습니다. 적용할 판매가를 확인해주세요.')
  }
  priceCandidates = [...reportPrices, ...priceCandidates]
  let selected: { sheetName: string; rows: Cell[][]; header: NonNullable<ReturnType<typeof findHeader>>; priority: number } | undefined
  for (const sheetName of workbook.SheetNames) {
    const rows = sheetToRows<Cell>(workbook.Sheets[sheetName])
    // Naver order exports may contain only product, option, quantity and status.
    // Recognize the table first, then require every positive-quantity row to
    // resolve to a catalog price or a price confirmed by the reviewer.
    const header = findHeader(rows, true)
    const isFinalSettlementSummary = /정산(?:확인서|서|내역)/.test(sheetName)
      && header?.columns.product !== undefined
      && header.columns.quantity !== undefined
      && header.columns.unitPrice !== undefined
      && header.columns.grossSales !== undefined
    const priority = isFinalSettlementSummary ? 100 + header.score : header?.score ?? -1
    if (header && (!selected || priority > selected.priority)) selected = { sheetName, rows, header, priority }
  }
  if (!selected) throw new Error('판매수량과 판매금액 열을 찾지 못했습니다. 열 이름을 확인해주세요.')

  const dispatch = readDispatchWorkbook(workbook)
  if (dispatch) {
    selected = { rows: dispatch.rows, header: findHeader(dispatch.rows, true)!, sheetName: dispatch.breakdown.map((item) => item.sheetName).join(' · '), priority: 200 }
  }
  const { rows: sheetRows, header, sheetName } = selected
  const isSupplierSettlement = header.columns.eventType !== undefined
    && workbook.SheetNames.some((name) => /정산일반|정산상세|상품요약/.test(name))
  if (isSupplierSettlement) {
    const sellerCommissionRate = salesImport.sellerCommissionRate ?? salesImport.commissionRate ?? Number.NaN
    if (!Number.isFinite(sellerCommissionRate) || sellerCommissionRate < 0 || sellerCommissionRate >= 100) throw new Error('공급사 정산서의 총매출 역산에 사용할 셀러 수수료율을 확인해주세요.')
    const netRate = 1 - sellerCommissionRate / 100
    const grouped = new Map<number, { optionName: string; quantity: number; canceledQuantity: number }>()
    const statusMap = new Map<string, { quantity: number; amount: number; included: boolean }>()
    let sourceRowCount = 0
    let sourceQuantity = 0
    let reconstructedGrossSales = 0
    let reconstructedNetSales = 0
    let supplierSettlementAmount = 0

    for (const row of sheetRows.slice(header.rowIndex + 1)) {
      const quantity = numberValue(row[header.columns.quantity!])
      const optionName = String(row[header.columns.option ?? header.columns.product ?? 0] ?? '').trim().replace(/^제품선택\s*:\s*/, '')
      const supplierUnitPrice = Math.abs(header.columns.unitPrice === undefined ? 0 : numberValue(row[header.columns.unitPrice]))
      const supplierAmount = header.columns.grossSales === undefined ? quantity * supplierUnitPrice : numberValue(row[header.columns.grossSales])
      if (!optionName || quantity === 0 || supplierUnitPrice <= 0 || supplierAmount === 0) continue
      const eventType = String(row[header.columns.eventType!] ?? '정산 반영').trim() || '정산 반영'
      const customerUnitPrice = Math.round(supplierUnitPrice / netRate)
      const current = grouped.get(customerUnitPrice) ?? { optionName, quantity: 0, canceledQuantity: 0 }
      if (quantity > 0 && current.quantity === 0) current.optionName = optionName
      if (quantity > 0) current.quantity += quantity
      else current.canceledQuantity += Math.abs(quantity)
      grouped.set(customerUnitPrice, current)
      const status = statusMap.get(eventType) ?? { quantity: 0, amount: 0, included: true }
      status.quantity += quantity
      status.amount += supplierAmount
      statusMap.set(eventType, status)
      sourceRowCount += 1
      sourceQuantity += quantity
      if (quantity > 0) reconstructedGrossSales += quantity * customerUnitPrice
      reconstructedNetSales += quantity * customerUnitPrice
      supplierSettlementAmount += supplierAmount
    }

    const parsedRows = [...grouped].filter(([, item]) => item.quantity > 0).map(([unitPrice, item]) => calculateSalesRow({
      id: crypto.randomUUID(), salesDataImportId: salesImport.id, campaignId: salesImport.campaignId,
      optionName: item.optionName, quantity: item.quantity, unitPrice, canceledQuantity: item.canceledQuantity, refundedQuantity: 0,
    }))
    if (!parsedRows.length) throw new Error('공급사 정산서에서 정산에 포함할 판매행을 찾지 못했습니다.')
    const sellerCommissionAmount = reconstructedNetSales - supplierSettlementAmount
    return {
      rows: parsedRows,
      rowsIncludingPending: parsedRows,
      analysis: {
        sourceDocumentType: 'supplier_settlement',
        formatName: '공급사 확정 정산서 자동 인식', sheetName, headerRow: header.rowIndex + 1,
        sourceRowCount, includedRowCount: sourceRowCount, excludedRowCount: 0,
        sourceQuantity: parsedRows.reduce((sum, row) => sum + row.quantity, 0), includedQuantity: sourceQuantity,
        sourceGrossSales: reconstructedGrossSales, includedGrossSales: reconstructedNetSales, excludedGrossSales: reconstructedGrossSales - reconstructedNetSales,
        pendingPaymentRowCount: 0, pendingPaymentQuantity: 0, pendingPaymentSales: 0,
        supplierSettlementAmount, sellerCommissionRateUsed: sellerCommissionRate,
        statusBreakdown: [...statusMap].map(([status, value]) => ({ status, ...value })),
        detectedColumns: Object.keys(header.columns).map((key) => header.labels[key as ParsedColumn] ?? aliases[key as ParsedColumn][0]),
        warnings: [
          `반품·취소 음수 행까지 반영한 공급사 정산금액은 ${Math.round(supplierSettlementAmount).toLocaleString('ko-KR')}원입니다.`,
          `셀러 수수료율 ${sellerCommissionRate}%를 적용해 고객 순매출 ${Math.round(reconstructedNetSales).toLocaleString('ko-KR')}원과 셀러 수수료 ${Math.round(sellerCommissionAmount).toLocaleString('ko-KR')}원으로 역산했습니다.`,
        ],
      },
    }
  }

  const normalizedPriceCandidates = priceCandidates
    .filter((candidate) => Number.isFinite(candidate.groupBuyPrice) && candidate.groupBuyPrice > 0)
    .map((candidate) => ({ ...candidate, productKey: normalize(candidate.productName), optionKey: normalize(candidate.optionName) }))
  const lookupCandidate = (productName: string, optionName: string) => {
    const productKey = normalize(productName)
    const optionKey = normalize(optionName)
    const confirmed = normalizedPriceCandidates.find((candidate) => candidate.confirmed && candidate.optionKey === optionKey)
    if (confirmed) return confirmed
    const ranked = normalizedPriceCandidates.map((candidate) => {
      let score = 0
      if (optionKey && optionKey === candidate.optionKey) score += 120
      else if (!candidate.exactMatchOnly && optionKey && candidate.optionKey.length >= 2 && (optionKey.includes(candidate.optionKey) || candidate.optionKey.includes(optionKey))) {
        // "3+3팩"에는 "3팩"도 포함되므로 더 구체적인(긴) 옵션명을 우선합니다.
        score += 90 + Math.min(candidate.optionKey.length, 20)
      }
      if (productKey && productKey === candidate.productKey) score += 50
      else if (productKey && candidate.productKey.length >= 4 && (productKey.includes(candidate.productKey) || candidate.productKey.includes(productKey))) score += 30
      return { ...candidate, score }
    }).filter((candidate) => candidate.score >= 90).sort((left, right) => right.score - left.score)
    if (!ranked.length || (ranked[1] && ranked[1].score === ranked[0].score && (ranked[1].groupBuyPrice !== ranked[0].groupBuyPrice || ranked[1].skuId !== ranked[0].skuId))) return undefined
    return ranked[0]
  }

  const statusMap = new Map<string, { quantity: number; amount: number; included: boolean }>()
  const grouped = new Map<string, { optionName: string; productName: string; condition?: SalesPriceCandidate; priceSource: 'sku' | 'file'; quantity: number; sales: number; canceledQuantity: number; refundedQuantity: number }>()
  const groupedIncludingPending = new Map<string, { optionName: string; productName: string; condition?: SalesPriceCandidate; priceSource: 'sku' | 'file'; quantity: number; sales: number; canceledQuantity: number; refundedQuantity: number }>()
  let sourceRowCount = 0
  let includedRowCount = 0
  let sourceQuantity = 0
  let includedQuantity = 0
  let sourceGrossSales = 0
  let includedGrossSales = 0
  let pendingPaymentRowCount = 0
  let pendingPaymentQuantity = 0
  let pendingPaymentSales = 0
  let sourceShippingRevenue = 0
  let includedShippingRevenue = 0
  let pendingPaymentShippingRevenue = 0
  let catalogPriceAdjustment = 0
  let catalogPricedRowCount = 0
  const unmatchedCatalogOptions = new Set<string>()
  const isOrderHubFormat = normalize(header.labels.product) === normalize('판매사상품명')

  for (const row of sheetRows.slice(header.rowIndex + 1)) {
    const quantity = numberValue(row[header.columns.quantity!])
    const productName = header.columns.product === undefined ? '' : String(row[header.columns.product] ?? '').trim()
    const optionCell = String(row[header.columns.option ?? header.columns.product ?? 0] ?? '').trim().replace(/^제품선택\s*:\s*/, '')
    // Some Naver settlement sheets include an option column even when the product has
    // no options. In that case the product name is the only stable SKU label.
    const rawOptionName = optionCell || productName
    const optionName = isOrderHubFormat && header.columns.option === undefined ? extractOrderHubOptionName(rawOptionName) : rawOptionName
    const candidate = lookupCandidate(productName, optionName)
    const catalogUnitPrice = candidate?.groupBuyPrice ?? 0
    const reportedGrossSales = header.columns.grossSales === undefined ? 0 : numberValue(row[header.columns.grossSales])
    const reportedUnitPrice = header.columns.unitPrice === undefined ? 0 : numberValue(row[header.columns.unitPrice])
    const requiresCatalogPrice = reportedGrossSales === 0 && reportedUnitPrice <= 0
    if (requiresCatalogPrice && optionName && quantity > 0 && catalogUnitPrice <= 0) {
      unmatchedCatalogOptions.add(optionName)
      continue
    }
    if (isOrderHubFormat && normalizedPriceCandidates.length > 0 && quantity > 0 && reportedGrossSales > 0 && catalogUnitPrice <= 0) {
      unmatchedCatalogOptions.add(optionName)
      continue
    }
    const preferCatalogPrice = catalogUnitPrice > 0 && (requiresCatalogPrice || (isOrderHubFormat && header.columns.unitPrice === undefined))
    const unitPrice = reportedUnitPrice > 0 ? reportedUnitPrice : catalogUnitPrice
    const grossSales = preferCatalogPrice ? quantity * catalogUnitPrice : reportedGrossSales === 0 ? quantity * unitPrice : reportedGrossSales
    if (preferCatalogPrice) {
      catalogPricedRowCount += 1
      catalogPriceAdjustment += grossSales - reportedGrossSales
    }
    const collectedAmount = header.columns.collectedAmount === undefined ? grossSales : numberValue(row[header.columns.collectedAmount])
    const shippingRevenue = Math.max(collectedAmount - grossSales, 0)
    const orderStatus = header.columns.orderStatus === undefined ? '상태 없음' : String(row[header.columns.orderStatus] ?? '상태 없음').trim() || '상태 없음'
    const claimStatus = header.columns.claimStatus === undefined ? '' : String(row[header.columns.claimStatus] ?? '').trim()
    // Naver order lookups can encode a returned single-item order as quantity 0
    // while retaining the original line amount. Preserve it as one refunded item
    // without subtracting the already-netted sales total a second time.
    if (optionName && quantity === 0 && reportedGrossSales > 0 && /^반품(?:완료)?$/.test(claimStatus.replace(/\s/g, ''))) {
      const statusKey = `${orderStatus} · ${claimStatus}`
      const status = statusMap.get(statusKey) ?? { quantity: 0, amount: 0, included: false }
      status.quantity += 1
      statusMap.set(statusKey, status)
      sourceRowCount += 1
      continue
    }
    if (!optionName || quantity <= 0 || grossSales <= 0) continue
    const hardExcluded = isHardExcludedStatus(orderStatus, claimStatus)
    // A cancelled "미결제취소" row is a cancellation, not a payment-pending row.
    // Cancellation takes precedence so the same row is never counted twice.
    const pending = !hardExcluded && isPendingStatus(orderStatus, claimStatus)
    const excluded = pending || hardExcluded
    const statusKey = claimStatus ? `${orderStatus} · ${claimStatus}` : orderStatus
    const status = statusMap.get(statusKey) ?? { quantity: 0, amount: 0, included: !excluded }
    status.quantity += quantity
    status.amount += grossSales
    statusMap.set(statusKey, status)
    sourceRowCount += 1
    sourceQuantity += quantity
    sourceGrossSales += grossSales
    sourceShippingRevenue += shippingRevenue
    if (pending) {
      pendingPaymentRowCount += 1
      pendingPaymentQuantity += quantity
      pendingPaymentSales += grossSales
      pendingPaymentShippingRevenue += shippingRevenue
    }
    const effectiveUnitPrice = header.columns.grossSales === undefined ? unitPrice : grossSales / quantity
    const key = JSON.stringify([optionName, effectiveUnitPrice, candidate?.skuId ?? (candidate ? `${candidate.productName}::${candidate.optionName}` : productName)])
    if (hardExcluded) {
      const claimIsRefund = /반품|환불/.test(`${orderStatus} ${claimStatus}`)
      const addClaim = (target: typeof grouped) => {
        const current = target.get(key) ?? { optionName, productName, condition: candidate, priceSource: preferCatalogPrice ? 'sku' as const : 'file' as const, quantity: 0, sales: 0, canceledQuantity: 0, refundedQuantity: 0 }
        current.quantity += quantity
        current.sales += grossSales
        if (claimIsRefund) current.refundedQuantity += quantity
        else current.canceledQuantity += quantity
        target.set(key, current)
      }
      addClaim(grouped)
      addClaim(groupedIncludingPending)
    }
    if (!hardExcluded) {
      const current = groupedIncludingPending.get(key) ?? { optionName, productName, condition: candidate, priceSource: preferCatalogPrice ? 'sku' as const : 'file' as const, quantity: 0, sales: 0, canceledQuantity: 0, refundedQuantity: 0 }
      current.quantity += quantity
      current.sales += grossSales
      groupedIncludingPending.set(key, current)
    }
    if (excluded) continue
    includedRowCount += 1
    includedQuantity += quantity
    includedGrossSales += grossSales
    includedShippingRevenue += shippingRevenue
    const current = grouped.get(key) ?? { optionName, productName, condition: candidate, priceSource: preferCatalogPrice ? 'sku' as const : 'file' as const, quantity: 0, sales: 0, canceledQuantity: 0, refundedQuantity: 0 }
    current.quantity += quantity
    current.sales += grossSales
    grouped.set(key, current)
  }
  if (unmatchedCatalogOptions.size > 0) {
    throw new UnmatchedSalesPricesError([...unmatchedCatalogOptions])
  }
  if (!includedRowCount) {
    if (header.columns.grossSales === undefined && header.columns.unitPrice === undefined) {
      throw new Error('이 주문조회 파일에는 판매금액 열이 없고 상품 DB에서도 옵션 판매가를 찾지 못했습니다. 상품 DB의 옵션명·공구가를 확인하거나 금액이 포함된 발주모아 파일을 올려주세요.')
    }
    throw new Error('정산에 포함할 판매행을 찾지 못했습니다.')
  }

  const parsedRows = [...grouped.values()].filter((item) => item.quantity > 0).map((item) => calculateSalesRow({
    id: crypto.randomUUID(), salesDataImportId: salesImport.id, campaignId: salesImport.campaignId,
    skuId: item.condition?.skuId,
    productId: item.condition?.productId,
    productName: item.condition?.productName ?? item.productName,
    totalCommissionRate: item.condition?.totalCommissionRate,
    sellerCommissionRate: item.condition?.sellerCommissionRate,
    agreedUnitPrice: item.condition?.groupBuyPrice,
    priceSource: item.priceSource,
    optionName: item.optionName, quantity: item.quantity, unitPrice: Math.round(item.sales / item.quantity), canceledQuantity: item.canceledQuantity, refundedQuantity: item.refundedQuantity,
  }))
  const parsedRowsIncludingPending = [...groupedIncludingPending.values()].filter((item) => item.quantity > 0).map((item) => calculateSalesRow({
    id: crypto.randomUUID(), salesDataImportId: salesImport.id, campaignId: salesImport.campaignId,
    skuId: item.condition?.skuId,
    productId: item.condition?.productId,
    productName: item.condition?.productName ?? item.productName,
    totalCommissionRate: item.condition?.totalCommissionRate,
    sellerCommissionRate: item.condition?.sellerCommissionRate,
    agreedUnitPrice: item.condition?.groupBuyPrice,
    priceSource: item.priceSource,
    optionName: item.optionName, quantity: item.quantity, unitPrice: Math.round(item.sales / item.quantity), canceledQuantity: item.canceledQuantity, refundedQuantity: item.refundedQuantity,
  }))
  const declaredGrossSales = findLabeledNumber(sheetRows, ['총 판매금액', '총매출 합계', '판매금액 합계'])
  const supplyTotal = dispatch?.summary?.productSupply ?? findLabeledNumber(sheetRows, ['공급가 합계', '총 공급가'])
  if (dispatch?.summary && dispatch.summary.quantity !== includedQuantity && dispatch.summary.quantity !== includedQuantity + pendingPaymentQuantity) {
    throw new Error(`발주 시트 합산 수량 ${includedQuantity}개와 최종정산 수량 ${dispatch.summary.quantity}개가 다릅니다. 누락·중복·취소 발주를 확인해주세요.`)
  }
  const declaredMargin = findLabeledNumber(sheetRows, ['세금계산서 발행 요청 금액', '판매금액 - 공급가'])
  const warnings: string[] = []
  if (dispatch) {
    warnings.push(`발주 시트 ${dispatch.breakdown.length}개를 모두 합산했습니다. 공구 종료 후 마지막 발주도 포함합니다.`)
    const duplicates = dispatch.breakdown.reduce((sum, item) => sum + item.duplicateRowCount, 0)
    if (duplicates) warnings.push(`동일한 상품주문번호와 내용이 반복된 ${duplicates}행은 한 번만 반영했습니다.`)
    if (dispatch.summary) warnings.push(`${dispatch.summary.sheetName} 시트는 공급가·배송비·수량 대조에만 사용했습니다. 공급가와 배송비는 고객 판매금액에 더하지 않습니다.`)
  }
  if (pendingPaymentRowCount) warnings.push(`결제대기 ${pendingPaymentRowCount}행 ${Math.round(pendingPaymentSales).toLocaleString('ko-KR')}원은 포함 여부를 선택해야 합니다.`)
  const hardExcludedSales = sourceGrossSales - includedGrossSales - pendingPaymentSales
  if (hardExcludedSales > 0) warnings.push(`취소·환불 등 ${Math.round(hardExcludedSales).toLocaleString('ko-KR')}원은 두 선택 모두에서 제외됩니다.`)
  if (declaredGrossSales && Math.round(declaredGrossSales) !== Math.round(sourceGrossSales)) warnings.push('파일에 표시된 총 판매금액과 판매행 합계가 다릅니다.')
  if (!header.columns.orderStatus && !header.columns.claimStatus) warnings.push('주문·클레임 상태 열이 없어 모든 판매행을 포함했습니다.')
  if (header.columns.grossSales === undefined && header.columns.unitPrice === undefined && catalogPricedRowCount === 0) warnings.push('파일에 판매금액이 없어 상품 DB의 옵션별 공구가로 매출을 계산했습니다.')
  if (catalogPricedRowCount > 0 && isOrderHubFormat) {
    const adjustmentText = catalogPriceAdjustment === 0
      ? '결제금액과 차이가 없습니다.'
      : `결제금액보다 ${Math.abs(Math.round(catalogPriceAdjustment)).toLocaleString('ko-KR')}원 ${catalogPriceAdjustment > 0 ? '높습니다.' : '낮습니다.'}`
    warnings.push(`발주모아 ${catalogPricedRowCount}행은 네이버 할인과 무관한 상품 DB 공구가 기준으로 계산했습니다. 할인 전 매출은 ${adjustmentText}`)
  } else if (catalogPricedRowCount > 0) {
    warnings.push(`판매가가 없는 주문조회 ${catalogPricedRowCount}행은 상품 DB의 옵션별 공구가로 매출을 계산했습니다.`)
  }
  if (supplyTotal && sourceQuantity !== includedQuantity) warnings.push('공급가표는 제외 전 전체 수량 기준일 수 있어 정산 전 확인이 필요합니다.')

  return {
    rows: parsedRows,
    rowsIncludingPending: parsedRowsIncludingPending,
    analysis: {
      sourceDocumentType: dispatch?.summary ? 'supplier_dispatch' : 'customer_sales',
      dispatchSheets: dispatch?.breakdown,
      finalSettlementQuantity: dispatch?.summary?.quantity,
      supplierShippingCost: dispatch?.summary?.shipping,
      supplierPayableTotal: dispatch?.summary ? dispatch.summary.productSupply + dispatch.summary.shipping : undefined,
      formatName: header.rowIndex === 0 ? '주문내역형 자동 인식' : '다중영역 정산서 자동 인식', sheetName, headerRow: header.rowIndex + 1,
      sourceRowCount, includedRowCount, excludedRowCount: sourceRowCount - includedRowCount,
      sourceQuantity, includedQuantity, sourceGrossSales, includedGrossSales, excludedGrossSales: sourceGrossSales - includedGrossSales,
      sourceShippingRevenue, includedShippingRevenue, pendingPaymentShippingRevenue,
      pendingPaymentRowCount, pendingPaymentQuantity, pendingPaymentSales,
      declaredGrossSales, supplyTotal, declaredMargin,
      statusBreakdown: [...statusMap].map(([status, value]) => ({ status, ...value })),
      detectedColumns: Object.keys(header.columns).map((key) => header.labels[key as ParsedColumn] ?? aliases[key as ParsedColumn][0]), warnings,
    },
  }
}
