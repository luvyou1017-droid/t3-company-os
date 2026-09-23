import type { CampaignCreationBusinessType } from '../types/campaignCreation'
import { appUsers, getUserById } from '../data/users.ts'
import { getDataProviderMode } from '../lib/dataProvider'
import { supabase } from '../lib/supabase'
import { storageService, STORAGE_KEYS } from './storageService.ts'

export interface SellerMaster {
  id: string
  name: string
  instagramId?: string
  contact?: string
  businessType?: CampaignCreationBusinessType
  businessName?: string
  realName?: string
  recipientName?: string
  shippingPhone?: string
  shippingAddress?: string
  bankName?: string
  accountNumber?: string
  accountHolder?: string
  defaultMdId: string
  defaultManagerId: string
  active?: boolean
  createdAt?: string
  updatedAt?: string
  notionPageId?: string
  notionLastEditedTime?: string
  lastSyncedAt?: string
  sourceMetadata?: Record<string, unknown>
  businesses?: SellerBusinessProfile[]
}

export interface SellerBusinessProfile {
  id: string
  businessName: string
  businessNumber?: string
  representativeName?: string
  businessType: CampaignCreationBusinessType
  taxInvoiceEmail?: string
  certificatePath?: string
  certificateName?: string
  bankName?: string
  accountNumber?: string
  accountHolder?: string
  bankbookPath?: string
  bankbookName?: string
  isPrimary: boolean
  active: boolean
}

const localSeed: SellerMaster[] = [
  { id: 'seller-kim-minji', name: '김민지', businessType: 'simplified_business', defaultMdId: 'u-004', defaultManagerId: 'u-005', active: true },
  { id: 'seller-yoon-market', name: '윤정마켓', businessType: 'general_business', defaultMdId: 'u-004', defaultManagerId: 'u-006', active: true },
]

let remoteCache: SellerMaster[] = []
let recentSellerIds: string[] = []
const MAX_DOCUMENT_SIZE = 25 * 1024 * 1024
const IMAGE_COMPRESSION_THRESHOLD = 8 * 1024 * 1024

async function optimizeDocument(file: File) {
  if (!file.type.startsWith('image/') || file.size <= IMAGE_COMPRESSION_THRESHOLD) return file
  try {
    const bitmap = await createImageBitmap(file)
    const scale = Math.min(1, 2400 / Math.max(bitmap.width, bitmap.height))
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(bitmap.width * scale))
    canvas.height = Math.max(1, Math.round(bitmap.height * scale))
    const context = canvas.getContext('2d')
    if (!context) return file
    context.fillStyle = '#fff'
    context.fillRect(0, 0, canvas.width, canvas.height)
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
    bitmap.close()
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.82))
    if (!blob || blob.size >= file.size) return file
    return new File([blob], `${file.name.replace(/\.[^.]+$/, '')}.jpg`, { type: 'image/jpeg', lastModified: file.lastModified })
  } catch {
    return file
  }
}

function getSellers() {
  return getDataProviderMode() === 'supabase'
    ? remoteCache
    : storageService.getItem<SellerMaster[]>(STORAGE_KEYS.sellerMasters, localSeed)
}

function fromRow(row: Record<string, unknown>): SellerMaster {
  const metadata = (row.metadata ?? {}) as Record<string, unknown>
  const businesses = Array.isArray(metadata.businesses) ? metadata.businesses as SellerBusinessProfile[] : []
  const primary = businesses.find((business) => business.isPrimary) ?? businesses[0]
  return {
    id: String(row.id), name: String(row.seller_name ?? ''), instagramId: String(row.instagram_id ?? ''),
    contact: String(row.contact ?? ''), businessName: String(row.business_name ?? ''),
    businessType: (row.business_type || undefined) as CampaignCreationBusinessType | undefined,
    realName: String(metadata.realName ?? ''), defaultMdId: String(metadata.defaultMdId ?? 'u-004'),
    recipientName: String(metadata.recipientName ?? ''),
    shippingPhone: String(metadata.shippingPhone ?? ''),
    shippingAddress: String(metadata.shippingAddress ?? metadata.address ?? row.address ?? ''),
    defaultManagerId: String(metadata.defaultManagerId ?? ''), active: Boolean(row.active),
    bankName: String(row.bank_name ?? metadata.bankName ?? primary?.bankName ?? ''), accountHolder: String(row.account_holder ?? metadata.accountHolder ?? primary?.accountHolder ?? ''), accountNumber: String(metadata.accountNumber ?? primary?.accountNumber ?? ''),
    createdAt: String(row.created_at ?? ''), updatedAt: String(row.updated_at ?? ''),
    notionPageId: String(row.notion_source_id ?? metadata.notionPageId ?? ''),
    notionLastEditedTime: String(metadata.notionLastEditedTime ?? ''), lastSyncedAt: String(metadata.lastSyncedAt ?? ''),
    businesses, sourceMetadata: metadata,
  }
}

