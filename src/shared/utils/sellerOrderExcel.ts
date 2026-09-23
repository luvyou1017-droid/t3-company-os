import * as XLSX from 'xlsx'
import type { SalesDataRow } from '../types/salesData'

const normalize = (value: unknown) => String(value ?? '').normalize('NFKC').toLowerCase().replace(/[\s_\-()[\]]/g, '')
const permitted = new Set(['주문번호','주문일','주문일자','주문일시','결제일','결제일자','결제일시','주문상품고유번호','구매자명','구매자','주문자명','주문자','주문자연락처','구매자연락처','연락처','전화번호','휴대폰','휴대폰번호','수령인명','수령인','수취인','수취인명','수령인연락처','수취인연락처','수취인전화번호','수취인휴대폰','수취인휴대폰번호','주소','배송지','배송주소','수령인주소','수취인주소','우편번호','기본주소','상세주소','상품명','판매사상품명','상품코드','옵션','옵션명','판매사옵션명','상품옵션','옵션정보','세부옵션','수량','주문수량','판매수량','주문금액','결제금액','실결제금액','상품금액','판매금액','판매가','상품가격','단가','할인금액','주문상태','결제상태','배송상태','취소수량','취소금액','취소일','취소일자','환불수량','환불금액','환불일','환불일자','반품수량','반품금액','배송비','추가배송비','배송비합계','배송비타입','택배사','택배사**','운송장번호','송장번호','배송번호','배송시요청사항','배송메모','배송요청사항','발송일','발송일자','배송일','배송완료일','배송관련정보'].map(normalize))
const internal = /수수료|원가|마진|차익|배분|귀속|공급조건|공급가|상계|조정|commission|margin|profit|cost|internal/i
export const isSellerOrderColumn = (header: unknown) => !internal.test(String(header)) && permitted.has(normalize(header))

export function sanitizeSellerWorkbook(bytes: ArrayBuffer): Uint8Array {
  const source = XLSX.read(bytes, { type: 'array', cellFormula: false, cellHTML: false, cellDates: true })
  const output = XLSX.utils.book_new()
  for (const name of source.SheetNames) {
    // Internal/summary sheets are never exported, even if a few labels overlap.
    const supplierOrderDetails = name === '정산상세내역' && source.SheetNames.includes('정산일반') && source.SheetNames.includes('일별 상품요약')
    if (!supplierOrderDetails && /내부|정산|수수료|마진|원가|배분|요약|합계|summary|internal/i.test(name)) continue
    const sourceIndex = source.SheetNames.indexOf(name)
    if (source.Workbook?.Sheets?.[sourceIndex]?.Hidden) continue
    const rows = XLSX.utils.sheet_to_json<unknown[]>(source.Sheets[name], { header: 1, defval: '', raw: true })
    const headerIndex = rows.findIndex(row => row.filter(isSellerOrderColumn).length >= 3 && row.some(value => /^(상품명|판매사상품명|주문번호)$/.test(normalize(value))))
    if (headerIndex < 0) continue
    const headers = rows[headerIndex]
    const columns = headers.flatMap((header, index) => isSellerOrderColumn(header) && !(supplierOrderDetails && /가격|금액|단가|판매가/.test(String(header))) ? [index] : [])
    const safeRows = [columns.map(index => String(headers[index])), ...rows.slice(headerIndex + 1)
      .filter(row => row.some(value => value !== '') && !row.some(value => typeof value === 'string' && internal.test(value)))
      .map(row => columns.map(index => row[index] ?? ''))]
    const sheet = XLSX.utils.aoa_to_sheet(safeRows, { dateNF: 'yyyy-mm-dd hh:mm:ss' })
    sheet['!cols'] = columns.map(() => ({ wch: 22 }))
    XLSX.utils.book_append_sheet(output, sheet, `구매내역${output.SheetNames.length + 1}`)
  }
  if (!output.SheetNames.length) throw new Error('원본에서 안전하게 공유할 주문 컬럼을 찾지 못했습니다. 원본을 그대로 공유하지 않습니다. 주문번호·상품명이 있는 주문내역 양식을 확인해주세요.')
  return new Uint8Array(XLSX.write(output, { type: 'array', bookType: 'xlsx' }))
}

export function aggregatedSellerWorkbook(rows: SalesDataRow[]): Uint8Array {
  const book = XLSX.utils.book_new()
  const sheet = XLSX.utils.aoa_to_sheet([['상품명','옵션','판매수량','판매가','판매금액','취소수량','환불수량','순판매수량','순매출'], ...rows.map(row => [row.productName ?? '', row.optionName, row.quantity, row.unitPrice, row.grossSales, row.canceledQuantity, row.refundedQuantity, row.netQuantity, row.netSales])])
  XLSX.utils.book_append_sheet(book, sheet, '판매집계_주문원본없음')
  return new Uint8Array(XLSX.write(book, { type: 'array', bookType: 'xlsx' }))
}
