import type { SupplierPilotRow } from '../../../shared/data/notionSupplierPilot10'

export type SupplierTextParseResult = {
  supplier: SupplierPilotRow
  recognizedFields: string[]
  warnings: string[]
}

export type SupplierDuplicateMatch = {
  supplier: SupplierPilotRow
  kind: 'exact' | 'similar'
  score: number
  reasons: string[]
}

const fieldAliases: Array<{ key: keyof SupplierPilotRow; labels: string[] }> = [
  { key: 'companyName', labels: ['거래처명', '공급처명', '업체명', '회사명', '법인명', '상호', '거래처', '공급처', '업체'] },
  { key: 'brands', labels: ['관리 브랜드', '브랜드명', '브랜드'] },
  { key: 'businessNumber', labels: ['사업자등록번호', '사업자 번호', '사업자번호'] },
  { key: 'taxEmail', labels: ['세금계산서 이메일', '세금계산서 메일', '세금 발행 메일', '세금발행메일', '세금 이메일'] },
  { key: 'mainEmail', labels: ['대표 업무메일', '대표 이메일', '대표메일', '업무메일', '이메일', '메일'] },
  { key: 'mainContact', labels: ['대표 담당자', '거래처 담당자', '업체 담당자', '담당자 또는 연락처', '담당자', '연락처'] },
  { key: 'address', labels: ['사업장 주소', '회사 주소', '주소'] },
  { key: 'bankName', labels: ['입금 은행', '은행명', '은행'] },
  { key: 'bankAccount', labels: ['입금 계좌', '계좌번호', '계좌'] },
  { key: 'accountHolder', labels: ['예금주명', '예금주'] },
  { key: 'businessHours', labels: ['업무 가능 시간', '업무시간'] },
  { key: 'linkProvision', labels: ['판매 링크', '링크 제공 여부', '링크 제공'] },
  { key: 'orderContact', labels: ['발주 담당자 연락처/메일', '발주 담당 연락처/메일', '발주 담당자', '발주 담당 연락처', '발주 연락처', '발주 담당'] },
  { key: 'csContact', labels: ['CS 담당자 연락처/메일', 'CS 담당 연락처/메일', 'CS 담당자', 'CS 담당 연락처', 'CS 연락처', 'CS 담당'] },
  { key: 'settlementContact', labels: ['정산 담당자 연락처/메일', '정산 담당 연락처/메일', '정산 담당자', '정산 담당 연락처', '정산 연락처', '정산 담당'] },
  { key: 'orderMethod', labels: ['발주 방식', '발주방법', '발주 방법'] },
  { key: 'orderDeadline', labels: ['발주 마감 시간', '발주 마감', '발주마감'] },
  { key: 'sampleSupport', labels: ['샘플 지원 여부', '샘플 지원', '샘플'] },
  { key: 'salesHurdle', labels: ['최소 매출', '매출 허들', '판매 허들'] },
  { key: 'memo', labels: ['기타 메모', '특이사항', '비고', '메모'] },
]

const labelLookup = fieldAliases
  .flatMap(({ key, labels }) => labels.map((label) => ({ key, label })))
  .sort((a, b) => b.label.length - a.label.length)

const bankAliases: Record<string, string> = {
  신한: '신한은행', 신한은행: '신한은행', 국민: 'KB국민은행', 국민은행: 'KB국민은행', KB국민: 'KB국민은행',
  기업: 'IBK기업은행', 기업은행: 'IBK기업은행', IBK기업: 'IBK기업은행', 우리: '우리은행', 우리은행: '우리은행',
  하나: '하나은행', 하나은행: '하나은행', 농협: 'NH농협은행', 농협은행: 'NH농협은행', NH농협: 'NH농협은행',
  부산: '부산은행', 부산은행: '부산은행', 카카오뱅크: '카카오뱅크', 토스뱅크: '토스뱅크', 케이뱅크: '케이뱅크',
}

function normalizeLabel(value: string) {
  return value.toLowerCase().replace(/[^0-9a-z가-힣]/g, '')
}

const normalizedLabelLookup = labelLookup.map((item) => ({ ...item, normalized: normalizeLabel(item.label) }))

