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
  '판매 채널'?: string
  '카테고리': string; '상품명': string; '구성명': string; '정상가': number; '공구판매가': number
  '총 매입가(VAT포함)': number; '셀러 수수료율': number; '가격 적용 방식': '고정가' | '수량 구간'; '최소 수량': number; '최대 수량': number; '상태': string
}
export type WiseProposalMetadata = {
  shippingFeeKnown?: boolean
  brandName: string; vendorName: string; productUrl: string; shippingFee: number; freeShippingThreshold?: number
  courierName: string; sampleSupportType: string; draft: boolean
  returnShippingFee?: number; exchangeShippingFee?: number; jejuExtraFee?: number; islandExtraFee?: number
  bundleShippingAvailable?: boolean; orderDeadlineTime?: string; stockInfo?: string; manufactureInfo?: string; shelfLifeInfo?: string
  linkProvided?: boolean
  businessRegistrationNumber?: string; vendorAddress?: string; vendorAccount?: string; taxInvoiceEmail?: string
  orderContact?: string; orderEmail?: string; csContact?: string; csEmail?: string
  settlementContact?: string; settlementEmail?: string; mainBusinessEmail?: string; businessHours?: string; salesHurdle?: string
}

export function inferProposalProductName(rows: WiseProposalRow[], fileName = '', brandName = '') {
  const names = [...new Set(rows.map((row) => row['상품명'].trim()).filter(Boolean))]
  if (names.length <= 1) return names[0] ?? '상품명 확인 필요'
  let prefix = names[0]
  for (const name of names.slice(1)) {
    let index = 0
    while (index < prefix.length && index < name.length && prefix[index] === name[index]) index += 1
    prefix = prefix.slice(0, index)
  }
  const commonName = prefix.replace(/[\s()[\]{}\-_/·,:]+$/g, '').trim()
  if (commonName.length >= 2) return commonName
  const fileProductName = fileName
    .replace(/\.(xlsx?|xls)$/i, '')
    .split('_')
    .map((part) => part.trim())
    .filter((part) => part && !/^■?와이즈\s*제안서$/i.test(part) && !/^(생활|식품|가전|뷰티|유아|패션)$/.test(part) && !/^\(?\d{8}\)?$/.test(part))
    .join(' ')
    .replace(/\s*[-–—]\s*/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  const withoutBrand = brandName && normalize(fileProductName).startsWith(normalize(brandName))
    ? fileProductName.replace(new RegExp(`^${brandName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}` + '\\s*', 'i'), '').trim()
    : fileProductName
  if (withoutBrand.length >= 2) return withoutBrand
  return names[0].replace(/\s*(?:\([^)]*\)|[-–—]\s*[^-–—]+)\s*$/g, '').trim() || names[0]
}

