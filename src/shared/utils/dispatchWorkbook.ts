import type * as XLSX from 'xlsx'
import { sheetToRows } from './spreadsheetRows.ts'

type Cell = string | number | boolean | Date | null | undefined
const key = (value: Cell) => String(value ?? '').trim().replace(/[\s()]/g, '')
const amount = (value: Cell) => Number(String(value ?? '').replace(/[,원\s]/g, '')) || 0
const indexOf = (row: Cell[], names: string[]) => row.findIndex((cell) => names.includes(key(cell)))

/** Daily dispatches are additive; supply summaries are reconciliation evidence only. */
export function readDispatchWorkbook(workbook: XLSX.WorkBook) {
  const sheets = workbook.SheetNames.map((name) => ({ name, rows: sheetToRows<Cell>(workbook.Sheets[name]) }))
  const summaries: Array<{ sheetName: string; quantity: number; productSupply: number; shipping: number; details: Cell[][] }> = []
  for (const sheet of sheets) {
    let columns: { product: number; quantity: number; unit: number; total: number } | undefined
    let quantity = 0
    let productSupply = 0
    let shipping = 0
    let detailCount = 0
    const details: Cell[][] = []
    let declaredTotal: number | undefined
    let blockTotal = 0
    for (const row of sheet.rows) {
      const candidate = {
        product: indexOf(row, ['품명', '상품명', '제품명']),
        quantity: indexOf(row, ['판매수량', '수량']),
        unit: indexOf(row, ['개당공급가', '공급단가']),
        total: indexOf(row, ['총공급가', '공급금액']),
      }
      if (Object.values(candidate).every((index) => index >= 0)) { columns = candidate; continue }
      if (!columns) continue
      const name = key(row[columns.product])
      if (row.some((cell) => /공급가합계/.test(key(cell)))) {
        if (Math.abs(blockTotal - amount(row[columns.total])) > 1) throw new Error(`${sheet.name} 시트의 발주별 공급가·배송비 소계가 다릅니다.`)
        blockTotal = 0
        continue
      }
      if (row.some((cell) => /최종정산금액|총정산금액/.test(key(cell)))) {
        declaredTotal = amount(row[columns.total])
        continue
      }
      if (!name || /합계|소계|총계/.test(name)) continue
      const count = amount(row[columns.quantity])
      const unit = amount(row[columns.unit])
      const total = amount(row[columns.total])
      if (count === 0 && unit === 0 && total === 0) continue
      if (Math.abs(count * unit - total) > 1) throw new Error(`${sheet.name} 시트의 ${name}: 수량 × 공급단가와 총 공급가가 다릅니다. 원본을 확인해주세요.`)
      blockTotal += total
      if (/^(택배비|배송비|추가배송비)$/.test(name)) shipping += total
      else { quantity += count; productSupply += total; detailCount += 1; details.push([row[columns.product], row[columns.product], count, null, null, null, null, null]) }
    }
    if (!detailCount) continue
    if (declaredTotal !== undefined && Math.abs(productSupply + shipping - declaredTotal) > 1) throw new Error(`${sheet.name} 시트의 상품 공급가·배송비 합계와 최종 합계가 다릅니다.`)
    summaries.push({ sheetName: sheet.name, quantity, productSupply, shipping, details })
  }
  if (summaries.length > 1) throw new Error('공급가 정산 요약 시트가 여러 개입니다. 최종본 한 개만 남겨 다시 업로드해주세요.')

  const dispatches = sheets.flatMap((sheet) => {
    const headerRow = sheet.rows.slice(0, 80).findIndex((row) =>
      indexOf(row, ['주문번호', '상품주문번호', '주문상품고유번호']) >= 0
      && indexOf(row, ['주문수량', '수량']) >= 0
      && indexOf(row, ['판매사상품명', '상품명', '제품명']) >= 0)
    return headerRow < 0 ? [] : [{ ...sheet, headerRow }]
  })
  if (!dispatches.length && summaries.length === 1) {
    const summary = summaries[0]
    return { rows: [['상품명', '옵션명', '수량', '옵션판매가', '총매출', '주문상태', '클레임상태', '결제금액(통합)'], ...summary.details] as Cell[][],
      breakdown: [{ sheetName: summary.sheetName, quantity: summary.quantity, rowCount: summary.details.length, duplicateRowCount: 0 }], summary }
  }
  if (!dispatches.length || (dispatches.length < 2 && !summaries.length)) return undefined

  const rows: Cell[][] = [['상품명', '옵션명', '수량', '옵션판매가', '총매출', '주문상태', '클레임상태', '결제금액(통합)']]
  const seen = new Map<string, string>()
  const breakdown: Array<{ sheetName: string; quantity: number; rowCount: number; duplicateRowCount: number }> = []
  for (const sheet of dispatches) {
    const header = sheet.rows[sheet.headerRow]
    const product = indexOf(header, ['판매사상품명', '상품명', '제품명'])
    const option = indexOf(header, ['판매사옵션명', '고객선택옵션', '옵션정보', '옵션명', '상품옵션'])
    const quantity = indexOf(header, ['주문수량', '수량'])
    const itemId = indexOf(header, ['상품주문번호', '주문상품고유번호'])
    const unit = indexOf(header, ['옵션판매가', '개당판매가', '판매단가', '공동구매가'])
    const total = indexOf(header, ['상품금액옵션포함', '최종매출', '총판매금액', '결제금액', '판매금액', '총매출'])
    const collected = indexOf(header, ['결제금액통합', '총결제금액'])
    const status = indexOf(header, ['주문상태', '결제상태', '배송상태'])
    const claim = indexOf(header, ['클레임상태', '취소상태', '환불상태', '반품상태'])
    const result = { sheetName: sheet.name, quantity: 0, rowCount: 0, duplicateRowCount: 0 }
    for (const row of sheet.rows.slice(sheet.headerRow + 1)) {
      if (!key(row[product]) || /^(합계|소계|총계)$/.test(key(row[product])) || !Number.isFinite(Number(row[quantity])) || row[quantity] === null) continue
      const record = [row[product], option < 0 ? row[product] : row[option], amount(row[quantity]), unit < 0 ? null : row[unit], total < 0 ? null : row[total], status < 0 ? null : row[status], claim < 0 ? null : row[claim], collected < 0 ? (total < 0 ? null : row[total]) : row[collected]]
      const identity = itemId < 0 ? '' : String(row[itemId] ?? '').trim()
      const fingerprint = JSON.stringify(record)
      if (identity && seen.has(identity)) {
        if (seen.get(identity) !== fingerprint) throw new Error(`${sheet.name} 시트에 앞선 발주와 같은 상품주문번호의 수량·옵션·금액·상태가 다르게 기재되어 있습니다. 중복 또는 수정 발주를 확인해주세요.`)
        result.duplicateRowCount += 1
        continue
      }
      if (identity) seen.set(identity, fingerprint)
      rows.push(record)
      result.quantity += amount(row[quantity])
      result.rowCount += 1
    }
    breakdown.push(result)
  }
  return { rows, breakdown, summary: summaries[0] }
}
