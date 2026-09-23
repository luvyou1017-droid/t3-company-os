import type { SupplierPilotRow } from '../../../shared/data/notionSupplierPilot10'
import { cloudSyncService } from '../../../shared/services/cloudSyncService'
import type { WiseProposalMetadata } from '../utils/wiseProposalParser'

const STORAGE_KEY = 't3-suppliers-v1'
const normalize = (value?: string) => String(value ?? '').toLocaleLowerCase('ko-KR').replace(/[^0-9a-z가-힣]/g, '')
const businessNumber = (value?: string) => String(value ?? '').replace(/\D/g, '')

export function loadSupplierRegistry() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]') as SupplierPilotRow[] } catch { return [] }
}

export function reviewProposalSupplier(metadata: WiseProposalMetadata) {
  const suppliers = loadSupplierRegistry()
  const number = businessNumber(metadata.businessRegistrationNumber)
  const exactNumber = number ? suppliers.filter((item) => businessNumber(item.businessNumber) === number) : []
  const exactName = suppliers.filter((item) => normalize(item.companyName) === normalize(metadata.vendorName))
  const matches = exactNumber.length ? exactNumber : exactName
  if (matches.length > 1) return { status: 'review' as const, reason: '동일 거래처 후보가 여러 개입니다. 거래처 DB에서 확인해주세요.', candidates: matches }
  if (matches.length === 1) return { status: 'existing' as const, supplier: matches[0], candidates: matches }
  return { status: 'new' as const, candidates: [] }
}

export async function ensureProposalSupplier(metadata: WiseProposalMetadata) {
  const review = reviewProposalSupplier(metadata)
  if (review.status === 'review') throw new Error(review.reason)
  const suppliers = loadSupplierRegistry()
  const current = review.status === 'existing' ? review.supplier : undefined
  const id = current?.id ?? `proposal-${businessNumber(metadata.businessRegistrationNumber) || crypto.randomUUID()}`
  const supplier: SupplierPilotRow = {
    ...current,
    id,
    companyName: current?.companyName || metadata.vendorName,
    businessNumber: current?.businessNumber || metadata.businessRegistrationNumber,
    address: current?.address || metadata.vendorAddress,
    bankAccount: current?.bankAccount || metadata.vendorAccount,
    taxEmail: current?.taxEmail || metadata.taxInvoiceEmail,
    orderContact: current?.orderContact || [metadata.orderContact, metadata.orderEmail].filter(Boolean).join(' / '),
    csContact: current?.csContact || [metadata.csContact, metadata.csEmail].filter(Boolean).join(' / '),
    settlementContact: current?.settlementContact || [metadata.settlementContact, metadata.settlementEmail].filter(Boolean).join(' / '),
    mainEmail: current?.mainEmail || metadata.mainBusinessEmail,
    businessHours: current?.businessHours || metadata.businessHours,
    orderDeadline: current?.orderDeadline || metadata.orderDeadlineTime,
    linkProvision: current?.linkProvision || (metadata.linkProvided === undefined ? undefined : metadata.linkProvided ? '제공' : '미제공'),
    sampleSupport: current?.sampleSupport || metadata.sampleSupportType,
    salesHurdle: current?.salesHurdle || metadata.salesHurdle,
    linkedProductCount: current?.linkedProductCount ?? 0,
    partnerType: current?.partnerType ?? 'supplier',
    source: current?.source ?? 'excel',
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify([...suppliers.filter((item) => item.id !== id), supplier]))
  await cloudSyncService.syncKeys([STORAGE_KEY])
  return supplier
}