function normalizePastedText(value: string) {
  return value
    .replace(/\\([@~])/g, '$1')
    .replace(/\[([^\]]+)]\((https?:\/\/[^)]+)\)/g, '$2')
}

function cleanValue(value: string) {
  return value.replace(/^\s*[:：=-]\s*/, '').trim()
}

function applyCompositeBankAccount(draft: SupplierPilotRow, value: string, recognizedFields: Set<string>) {
  const account = value.match(/\d{2,6}(?:-\d{2,6}){1,5}/)?.[0]
  const bankToken = value.split(/\s+/).find((token) => bankAliases[token.replace(/[()]/g, '')])
  const bankName = bankToken ? bankAliases[bankToken.replace(/[()]/g, '')] : undefined
  if (account) { draft.bankAccount = account; recognizedFields.add('bankAccount') }
  else draft.bankAccount = value
  if (bankName) { draft.bankName = bankName; recognizedFields.add('bankName') }
  const accountHolder = value.replace(bankToken ?? '', '').replace(account ?? '', '').trim()
  if (accountHolder) { draft.accountHolder = accountHolder; recognizedFields.add('accountHolder') }
}

function splitBrands(value: string) {
  return [...new Set(value.split(/[,/·|\n]|\s{2,}/).map((item) => item.trim()).filter(Boolean))]
}

function normalizeBusinessNumber(value?: string) {
  return String(value ?? '').replace(/\D/g, '')
}

export function normalizeSupplierName(value?: string) {
  return String(value ?? '')
    .toLowerCase()
    .replace(/주식회사|유한회사|㈜|\(주\)|법인/g, '')
    .replace(/[^0-9a-z가-힣]/g, '')
}

function bigrams(value: string) {
  if (value.length < 2) return value ? [value] : []
  return Array.from({ length: value.length - 1 }, (_, index) => value.slice(index, index + 2))
}

export function supplierNameSimilarity(left?: string, right?: string) {
  const a = normalizeSupplierName(left)
  const b = normalizeSupplierName(right)
  if (!a || !b) return 0
  if (a === b) return 1
  const rightPairs = bigrams(b)
  const remaining = [...rightPairs]
  let overlap = 0
  bigrams(a).forEach((pair) => {
    const index = remaining.indexOf(pair)
    if (index >= 0) { overlap += 1; remaining.splice(index, 1) }
  })
  return (2 * overlap) / (bigrams(a).length + rightPairs.length)
}

export function parseSupplierText(rawText: string): SupplierTextParseResult {
  const originalSourceText = rawText.trim()
  const sourceText = normalizePastedText(originalSourceText)
  const draft: SupplierPilotRow = {
    id: `text-${crypto.randomUUID()}`,
    companyName: '',
    linkedProductCount: 0,
    source: 'text',
    businessRegistrationDocumentStatus: 'missing',
    registrationSourceText: originalSourceText,
  }
  const recognizedFields = new Set<string>()
  const unmatched: string[] = []

  sourceText.split(/\r?\n/).map((line) => line.trim()).filter((line) => Boolean(line) && !/^-+$/.test(line)).forEach((line) => {
    const separated = line.match(/^(.+?)\s*[:：=]\s*(.*)$/)
    const normalizedFound = separated ? normalizedLabelLookup.find((item) => item.normalized === normalizeLabel(separated[1])) : undefined
    const found = normalizedFound ?? labelLookup.find(({ label }) => new RegExp(`^${label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*(?:[:：=]|-|\\s)`).test(line))
    if (!found) { unmatched.push(line); return }
    const labelPattern = new RegExp(`^${found.label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`)
    const value = cleanValue(normalizedFound && separated ? separated[2] : line.replace(labelPattern, ''))
    if (!value) return
    if (found.key === 'brands') draft.brands = splitBrands(value)
    else if (found.key === 'businessNumber') draft.businessNumber = value.replace(/[^0-9-]/g, '')
    else if (found.key === 'bankAccount') applyCompositeBankAccount(draft, value, recognizedFields)
    else draft[found.key] = value as never
    recognizedFields.add(String(found.key))
  })

  if (!draft.companyName) {
    const inferred = sourceText.split(/\r?\n/).map((line) => line.trim()).find((line) => /(?:거래처|공급처)\s*(?:정보|자료|등록)?$/.test(line))
    if (inferred) {
      draft.companyName = inferred.replace(/(?:은|는)?\s*(?:거래처|공급처)\s*(?:정보|자료|등록)?$/, '').trim()
      if (draft.companyName) recognizedFields.add('companyName')
    }
  }

  if (!draft.mainEmail && !draft.taxEmail) {
    const email = sourceText.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0]
    if (email) { draft.mainEmail = email; recognizedFields.add('mainEmail') }
  }

  if (unmatched.length) draft.memo = [draft.memo, ...unmatched].filter(Boolean).join('\n')
  const warnings: string[] = []
  if (!draft.companyName) warnings.push('거래처명을 찾지 못했습니다. 미리보기에서 입력해주세요.')
  if (!draft.businessNumber) warnings.push('사업자등록번호가 없습니다. 등록 후 나중에 보완할 수 있습니다.')
  if (!draft.bankAccount) warnings.push('계좌정보가 없습니다. 지급 전 반드시 별도 확인이 필요합니다.')
  if (!draft.brands?.length) warnings.push('연결할 브랜드가 없습니다. 공급처만 먼저 등록할 수 있습니다.')

  return { supplier: draft, recognizedFields: [...recognizedFields], warnings }
}

