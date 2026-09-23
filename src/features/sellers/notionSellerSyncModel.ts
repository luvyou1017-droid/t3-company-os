import type { SellerMaster } from '../../shared/services/sellerMasterService'

export type NotionSellerSyncStatus = 'existing' | 'new' | 'changed' | 'needs_review'
export type NotionSellerDecision = 'apply' | 'exclude' | 'connect'

export interface NotionSellerRecord {
  pageId: string
  lastEditedTime: string
  name: string
  instagramId?: string
  managerPageIds?: string[]
  contact?: string
  shippingText?: string
  businessType?: string
  businessNumberOrResidentId?: string
  sensitiveIdentifierOmitted?: boolean
  businessName?: string
  bankAccount?: string
  taxInvoiceEmail?: string
  memo?: string
}

export interface SellerFieldDiff {
  field: string
  label: string
  currentValue: string
  notionValue: string
}

export interface NotionSellerPreview {
  source: NotionSellerRecord
  mapped: Partial<SellerMaster>
  status: NotionSellerSyncStatus
  candidateIds: string[]
  matchedSellerId?: string
  matchReason?: string
  differences: SellerFieldDiff[]
  warnings: string[]
}

const managerPageToUser: Record<string, string> = {
  '192ddc8b-71f1-80aa-ae24-e01cb171edd6': 'u-001',
  'fe68c691-69cb-404c-b0bd-d9387c34ef8c': 'u-004',
  '192ddc8b-71f1-803f-b1bf-c3c7f39393f3': 'u-006',
  '192ddc8b-71f1-805b-9b90-f3aad8c113d2': 'u-007',
  '192ddc8b-71f1-8082-ac0c-c9d75904a418': 'u-008',
}

const fieldLabels: Record<string, string> = {
  name: '셀러명', instagramId: '인스타그램', contact: '연락처', recipientName: '기본 수령인',
  shippingPhone: '배송 연락처', shippingAddress: '기본 배송지', businessName: '상호명',
  businessType: '사업자 유형', bankName: '은행명', accountNumber: '계좌번호', accountHolder: '예금주',
  defaultManagerId: '담당 매니저', businessNumber: '사업자등록번호', taxInvoiceEmail: '세금계산서 이메일',
}

export function normalizeDigits(value?: string) { return (value ?? '').replace(/\D/g, '') }
export function normalizeInstagram(value?: string) { return (value ?? '').trim().replace(/^@/, '').toLowerCase() }
export function normalizeSellerName(value?: string) { return (value ?? '').normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '') }

function similarity(left: string, right: string) {
  if (!left || !right) return 0
  if (left === right) return 1
  const longer = left.length >= right.length ? left : right
  const shorter = left.length >= right.length ? right : left
  if (longer.includes(shorter) && shorter.length >= 3) return shorter.length / longer.length
  const matrix = Array.from({ length: shorter.length + 1 }, (_, row) => [row])
  matrix[0] = Array.from({ length: longer.length + 1 }, (_, column) => column)
  for (let row = 1; row <= shorter.length; row += 1) for (let column = 1; column <= longer.length; column += 1) {
    matrix[row][column] = Math.min(matrix[row - 1][column] + 1, matrix[row][column - 1] + 1, matrix[row - 1][column - 1] + (shorter[row - 1] === longer[column - 1] ? 0 : 1))
  }
  return 1 - matrix[shorter.length][longer.length] / longer.length
}

function parseShipping(text?: string) {
  const source = (text ?? '').replace(/\r/g, '').trim()
  if (!source) return {}
  const recipientName = source.match(/(?:성함|수령인|이름)\s*[:：]?\s*([^\n,]+)/i)?.[1]?.trim()
  const shippingPhone = source.match(/(?:연락처|전화번호|휴대폰)\s*[:：]?\s*([0-9\- ]{9,})/i)?.[1]?.trim()
  const shippingAddress = source.match(/(?:주소|배송지)\s*[:：]?\s*([^\n]+(?:\n(?!\s*(?:연락처|전화번호|휴대폰)\s*[:：]?)[^\n]+)*)/i)?.[1]?.trim()
  return { recipientName, shippingPhone, shippingAddress }
}

function parseBank(text?: string) {
  const source = (text ?? '').replace(/\s+/g, ' ').trim()
  if (!source) return {}
  const number = source.match(/\d[\d\- ]{6,}\d/)?.[0]?.trim()
  const bankName = source.match(/(?:^|\s)([가-힣A-Za-z]*(?:은행|뱅크|금고|농협|수협|신협|우체국|카카오|토스|기업))(?=\s|\d)/)?.[1]
  const accountHolder = number ? source.slice(source.indexOf(number) + number.length).trim() : ''
  return { bankName, accountNumber: number, accountHolder }
}

