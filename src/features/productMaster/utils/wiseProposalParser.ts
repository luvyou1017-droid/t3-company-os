import * as XLSX from 'xlsx'

type Cell = string | number | boolean | Date | null | undefined
type ProposalColumn = 'category' | 'productName' | 'optionName' | 'regularPrice' | 'groupBuyPrice' | 'purchasePrice' | 'sellerCommissionRate'

const aliases: Record<ProposalColumn, string[]> = {
  category: ['카테고리'], productName: ['상품명', '제품명', '품목'], optionName: ['구성', '구성명', '옵션명'],
  regularPrice: ['정상판매가', '정상가', '온라인최저가'], groupBuyPrice: ['공구판매가', '공동구매판매가', '공동구매가격', '공구가'],
  purchasePrice: ['총매입가', '총매입가vat포함', '벤더사공급가', '공급가'], sellerCommissionRate: ['셀러수수료율', '셀러수수료', '수수료vat포함'],
}
const normalize = (value: Cell) => String(value ?? '').trim().toLowerCase().replace(/[\s_()\-/.]/g, '')
const cleanNumber = (value: Cell) => {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  const parsed = Number(String(value ?? '').replace(/[^0-9.-]/g, ''))
  return Number.isFinite(parsed) ? parsed : 0
}
const cleanMoney = (value: Cell) => {
  const text = String(value ?? '')
  const amount = cleanNumber(value)
  if (/\d+(?:\.\d+)?\s*만원/.test(text)) return amount * 10000
  if (/\d+(?:\.\d+)?\s*천원/.test(text)) return amount * 1000
  return amount
}
const cleanRate = (value: Cell) => { const rate = cleanNumber(value); return rate > 0 && rate < 1 ? rate * 100 : rate }
function matchHeader(value: Cell) {
  const cell = normalize(value)
  return (Object.keys(aliases) as ProposalColumn[]).find((key) => aliases[key].some((alias) => {
    const target = normalize(alias)
    return cell === target || cell.includes(target)
  }))
}
export type WiseProposalRow = {
  '카테고리': string; '상품명': string; '구성명': string; '정상가': number; '공구판매가': number
  '총 매입가(VAT포함)': number; '셀러 수수료율': number; '가격 적용 방식': '고정가' | '수량 구간'; '최소 수량': number; '최대 수량': number; '상태': string
}
export type WiseProposalMetadata = {
  brandName: string; vendorName: string; productUrl: string; shippingFee: number; freeShippingThreshold?: number
  courierName: string; sampleSupportType: string; draft: boolean
}
function findLabelValues(rows: Cell[][], label: string) {
  const target = normalize(label)
  const values: string[] = []
  rows.slice(0, 40).forEach((row) => row.forEach((cell, index) => {
    if (normalize(cell) !== target) return
    const next = row.slice(index + 1, index + 7).find((candidate) => String(candidate ?? '').trim())
    if (next !== undefined) values.push(String(next).trim())
  }))
  return values
}
function metadataFromWorkbook(file: File, rows: Cell[][]): WiseProposalMetadata {
  const parts = file.name.replace(/^수정중/, '').replace(/\.(xlsx?|xls)$/i, '').split('_').map((part) => part.trim()).filter(Boolean)
  const brand = rows.slice(0, 5).flat().map((cell) => String(cell ?? '').trim()).find((value) => value && !value.startsWith('#') && !['외부공유금지', '셀러용'].includes(value))
  const vendorCandidates = findLabelValues(rows, '거래처명').filter((value) => !value.includes('솔루션파트너스'))
  const shippingText = findLabelValues(rows, '기본 택배비')[0] ?? ''
  const freeShippingText = findLabelValues(rows, '무료배송 기준')[0] ?? ''
  const fallback = parts[2] ?? parts[1] ?? '브랜드 확인 필요'
  const threshold = cleanMoney(freeShippingText)
  return {
    brandName: brand || fallback, vendorName: vendorCandidates.at(-1) || fallback,
    productUrl: findLabelValues(rows, 'URL').find((value) => /^https?:\/\//i.test(value)) ?? '',
    shippingFee: cleanMoney(shippingText), freeShippingThreshold: threshold > 0 ? threshold : undefined,
    courierName: findLabelValues(rows, '택배사')[0] ?? '',
    sampleSupportType: findLabelValues(rows, '샘플지원 여부')[0] ?? findLabelValues(rows, '샘플 지원여부')[0] ?? '협의 필요',
    draft: file.name.trim().startsWith('수정중'),
  }
}
export async function parseWiseProposalFile(file: File): Promise<{ rows: WiseProposalRow[]; sheetName: string; headerRow: number; metadata: WiseProposalMetadata }> {
  const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array', cellDates: true })
  let selected: { sheetName: string; rows: Cell[][]; headerRow: number; columns: Partial<Record<ProposalColumn, number>>; score: number } | undefined
  let metadataRows: Cell[][] = []
  for (const sheetName of workbook.SheetNames) {
    const rows = XLSX.utils.sheet_to_json<Cell[]>(workbook.Sheets[sheetName], { header: 1, defval: null, raw: true })
    if (!metadataRows.length || sheetName.includes('셀러용')) metadataRows = rows.slice(0, 100)
    rows.slice(0, 100).forEach((row, headerRow) => {
      const columns: Partial<Record<ProposalColumn, number>> = {}
      row.forEach((cell, index) => {
        const key = matchHeader(cell)
        if (!key) return
        const shouldPrefer = key === 'purchasePrice' && normalize(cell).includes('총매입가')
        if (columns[key] === undefined || shouldPrefer) columns[key] = index
      })
      const required = columns.productName !== undefined && columns.groupBuyPrice !== undefined && columns.purchasePrice !== undefined
      const score = Object.keys(columns).length + (sheetName.includes('셀러용') ? 3 : 0)
      if (required && (!selected || score > selected.score)) selected = { sheetName, rows, headerRow, columns, score }
    })
  }
  if (!selected) throw new Error('제안서에서 상품명·공구판매가·총 매입가 열을 찾지 못했습니다.')
  const output: WiseProposalRow[] = []
  let category = ''
  let productName = ''
  for (const row of selected.rows.slice(selected.headerRow + 1)) {
    const nextCategory = selected.columns.category === undefined ? '' : String(row[selected.columns.category] ?? '').trim()
    const nextProductName = String(row[selected.columns.productName!] ?? '').trim()
    if (nextCategory && !nextCategory.startsWith('#')) category = nextCategory
    if (nextProductName && !nextProductName.startsWith('#')) productName = nextProductName.replace(/\s*\n\s*/g, ' ')
    const optionValue = selected.columns.optionName === undefined ? nextProductName : String(row[selected.columns.optionName] ?? '').trim()
    const optionName = optionValue.replace(/\s*\n\s*/g, ' ')
    const groupBuyPrice = cleanNumber(row[selected.columns.groupBuyPrice!])
    const purchasePrice = cleanNumber(row[selected.columns.purchasePrice!])
    if (!productName || !optionName || groupBuyPrice <= 0 || purchasePrice <= 0) continue
    const quantityTier = optionName.match(/(\d+)\s*개\s*이상/)
    output.push({
      '카테고리': category || '식품', '상품명': productName, '구성명': optionName,
      '정상가': selected.columns.regularPrice === undefined ? 0 : cleanNumber(row[selected.columns.regularPrice]),
      '공구판매가': groupBuyPrice, '총 매입가(VAT포함)': purchasePrice,
      '셀러 수수료율': selected.columns.sellerCommissionRate === undefined ? 0 : cleanRate(row[selected.columns.sellerCommissionRate]),
      '가격 적용 방식': quantityTier ? '수량 구간' : '고정가', '최소 수량': quantityTier ? Number(quantityTier[1]) : 0, '최대 수량': 0,
      '상태': '판매 가능',
    })
  }
  if (!output.length) throw new Error('가격이 입력된 상품 행을 찾지 못했습니다.')
  const tierGroups = new Map<string, WiseProposalRow[]>()
  for (const row of output.filter((item) => item['가격 적용 방식'] === '수량 구간')) {
    const group = tierGroups.get(row['상품명']) ?? []
    group.push(row)
    tierGroups.set(row['상품명'], group)
  }
  for (const tiers of tierGroups.values()) {
    tiers.sort((left, right) => left['최소 수량'] - right['최소 수량'])
    tiers.forEach((tier, index) => { tier['최대 수량'] = tiers[index + 1] ? tiers[index + 1]['최소 수량'] - 1 : 0 })
  }
  return { rows: output, sheetName: selected.sheetName, headerRow: selected.headerRow + 1, metadata: metadataFromWorkbook(file, metadataRows) }
}