export function proposalSkuName(row: Pick<WiseProposalRow, '상품명'>) {
  return row['상품명']
    .replace(/\s*\n\s*/g, ' ')
    .replace(/\s*[-–—]\s*/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
}
function findLabelValues(rows: Cell[][], label: string | string[]) {
  const targets = (Array.isArray(label) ? label : [label]).map(normalize)
  const values: string[] = []
  rows.slice(0, 120).forEach((row) => row.forEach((cell, index) => {
    if (!targets.includes(normalize(cell))) return
    const next = row.slice(index + 1, index + 7).find((candidate) => String(candidate ?? '').trim())
    if (next !== undefined) values.push(String(next).trim())
  }))
  return values
}
const firstLabel = (rows: Cell[][], labels: string[]) => findLabelValues(rows, labels)[0] ?? ''
const optionalMoney = (value: string) => value.trim() ? cleanMoney(value) : undefined
const yesNo = (value: string) => value ? !/불가|아니오|미지원|x|없음/i.test(value) : undefined
function metadataFromWorkbook(file: File, rows: Cell[][]): WiseProposalMetadata {
  const parts = file.name.replace(/^수정중/, '').replace(/\.(xlsx?|xls)$/i, '').split('_').map((part) => part.trim()).filter(Boolean)
  const brand = rows.slice(0, 5).flat().map((cell) => String(cell ?? '').trim()).find((value) => value && !value.startsWith('#') && !['외부공유금지', '셀러용'].includes(value))
  const vendorCandidates = findLabelValues(rows, '거래처명').filter((value) => !value.includes('솔루션파트너스'))
  const shippingText = firstLabel(rows, ['기본 택배비', '기본배송비', '택배비', '배송비'])
  const freeShippingText = firstLabel(rows, ['무료배송 기준', '무료배송조건', '무료 배송 기준'])
  const fallback = parts[2] ?? parts[1] ?? '브랜드 확인 필요'
  const fileBrand = /와이즈\s*제안서/i.test(parts[0] ?? '') && parts[2] ? parts[2] : ''
  const threshold = cleanMoney(freeShippingText)
  return {
    brandName: fileBrand || brand || fallback, vendorName: vendorCandidates.at(-1) || fallback,
    productUrl: findLabelValues(rows, ['URL', '상품 URL', '상품링크', '링크']).find((value) => /^https?:\/\//i.test(value)) ?? '',
    shippingFeeKnown: /무료|^\s*0\s*(원)?\s*$/.test(shippingText) || (cleanMoney(shippingText) > 0 && !/착불|협의|별도/.test(shippingText)),
    shippingFee: cleanMoney(shippingText), freeShippingThreshold: threshold > 0 ? threshold : undefined,
    courierName: firstLabel(rows, ['택배사', '배송 택배사']),
    sampleSupportType: firstLabel(rows, ['샘플지원 여부', '샘플 지원여부', '샘플 지원']) || '협의 필요',
    returnShippingFee: optionalMoney(firstLabel(rows, ['반품 택배비', '반품배송비', '반품비'])),
    exchangeShippingFee: optionalMoney(firstLabel(rows, ['교환 택배비', '교환배송비', '교환비'])),
    jejuExtraFee: optionalMoney(firstLabel(rows, ['제주 추가비', '제주배송 추가비', '제주 배송비'])),
    islandExtraFee: optionalMoney(firstLabel(rows, ['도서산간 추가비', '도서산간배송비', '도서산간 배송비'])),
    bundleShippingAvailable: yesNo(firstLabel(rows, ['합배송 여부', '합배송'])),
    orderDeadlineTime: firstLabel(rows, ['발주 마감시간', '발주마감시간', '발주 마감']),
    stockInfo: firstLabel(rows, ['재고', '재고 현황', '재고수량']),
    manufactureInfo: firstLabel(rows, ['제조일자', '제조일', '제조 정보']),
    shelfLifeInfo: firstLabel(rows, ['유통기한', '소비기한']),
    linkProvided: yesNo(firstLabel(rows, ['링크 제공 여부', '링크제공여부', '링크 제공'])),
    businessRegistrationNumber: firstLabel(rows, ['사업자등록번호', '사업자 번호', '사업자번호']),
    vendorAddress: firstLabel(rows, ['사업장 주소', '주소', '거래처 주소']),
    vendorAccount: firstLabel(rows, ['계좌', '정산계좌', '입금 계좌']),
    taxInvoiceEmail: firstLabel(rows, ['세금계산서 발행 메일', '세금계산서 메일', '계산서 메일']),
    orderContact: firstLabel(rows, ['발주 담당자 연락처', '발주담당 연락처']),
    orderEmail: firstLabel(rows, ['발주 담당자 메일', '발주메일', '발주 이메일']),
    csContact: firstLabel(rows, ['CS 담당자 연락처', 'CS담당 연락처', '고객센터 연락처']),
    csEmail: firstLabel(rows, ['CS 담당자 메일', 'CS메일', 'CS 이메일']),
    settlementContact: firstLabel(rows, ['정산 담당자 연락처', '정산담당 연락처']),
    settlementEmail: firstLabel(rows, ['정산 담당자 메일', '정산메일', '정산 이메일']),
    mainBusinessEmail: firstLabel(rows, ['대표 업무메일', '대표 이메일', '업무메일']),
    businessHours: firstLabel(rows, ['업무시간', '운영시간']),
    salesHurdle: firstLabel(rows, ['매출 허들', '매출허들', '최소 매출']),
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
        // Bare commission is seller commission only in an explicitly seller-facing sheet.
        // Never match it by substring: that would also consume total/vendor commission.
        const normalizedCell = normalize(cell)
        const sellerSheetCommission = sheetName.includes('셀러용') && normalizedCell.startsWith('수수료') && !/총|벤더/.test(normalizedCell)
        const key = sellerSheetCommission ? 'sellerCommissionRate' : matchHeader(cell)
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
  if (selected.columns.sellerCommissionRate === undefined) throw new Error('셀러 수수료 열을 확인할 수 없습니다. 셀러용 제안서의 셀러 수수료율을 지정해주세요. 총·벤더 수수료는 대신 사용하지 않습니다.')
  const output: WiseProposalRow[] = []
  let category = ''
  let productName = ''
  const channelLabel = (row: Cell[]) => row.map((cell) => String(cell ?? '').trim()).find((text) => text.startsWith('#') && /기준/.test(text) && /스마트스토어|홈쇼핑|백화점/.test(text))?.replace(/^#\s*/, '')
  let channel = selected.rows.slice(0, selected.headerRow).map(channelLabel).filter(Boolean).at(-1)
  for (const row of selected.rows.slice(selected.headerRow + 1)) {
    channel = channelLabel(row) ?? channel
    const nextCategory = selected.columns.category === undefined ? '' : String(row[selected.columns.category] ?? '').trim()
    const nextProductName = String(row[selected.columns.productName!] ?? '').trim()
    if (nextCategory && !nextCategory.startsWith('#')) category = nextCategory
    if (nextProductName && !nextProductName.startsWith('#')) productName = nextProductName.replace(/\s*\n\s*/g, ' ')
    const optionValue = selected.columns.optionName === undefined ? nextProductName : String(row[selected.columns.optionName] ?? '').trim()
    const optionName = optionValue.replace(/\s*\n\s*/g, ' ')
    const groupBuyPrice = cleanNumber(row[selected.columns.groupBuyPrice!])
    if (!productName || !optionName || groupBuyPrice <= 0) continue
    const rateCell = row[selected.columns.sellerCommissionRate]
    if (rateCell === null || rateCell === undefined || String(rateCell).trim() === '' || !/^\s*\d+(\.\d+)?\s*%?\s*$/.test(String(rateCell)) || cleanRate(rateCell) > 100) throw new Error(`${productName} / ${optionName}: 셀러 수수료가 비어 있거나 올바르지 않습니다. 확인 후 입력해주세요.`)
    const sellerCommissionRate = cleanRate(rateCell)
    const statedPurchasePrice = cleanNumber(row[selected.columns.purchasePrice!])
    const purchasePrice = statedPurchasePrice
    if (purchasePrice <= 0) throw new Error(`${productName} / ${optionName}: 공급가가 없거나 올바르지 않습니다. 확인 후 입력해주세요.`)
    if (purchasePrice <= 0) continue
    const quantityTier = optionName.match(/(\d+)\s*개\s*이상/)
    output.push({
      '판매 채널': channel,
      '카테고리': category || '식품', '상품명': productName, '구성명': optionName,
      '정상가': selected.columns.regularPrice === undefined ? 0 : cleanNumber(row[selected.columns.regularPrice]),
      '공구판매가': groupBuyPrice, '총 매입가(VAT포함)': purchasePrice,
      '셀러 수수료율': sellerCommissionRate,
      '가격 적용 방식': quantityTier ? '수량 구간' : '고정가', '최소 수량': quantityTier ? Number(quantityTier[1]) : 0, '최대 수량': 0,
      '상태': '판매 가능',
    })
  }
  if (!output.length) throw new Error('가격이 입력된 상품 행을 찾지 못했습니다.')
  if (new Set(output.map((row) => row['판매 채널']).filter(Boolean)).size > 1) {
    output.forEach((row) => { if (row['판매 채널']) row['구성명'] += ` [${row['판매 채널']}]` })
  }
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