function mapBusinessType(value?: string) {
  if (!value) return undefined
  if (/간이/.test(value)) return 'simplified_business' as const
  if (/개인|프리랜서/.test(value)) return 'freelancer' as const
  if (/일반|법인|사업자/.test(value)) return 'general_business' as const
  return undefined
}

function primaryBusiness(seller: SellerMaster) { return seller.businesses?.find((item) => item.isPrimary) ?? seller.businesses?.[0] }

function businessNumber(seller: SellerMaster) { return normalizeDigits(primaryBusiness(seller)?.businessNumber) }

export function mapNotionSeller(source: NotionSellerRecord): { mapped: Partial<SellerMaster>; warnings: string[] } {
  const warnings: string[] = []
  if (!source.name.trim()) warnings.push('셀러명이 없어 자동 반영할 수 없습니다.')
  const shipping = parseShipping(source.shippingText)
  const bank = parseBank(source.bankAccount)
  const rawIdentifier = normalizeDigits(source.businessNumberOrResidentId)
  const businessNumberValue = rawIdentifier.length === 10 ? rawIdentifier : undefined
  if (source.sensitiveIdentifierOmitted || (rawIdentifier && !businessNumberValue)) warnings.push('사업자등록번호/주민등록번호 필드는 자동 반영하지 않았습니다.')
  const managerIds = (source.managerPageIds ?? []).map((id) => managerPageToUser[id]).filter(Boolean)
  if ((source.managerPageIds?.length ?? 0) !== managerIds.length || managerIds.length > 1) warnings.push('담당 매니저 연결을 확인해주세요.')
  const businessType = mapBusinessType(source.businessType)
  if (source.businessType && !businessType) warnings.push('사업자 유형을 확인해주세요.')
  if (source.bankAccount && (!bank.accountNumber || !bank.bankName || !bank.accountHolder)) warnings.push('계좌정보 자동 분리를 확인해주세요.')
  const businessId = `notion-business-${source.pageId}`
  const mapped: Partial<SellerMaster> = {
    name: source.name.trim(), instagramId: normalizeInstagram(source.instagramId), contact: source.contact?.trim(),
    ...shipping, businessName: source.businessName?.trim(), businessType, bankName: bank.bankName,
    accountNumber: bank.accountNumber, accountHolder: bank.accountHolder,
    ...(managerIds.length === 1 ? { defaultManagerId: managerIds[0] } : {}),
    notionPageId: source.pageId, notionLastEditedTime: source.lastEditedTime,
    businesses: source.businessName || businessNumberValue || source.taxInvoiceEmail || bank.accountNumber ? [{
      id: businessId, businessName: source.businessName?.trim() ?? '', businessNumber: businessNumberValue,
      businessType: businessType ?? 'general_business', taxInvoiceEmail: source.taxInvoiceEmail?.trim(),
      bankName: bank.bankName, accountNumber: bank.accountNumber, accountHolder: bank.accountHolder,
      isPrimary: true, active: true,
    }] : undefined,
  }
  return { mapped, warnings }
}

function getDifferences(existing: SellerMaster, mapped: Partial<SellerMaster>): SellerFieldDiff[] {
  const currentBusiness = primaryBusiness(existing)
  const notionBusiness = mapped.businesses?.[0]
  const pairs: Array<[string, unknown, unknown]> = [
    ['name', existing.name, mapped.name], ['instagramId', existing.instagramId, mapped.instagramId],
    ['contact', existing.contact, mapped.contact], ['recipientName', existing.recipientName, mapped.recipientName],
    ['shippingPhone', existing.shippingPhone, mapped.shippingPhone], ['shippingAddress', existing.shippingAddress, mapped.shippingAddress],
    ['businessName', currentBusiness?.businessName || existing.businessName, notionBusiness?.businessName || mapped.businessName],
    ['businessType', currentBusiness?.businessType || existing.businessType, notionBusiness?.businessType || mapped.businessType],
    ['businessNumber', currentBusiness?.businessNumber, notionBusiness?.businessNumber],
    ['taxInvoiceEmail', currentBusiness?.taxInvoiceEmail, notionBusiness?.taxInvoiceEmail],
    ['bankName', currentBusiness?.bankName || existing.bankName, notionBusiness?.bankName || mapped.bankName],
    ['accountNumber', currentBusiness?.accountNumber || existing.accountNumber, notionBusiness?.accountNumber || mapped.accountNumber],
    ['accountHolder', currentBusiness?.accountHolder || existing.accountHolder, notionBusiness?.accountHolder || mapped.accountHolder],
    ['defaultManagerId', existing.defaultManagerId, mapped.defaultManagerId],
  ]
  return pairs.filter(([, , notion]) => String(notion ?? '').trim()).filter(([, current, notion]) => String(current ?? '').trim() !== String(notion ?? '').trim()).map(([field, current, notion]) => ({ field, label: fieldLabels[field], currentValue: String(current ?? ''), notionValue: String(notion ?? '') }))
}