function toRow(seller: SellerMaster) {
  return {
    id: seller.id, seller_name: seller.name.trim(), instagram_id: seller.instagramId?.trim() || null,
    contact: seller.contact?.trim() || null, business_name: seller.businessName?.trim() || null,
    business_type: seller.businessType || null, active: seller.active !== false,
    bank_name: seller.bankName?.trim() || null, account_holder: seller.accountHolder?.trim() || null,
    notion_source_id: seller.notionPageId?.trim() || null,
    updated_at: seller.updatedAt,
    metadata: { ...seller.sourceMetadata, realName: seller.realName?.trim() || '', recipientName: seller.recipientName?.trim() || '', shippingPhone: seller.shippingPhone?.trim() || '', shippingAddress: seller.shippingAddress?.trim() || '', defaultMdId: seller.defaultMdId, defaultManagerId: seller.defaultManagerId, bankName: seller.bankName?.trim() || '', accountNumber: seller.accountNumber?.trim() || '', accountHolder: seller.accountHolder?.trim() || '', businesses: seller.businesses ?? [], notionPageId: seller.notionPageId?.trim() || '', notionLastEditedTime: seller.notionLastEditedTime || '', lastSyncedAt: seller.lastSyncedAt || '' },
  }
}

export const sellerMasterService = {
  listSellers(includeInactive = false) {
    const items = getSellers()
    return includeInactive ? items : items.filter((seller) => seller.active !== false)
  },
  async loadSellerById(id: string) {
    if (getDataProviderMode() !== 'supabase' || !supabase) return this.getSellerById(id) ?? null
    const { data, error } = await supabase.from('sellers').select('*').eq('id', id).maybeSingle()
    if (error) throw error
    if (!data) return null
    const seller = fromRow(data)
    remoteCache = [seller, ...remoteCache.filter(item => item.id !== seller.id)]
    return seller
  },
  async loadSellers(includeInactive = false) {
    if (getDataProviderMode() !== 'supabase') return this.listSellers(includeInactive)
    if (!supabase) return []
    const { data, error } = await supabase.from('sellers').select('*').order('seller_name')
    if (error) throw error
    remoteCache = (data ?? []).map((row) => fromRow(row))
    return this.listSellers(includeInactive)
  },
  searchSellers(query: string) {
    const normalized = query.trim().toLowerCase()
    return this.listSellers().filter((seller) => !normalized || `${seller.name} ${seller.instagramId ?? ''} ${seller.businessName ?? ''}`.toLowerCase().includes(normalized))
  },
  getSellerById(id: string) { return getSellers().find((seller) => seller.id === id) },
  async saveSellerProfile(profile: SellerMaster) {
    const existing = await this.loadSellerById(profile.id)
    if (profile.updatedAt && existing?.updatedAt && profile.updatedAt !== existing.updatedAt) throw new Error('셀러 정보가 변경되었습니다. 다시 불러온 뒤 저장해주세요.')
    const normalized = { ...existing, ...Object.fromEntries(Object.entries(profile).filter(([,value]) => value !== undefined)), sourceMetadata: existing?.sourceMetadata ?? profile.sourceMetadata, active: profile.active ?? existing?.active ?? true, updatedAt: new Date().toISOString() } as SellerMaster
    if (getDataProviderMode() === 'supabase') {
      if (!supabase) throw new Error('데이터베이스 연결을 확인해주세요.')
      const payload = toRow(normalized)
      const query = existing ? supabase.from('sellers').update(payload).eq('id', existing.id).eq('updated_at', existing.updatedAt!) : supabase.from('sellers').insert(payload)
      const { data, error } = await query.select().maybeSingle()
      if (error) throw error
      if (!data) throw new Error('다른 화면에서 셀러 정보가 변경되었습니다. 다시 불러온 뒤 저장해주세요.')
      const saved = fromRow(data)
      remoteCache = [saved, ...remoteCache.filter((seller) => seller.id !== saved.id)]
      return saved
    }
    storageService.setItem(STORAGE_KEYS.sellerMasters, [normalized, ...getSellers().filter((seller) => seller.id !== normalized.id)])
    return normalized
  },
  getSettlementProfile(id: string, businessId?: string) {
    const seller = this.getSellerById(id)
    if (!seller || !businessId) return seller
    const business = seller.businesses?.find(item => item.id === businessId)
    // A missing selected business must not silently use another business's account.
    return { ...seller, businessName: business?.businessName, businessType: business?.businessType, bankName: business?.bankName, accountNumber: business?.accountNumber, accountHolder: business?.accountHolder }
  },
  async saveBusinessAccount(id: string, businessId: string | undefined, account: { bankName: string; accountNumber: string; accountHolder: string }) {
    const seller = await this.loadSellerById(id)
    if (!seller) throw new Error('기존 셀러 정보를 찾지 못했습니다. 새 셀러를 생성하지 않았습니다.')
    const selected = businessId ? seller.businesses?.find(item => item.id === businessId) : seller.businesses?.find(item => item.isPrimary)
    if (businessId && !selected) throw new Error('선택한 사업자를 찾지 못했습니다. 사업자 연결을 확인해주세요.')
    const values = { bankName: account.bankName.trim(), accountNumber: account.accountNumber.trim(), accountHolder: account.accountHolder.trim() }
    if (Object.values(values).some(value => !value)) throw new Error('은행·계좌번호·예금주를 모두 입력해주세요.')
    return this.saveSellerProfile({ ...seller, ...(!selected || selected.isPrimary ? values : {}), businesses: seller.businesses?.map(item => item.id === selected?.id ? { ...item, ...values } : item) })
  },
  async setActive(id: string, active: boolean) {
    const seller = this.getSellerById(id)
    if (!seller) throw new Error('셀러 정보를 찾을 수 없습니다.')
    return this.saveSellerProfile({ ...seller, active })
  },
  async uploadBusinessDocument(sellerId: string, businessId: string, kind: 'certificate' | 'bankbook', file: File) {
    if (!supabase) throw new Error('데이터베이스 연결을 확인해주세요.')
    const uploadFile = await optimizeDocument(file)
    if (uploadFile.size > MAX_DOCUMENT_SIZE) throw new Error('파일 용량이 25MB를 초과합니다. 더 작은 이미지 또는 PDF를 선택해주세요.')
    const safeName = uploadFile.name.replace(/[^a-zA-Z0-9._-]/g, '_') || `${kind}-${Date.now()}`
    const path = `${sellerId}/${businessId}/${kind}/${crypto.randomUUID()}-${safeName}`
    const { error } = await supabase.storage.from('seller-documents').upload(path, uploadFile, { contentType: uploadFile.type, upsert: false })
    if (error) {
      if (/maximum allowed size|too large/i.test(error.message)) throw new Error('파일이 너무 큽니다. 25MB 이하 파일을 선택해주세요.')
      throw error
    }
    return { path, name: file.name }
  },
  uploadBusinessCertificate(sellerId: string, businessId: string, file: File) {
    return this.uploadBusinessDocument(sellerId, businessId, 'certificate', file)
  },
  uploadBusinessBankbook(sellerId: string, businessId: string, file: File) {
    return this.uploadBusinessDocument(sellerId, businessId, 'bankbook', file)
  },
  async getCertificateUrl(path: string) {
    if (!supabase) throw new Error('데이터베이스 연결을 확인해주세요.')
    const { data, error } = await supabase.storage.from('seller-documents').createSignedUrl(path, 60)
    if (error) throw error
    return data.signedUrl
  },
  getBusinessById(sellerId: string, businessId?: string) {
    const seller = this.getSellerById(sellerId)
    if (!seller) return undefined
    return (seller.businesses ?? []).find((business) => business.id === businessId)
      ?? (seller.businesses ?? []).find((business) => business.isPrimary)
  },
  getRecentSellers() { return recentSellerIds.map((id) => this.getSellerById(id)).filter((seller): seller is SellerMaster => Boolean(seller)) },
  rememberSeller(id: string) { recentSellerIds = [id, ...recentSellerIds.filter((item) => item !== id)].slice(0, 3) },
  getDefaults(id: string) {
    const seller = this.getSellerById(id)
    if (!seller) return undefined
    return { ...seller, defaultMdName: getUserById(seller.defaultMdId)?.name ?? '', defaultManagerName: getUserById(seller.defaultManagerId)?.name ?? '' }
  },
  getRegistrationPath() { return '/master/sellers' },
  getManagementPath(id: string) { return `/master/sellers?edit=${encodeURIComponent(id)}` },
  canAssignDefaults(id: string) {
    const seller = this.getSellerById(id)
    return Boolean(seller && appUsers.some((user) => user.id === seller.defaultMdId) && appUsers.some((user) => user.id === seller.defaultManagerId))
  },
}
