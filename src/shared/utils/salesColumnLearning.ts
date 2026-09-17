import * as XLSX from 'xlsx'
import { sheetToRows } from './spreadsheetRows.ts'

export const columnFields = {
  option: '상품·옵션명', quantity: '판매수량 (취소·반품 포함)', unitPrice: '개당 판매가',
  gross: '상품 총매출 (취소 차감 전·배송비 제외)', canceled: '취소수량', refunded: '반품수량',
  status: '주문상태', claim: '클레임상태',
} as const
export type ColumnField = keyof typeof columnFields
export type ColumnMap = Partial<Record<ColumnField, number>>
export type SheetSample = { name: string; rows: unknown[][] }
export type ColumnRule = { scope: string; signature: string; mapping: ColumnMap; updatedAt: string }
export const normalizeTerm = (value: unknown) => String(value ?? '').normalize('NFC').toLowerCase().replace(/[\s_()\-/.]/g, '')
const terms: Record<ColumnField, string[]> = {
  option: ['옵션정보', '옵션명', '상품옵션', '구성명', '품목명', '상품명', '제품명'],
  quantity: ['판매수량', '주문수량', '수량', '판매개수', '주문개수', 'qty', 'quantity'],
  unitPrice: ['판매단가', '개당판매가', '옵션판매가', '공구가', '공구판매가', '판매가', 'unitprice'],
  gross: ['상품총매출', '총판매금액', '상품금액옵션포함', '총매출'],
  canceled: ['취소수량', '취소개수'], refunded: ['반품수량', '환불수량', '반품개수'],
  status: ['주문상태', '결제상태', '배송상태'], claim: ['클레임상태', '취소상태', '반품상태'],
}
export async function inspectSalesWorkbook(file: File): Promise<SheetSample[]> {
  const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array' })
  return workbook.SheetNames.map((name) => ({ name, rows: sheetToRows<unknown>(workbook.Sheets[name]) }))
}
export function suggestColumns(header: unknown[]): ColumnMap {
  const mapping: ColumnMap = {}
  for (const field of Object.keys(terms) as ColumnField[]) {
    const candidates = header.flatMap((cell, index) => terms[field].some((term) => normalizeTerm(term) === normalizeTerm(cell)) ? [index] : [])
    if (candidates.length === 1) mapping[field] = candidates[0]
  }
  return mapping
}
export const headerSignature = (header: unknown[]) => JSON.stringify(header.map(normalizeTerm))
export function findLearnedRule(sheets: SheetSample[], scope: string, rules: ColumnRule[]) {
  for (let sheet = 0; sheet < sheets.length; sheet++) {
    for (let row = 0; row < Math.min(sheets[sheet].rows.length, 80); row++) {
      const rule = rules.find((item) => item.scope === scope && item.signature === headerSignature(sheets[sheet].rows[row]))
      if (rule) return { sheet, row, mapping: rule.mapping }
    }
  }
  return undefined
}
export function suggestHeader(sheets: SheetSample[]) {
  let best = { sheet: 0, row: 0, mapping: {} as ColumnMap, score: -1 }
  sheets.forEach((sheet, sheetIndex) => sheet.rows.slice(0, 80).forEach((header, row) => {
    const mapping = suggestColumns(header)
    const score = Object.keys(mapping).length
    if (score > best.score) best = { sheet: sheetIndex, row, mapping, score }
  }))
  return best
}
export function mapSalesSheet(sheet: SheetSample, headerRow: number, mapping: ColumnMap): File {
  if (mapping.option === undefined || mapping.quantity === undefined || (mapping.unitPrice === undefined && mapping.gross === undefined)) throw new Error('상품·옵션명, 판매수량과 판매가 또는 상품 총매출 열을 확인해주세요.')
  const columns = Object.values(mapping)
  if (new Set(columns).size !== columns.length) throw new Error('같은 열을 두 가지 의미로 지정할 수 없습니다.')
  const numeric = (value: unknown, label: string) => {
    const cleaned = String(value ?? '').replace(/[\s,₩원]/g, '')
    const number = cleaned === '' || cleaned === '-' ? 0 : Number(cleaned)
    if (!Number.isFinite(number) || number < 0) throw new Error(`${label}: 숫자 형식을 확인해주세요. 음수 반품행은 수량 열 분리 또는 주문상태 확인이 필요합니다.`)
    return number
  }
  const output: unknown[][] = [['옵션정보', '수량', '옵션판매가', '총판매금액', '주문상태', '클레임상태']]
  for (const [index, row] of sheet.rows.entries()) {
    if (index <= headerRow) continue
    const option = String(row[mapping.option] ?? '').trim()
    if (!option || /^(합계|총계|소계|판매소계)$/.test(normalizeTerm(option))) continue
    const get = (field: ColumnField) => mapping[field] === undefined ? undefined : row[mapping[field]!]
    const quantity = numeric(get('quantity'), `${index + 1}행 수량`)
    if (!quantity) continue
    const gross = mapping.gross === undefined ? undefined : numeric(get('gross'), `${index + 1}행 매출`)
    const unit = mapping.unitPrice === undefined ? gross! / quantity : numeric(get('unitPrice'), `${index + 1}행 판매가`)
    if (gross !== undefined && Math.abs(gross - quantity * unit) > 1) throw new Error(`${index + 1}행에서 수량 × 판매가와 상품 총매출이 다릅니다. 할인·배송비 포함 여부를 확인하고 정산 기준 금액 열을 선택해주세요.`)
    const canceled = numeric(get('canceled'), '취소수량'), refunded = numeric(get('refunded'), '반품수량')
    if (canceled + refunded > quantity) throw new Error(`${index + 1}행 취소·반품 수량이 판매수량보다 큽니다.`)
    if ((canceled || refunded) && (get('status') || get('claim'))) throw new Error('취소·반품 수량과 주문상태가 함께 지정되었습니다. 중복 차감을 피하려면 한 방식만 선택해주세요.')
    const add = (qty: number, status: unknown, claim: unknown) => { if (qty) output.push([option, qty, unit, qty * unit, status ?? '', claim ?? '']) }
    add(quantity - canceled - refunded, get('status'), get('claim'))
    add(canceled, '주문취소', '취소완료')
    add(refunded, '반품완료', '반품완료')
  }
  if (output.length === 1) throw new Error('선택한 열에서 판매행을 찾지 못했습니다.')
  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(output), '확인한 판매내역')
  return new File([XLSX.write(workbook, { type: 'array', bookType: 'xlsx' })], 'mapped-sales.xlsx')
}
