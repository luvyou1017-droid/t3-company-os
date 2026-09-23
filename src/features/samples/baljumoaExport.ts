import * as XLSX from 'xlsx/xlsx.mjs'
import type { SampleOrder } from './sampleOrderModel'

export const BALJUMOA_COLUMNS = ['주문번호','주문일','주문상품고유번호','주문자명','주문자연락처','수령인명','수령인연락처','우편번호','주소','상품코드','판매사상품명','판매사옵션명','주문수량','결제금액','배송비타입','배송비','추가배송비','배송비합계','배송시 요청사항','추가구성상품','사은품','사은품수량','택배사**','배송번호','묶음설정','패키지명','관리자메모','판매사']
const escape = (value: string) => value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;')

export function baljumoaValues(order: SampleOrder): Record<string, string | number> {
  const day = new Date(order.requestedAt).toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' })
  return { A: order.id, B: (Date.parse(`${day}T00:00:00Z`) - Date.UTC(1899,11,30)) / 86400000,
    D: order.ordererName || order.recipient, E: order.ordererPhone || order.phone,
    F: order.recipient, G: order.phone, I: order.address, K: order.productName,
    L: [order.optionName, order.detailOption].filter(Boolean).join(' / '), M: order.quantity }
}

// Preserve every template ZIP member and all column styles. Only replace data rows.
// Inline string cells prevent formulas and preserve leading-zero phone numbers.
export function buildBaljumoaWorkbook(template: Uint8Array, orders: SampleOrder[]): Uint8Array {
  if (!orders.length || orders.some(order => order.status === '취소')) throw new Error('발주 가능한 샘플을 선택해주세요.')
  const book = XLSX.read(template, { type: 'array' })
  const headers = XLSX.utils.sheet_to_json<string[]>(book.Sheets.Supply, { header: 1 })[0]
  if (JSON.stringify(headers) !== JSON.stringify(BALJUMOA_COLUMNS)) throw new Error('발주모아 원본 양식이 변경되었습니다. 컬럼을 확인해주세요.')
  const CFB = XLSX.CFB
  if (!CFB) throw new Error('Excel 압축 모듈을 불러오지 못했습니다.')
  const zip = CFB.read(template, { type: 'array' })
  const sheetPath = (zip.FullPaths as string[]).find(path => path.endsWith('/xl/worksheets/sheet1.xml'))
  const sheet = sheetPath ? CFB.find(zip, sheetPath) : undefined
  if (!sheet) throw new Error('Supply 시트를 찾을 수 없습니다.')
  const xml = new TextDecoder().decode(sheet.content)
  const header = xml.match(/<row\b[^>]*r="1"[^>]*>[\s\S]*?<\/row>/)?.[0]
  const templateRow = xml.match(/<row\b[^>]*r="2"[^>]*>[\s\S]*?<\/row>/)?.[0]
  if (!header || !templateRow) throw new Error('원본 양식 행을 확인해주세요.')
  const styles = new Map([...templateRow.matchAll(/<c\b[^>]*r="([A-Z]+)2"[^>]*s="(\d+)"/g)].map(match => [match[1], match[2]]))
  const rows = orders.map((order, index) => {
    const row = index + 2
    const values = baljumoaValues(order)
    const cells = BALJUMOA_COLUMNS.map((_, col) => {
      const name = XLSX.utils.encode_col(col)
      const style = styles.get(name) ?? '2'
      const value = values[name]
      if (value === undefined) return `<c r="${name}${row}" s="${style}"/>`
      return typeof value === 'number' ? `<c r="${name}${row}" s="${style}"><v>${value}</v></c>`
        : `<c r="${name}${row}" s="${style}" t="inlineStr"><is><t xml:space="preserve">${escape(value)}</t></is></c>`
    }).join('')
    return `<row r="${row}" spans="1:28">${cells}</row>`
  }).join('')
  const next = xml.replace(/<sheetData>[\s\S]*?<\/sheetData>/, `<sheetData>${header}${rows}</sheetData>`)
    .replace(/<dimension ref="[^"]*"\/>/, `<dimension ref="A1:AB${orders.length + 1}"/>`)
  CFB.utils.cfb_add(zip, sheetPath!, new TextEncoder().encode(next))
  return new Uint8Array(CFB.write(zip, { type: 'array', fileType: 'zip' }))
}

export async function downloadBaljumoa(orders: SampleOrder[], batchId: string) {
  const response = await fetch('/templates/baljumoa-manual.xlsx')
  if (!response.ok) throw new Error('발주모아 양식을 불러오지 못했습니다. 같은 발주파일을 다시 다운로드해주세요.')
  const bytes = buildBaljumoaWorkbook(new Uint8Array(await response.arrayBuffer()), orders)
  const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }))
  const link = document.createElement('a'); link.href = url; link.download = `발주모아_${batchId}.xlsx`; link.click()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}
