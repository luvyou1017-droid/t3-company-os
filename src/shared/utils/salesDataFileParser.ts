import * as XLSX from 'xlsx'
import type { SalesDataRow } from '../types/salesData'

type Cell = string | number | boolean | Date | null

const normalize = (value: Cell | undefined) => String(value ?? '').replace(/\s+/g, '').toLowerCase()

const numberValue = (value: Cell | undefined) => {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0
  const parsed = Number(String(value ?? '').replace(/[^0-9.-]/g, ''))
  return Number.isFinite(parsed) ? parsed : 0
}

function findColumn(headers: Cell[], names: string[]) {
  const normalizedNames = names.map(normalize)
  return headers.findIndex((header) => normalizedNames.includes(normalize(header)))
}

export type ParsedSalesFile = {
  rows: SalesDataRow[]
  sheetName: string
  totalCommissionRate?: number
  paymentPendingQuantity: number
  paymentPendingAmount: number
}

/** 업체별 배치가 달라도 공통 열 이름을 찾아 실제 판매 합계를 읽습니다. */
export async function parseSalesDataFile(file: File, salesDataImportId: string, campaignId: string): Promise<ParsedSalesFile> {
  const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array', cellDates: true })
  const orderedSheets = [...workbook.SheetNames].sort((a, b) => Number(b.includes('판매집계')) - Number(a.includes('판매집계')))

  for (const sheetName of orderedSheets) {
    const data = XLSX.utils.sheet_to_json<Cell[]>(workbook.Sheets[sheetName], { header: 1, defval: null, raw: true })
    for (let headerRow = 0; headerRow < Math.min(data.length, 40); headerRow += 1) {
      const headers = data[headerRow]
      const optionColumn = findColumn(headers, ['옵션정보', '옵션명', '구성명'])
      const productColumn = findColumn(headers, ['상품명', '제품명'])
      const quantityColumn = findColumn(headers, ['수량', '판매수량', '주문수량'])
      const unitPriceColumn = findColumn(headers, ['옵션 판매가', '판매가', '공구가', '단가'])
      const salesColumn = findColumn(headers, ['최종매출', '순매출', '총매출', '총주문금액', '옵션별총액', '총판매가'])
      const orderStatusColumn = findColumn(headers, ['주문상태', '결제상태', '상태'])
      if (quantityColumn < 0 || salesColumn < 0 || (optionColumn < 0 && productColumn < 0)) continue

      const rows: SalesDataRow[] = []
      data.slice(headerRow + 1).forEach((sourceRow, index) => {
        const quantity = numberValue(sourceRow[quantityColumn])
        const grossSales = numberValue(sourceRow[salesColumn])
        const option = String(sourceRow[optionColumn] ?? '').trim()
        const product = String(sourceRow[productColumn] ?? '').trim()
        if (!quantity || !grossSales || (!option && !product)) return
        const unitPrice = unitPriceColumn >= 0 ? numberValue(sourceRow[unitPriceColumn]) : grossSales / quantity
        const orderStatus = orderStatusColumn >= 0 ? String(sourceRow[orderStatusColumn] ?? '').trim() : ''
        rows.push({
          id: `${salesDataImportId}-file-${index + 1}`,
          salesDataImportId,
          campaignId,
          optionName: option || product,
          quantity,
          unitPrice,
          grossSales,
          canceledQuantity: 0,
          refundedQuantity: 0,
          netQuantity: quantity,
          netSales: grossSales,
          validationStatus: 'valid',
          validationMessage: `${sheetName} 시트에서 읽음`,
          orderStatus: orderStatus || undefined,
        })
      })
      if (rows.length) {
        const statementSheet = workbook.Sheets['거래명세서']
        const statementRows = statementSheet ? XLSX.utils.sheet_to_json<Cell[]>(statementSheet, { header: 1, defval: null, raw: true }) : []
        const statementText = statementRows.flat().map((cell) => String(cell ?? '')).join(' ')
        const rateMatch = statementText.match(/(\d+(?:\.\d+)?)\s*%\s*수수료/)
        const paymentPendingRows = rows.filter((row) => normalize(row.orderStatus) === normalize('결제대기'))
        return {
          rows,
          sheetName,
          totalCommissionRate: rateMatch ? Number(rateMatch[1]) : undefined,
          paymentPendingQuantity: paymentPendingRows.reduce((sum, row) => sum + row.quantity, 0),
          paymentPendingAmount: paymentPendingRows.reduce((sum, row) => sum + row.grossSales, 0),
        }
      }
    }
  }

  throw new Error('판매 수량과 매출 열을 찾지 못했습니다. 파일의 시트명과 열 제목을 확인해주세요.')
}