export function previewNotionSeller(source: NotionSellerRecord, sellers: SellerMaster[]): NotionSellerPreview {
  const { mapped, warnings } = mapNotionSeller(source)
  const scores = new Map<string, { score: number; reason: string }>()
  const add = (seller: SellerMaster, score: number, reason: string) => { const current = scores.get(seller.id); if (!current || current.score < score) scores.set(seller.id, { score, reason }) }
  const mappedBusiness = businessNumber({ ...mapped, id: '', name: mapped.name ?? '', defaultMdId: '', defaultManagerId: '' })
  sellers.forEach((seller) => {
    if (mappedBusiness && businessNumber(seller) === mappedBusiness) add(seller, 100, '사업자등록번호 일치')
    if (normalizeDigits(mapped.contact) && normalizeDigits(seller.contact) === normalizeDigits(mapped.contact)) add(seller, 95, '휴대전화 일치')
    if (normalizeInstagram(mapped.instagramId) && normalizeInstagram(seller.instagramId) === normalizeInstagram(mapped.instagramId)) add(seller, 90, '인스타그램 일치')
    const nameScore = similarity(normalizeSellerName(mapped.name), normalizeSellerName(seller.name))
    if (nameScore === 1) add(seller, 85, '셀러명 일치')
    else if (nameScore >= 0.72) add(seller, Math.round(nameScore * 80), '셀러명 유사')
  })
  const ranked = [...scores.entries()].sort((a, b) => b[1].score - a[1].score)
  const top = ranked[0]
  const confident = top && top[1].score >= 85 && (!ranked[1] || top[1].score - ranked[1][1].score >= 5)
  const matched = confident ? sellers.find((seller) => seller.id === top[0]) : undefined
  const differences = matched ? getDifferences(matched, mapped) : []
  const candidateIds = ranked.filter(([, value]) => value.score >= 55).slice(0, 5).map(([id]) => id)
  let status: NotionSellerSyncStatus
  if (!ranked.length) status = warnings.length ? 'needs_review' : 'new'
  else if (!matched || warnings.length) status = 'needs_review'
  else status = differences.length ? 'changed' : 'existing'
  return { source, mapped, status, candidateIds, matchedSellerId: matched?.id, matchReason: matched ? top[1].reason : undefined, differences, warnings }
}

export function buildImportedSeller(preview: NotionSellerPreview, existing: SellerMaster | undefined, decision: NotionSellerDecision, now: string): SellerMaster | null {
  if (decision === 'exclude') return null
  if (decision === 'connect' && !existing) throw new Error('연결할 기존 셀러를 선택해주세요.')
  if (decision === 'apply' && preview.status === 'needs_review' && !existing) throw new Error('확인 필요 항목은 기존 셀러를 선택하거나 제외해주세요.')
  if (decision === 'apply' && !preview.mapped.name?.trim()) throw new Error('셀러명이 없는 항목은 반영할 수 없습니다.')
  const base: SellerMaster = existing ?? { id: crypto.randomUUID(), name: preview.mapped.name ?? '', defaultMdId: 'u-004', defaultManagerId: '', active: true, businesses: [] }
  if (decision === 'connect') return { ...base, notionPageId: preview.source.pageId, notionLastEditedTime: preview.source.lastEditedTime, lastSyncedAt: now }
  const importedBusiness = preview.mapped.businesses?.[0]
  const currentBusinesses = base.businesses ?? []
  const currentPrimaryIndex = currentBusinesses.findIndex((item) => item.isPrimary)
  const primaryIndex = currentPrimaryIndex >= 0 ? currentPrimaryIndex : 0
  const businesses = importedBusiness ? (currentBusinesses.length ? currentBusinesses.map((item, index) => index === primaryIndex ? { ...item, ...Object.fromEntries(Object.entries(importedBusiness).filter(([, value]) => String(value ?? '').trim())) , id: item.id, isPrimary: item.isPrimary } : item) : [importedBusiness]) : currentBusinesses
  const allowed = Object.fromEntries(Object.entries(preview.mapped).filter(([key, value]) => key !== 'businesses' && String(value ?? '').trim())) as Partial<SellerMaster>
  return { ...base, ...allowed, id: base.id, active: base.active !== false, businesses, notionPageId: preview.source.pageId, notionLastEditedTime: preview.source.lastEditedTime, lastSyncedAt: now }
}