export function findSupplierDuplicates(candidate: SupplierPilotRow, suppliers: SupplierPilotRow[]) {
  const candidateNumber = normalizeBusinessNumber(candidate.businessNumber)
  return suppliers.map((supplier): SupplierDuplicateMatch | null => {
    const score = supplierNameSimilarity(candidate.companyName, supplier.companyName)
    const numberMatches = Boolean(candidateNumber && candidateNumber === normalizeBusinessNumber(supplier.businessNumber))
    const nameMatches = Boolean(normalizeSupplierName(candidate.companyName) && normalizeSupplierName(candidate.companyName) === normalizeSupplierName(supplier.companyName))
    const reasons = [numberMatches ? '사업자등록번호 일치' : '', nameMatches ? '정규화한 거래처명 일치' : '', !nameMatches && score >= 0.55 ? `거래처명 ${Math.round(score * 100)}% 유사` : ''].filter(Boolean)
    if (!reasons.length) return null
    return { supplier, kind: numberMatches || nameMatches ? 'exact' : 'similar', score: numberMatches ? 1 : score, reasons }
  }).filter((item): item is SupplierDuplicateMatch => Boolean(item)).sort((a, b) => (a.kind === b.kind ? b.score - a.score : a.kind === 'exact' ? -1 : 1))
}

export function mergeSupplier(existing: SupplierPilotRow, incoming: SupplierPilotRow): SupplierPilotRow {
  const merged = { ...existing }
  Object.entries(incoming).forEach(([key, value]) => {
    if (key === 'id' || key === 'linkedProductCount' || key === 'brands') return
    if (value !== undefined && value !== '') Object.assign(merged, { [key]: value })
  })
  merged.brands = [...new Set([...(existing.brands ?? []), ...(incoming.brands ?? [])])]
  merged.source = incoming.source ?? existing.source
  return merged
}

export function mergeSupplierBackup(current: SupplierPilotRow[], incoming: SupplierPilotRow[]) {
  const rows = [...current]
  let added = 0
  let merged = 0
  for (const supplier of incoming) {
    if (!supplier?.id || !supplier.companyName?.trim()) continue
    const sameId = rows.find((item) => item.id === supplier.id)
    const exact = sameId ?? findSupplierDuplicates(supplier, rows).find((item) => item.kind === 'exact')?.supplier
    if (!exact) {
      rows.push(supplier)
      added += 1
      continue
    }
    const protectedIncoming = { ...supplier }
    Object.entries(exact).forEach(([key, value]) => {
      if (key === 'brands') return
      if (value !== undefined && value !== '') Object.assign(protectedIncoming, { [key]: undefined })
    })
    const combined = mergeSupplier(exact, protectedIncoming)
    combined.linkedProductCount = Math.max(exact.linkedProductCount ?? 0, supplier.linkedProductCount ?? 0)
    rows[rows.findIndex((item) => item.id === exact.id)] = combined
    merged += 1
  }
  return { rows, added, merged, imported: incoming.length }
}
