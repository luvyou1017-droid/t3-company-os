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
  bankName?: string
  accountNumber?: string
  accountHolder?: string
  defaultMdId: string
  defaultManagerId: string
  active?: boolean
  createdAt?: string
  updatedAt?: string
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
    defaultManagerId: String(metadata.defaultManagerId ?? ''), active: Boolean(row.active),
    bankName: String(row.bank_name ?? metadata.bankName ?? primary?.bankName ?? ''), accountHolder: String(row.account_holder ?? metadata.accountHolder ?? primary?.accountHolder ?? ''), accountNumber: String(metadata.accountNumber ?? primary?.accountNumber ?? ''),
    createdAt: String(row.created_at ?? ''), updatedAt: String(row.updated_at ?? ''),
    businesses,
  }
}

function toRow(seller: SellerMaster) {
  return {
    id: seller.id, seller_name: seller.name.trim(), instagram_id: seller.instagramId?.trim() || null,
    contact: seller.contact?.trim() || null, business_name: seller.businessName?.trim() || null,
    business_type: seller.businessType || null, active: seller.active !== false,
    bank_name: seller.bankName?.trim() || null, account_holder: seller.accountHolder?.trim() || null,
    metadata: { realName: seller.realName?.trim() || '', defaultMdId: seller.defaultMdId, defaultManagerId: seller.defaultManagerId, bankName: seller.bankName?.trim() || '', accountNumber: seller.accountNumber?.trim() || '', accountHolder: seller.accountHolder?.trim() || '', businesses: seller.businesses ?? [] },
  }
}

export const sellerMasterService = {
  listSellers(includeInactive = false) {
    const items = getSellers()
    return includeInactive ? items : items.filter((seller) => seller.active !== false)
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
    const normalized = { ...profile, active: profile.active !== false, updatedAt: new Date().toISOString() }
    if (getDataProviderMode() === 'supabase') {
      if (!supabase) throw new Error('데이터베이스 연결을 확인해주세요.')
      const { data, error } = await supabase.from('sellers').upsert(toRow(normalized)).select().single()
      if (error) throw error
      const saved = fromRow(data)
      remoteCache = [saved, ...remoteCache.filter((seller) => seller.id !== saved.id)]
      return saved
    }
    storageService.setItem(STORAGE_KEYS.sellerMasters, [normalized, ...getSellers().filter((seller) => seller.id !== normalized.id)])
    return normalized
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
