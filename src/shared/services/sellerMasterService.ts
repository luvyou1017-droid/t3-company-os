import type { CampaignCreationBusinessType } from '../types/campaignCreation'
import { appUsers, getUserById } from '../data/users.ts'
import { storageService, STORAGE_KEYS } from './storageService'

export interface SellerMaster {
  id: string
  name: string
  businessType?: CampaignCreationBusinessType
  businessName?: string
  realName?: string
  defaultMdId: string
  defaultManagerId: string
  bankName?: string
  accountNumber?: string
  accountHolder?: string
}

const sellers: SellerMaster[] = [
  { id: 'seller-kim-minji', name: '김민지', businessType: 'simplified_business', defaultMdId: 'u-004', defaultManagerId: 'u-005' },
  { id: 'seller-yoon-market', name: '윤정마켓', businessType: 'general_business', defaultMdId: 'u-004', defaultManagerId: 'u-006' },
  { id: 'seller-daily-joo', name: '데일리주희', businessType: 'freelancer', defaultMdId: 'u-004', defaultManagerId: 'u-007' },
  { id: 'seller-incomplete', name: '정보확인 셀러', defaultMdId: 'u-004', defaultManagerId: 'u-008' },
]

function getSellers() {
  return storageService.getItem<SellerMaster[]>(STORAGE_KEYS.sellerMasters, sellers)
}

let recentSellerIds: string[] = []

export const sellerMasterService = {
  listSellers() { return getSellers() },
  searchSellers(query: string) {
    const normalized = query.trim().toLowerCase()
    return getSellers().filter((seller) => !normalized || seller.name.toLowerCase().includes(normalized))
  },
  getSellerById(id: string) { return getSellers().find((seller) => seller.id === id) },
  saveSellerProfile(profile: SellerMaster) {
    const next = [...getSellers().filter((seller) => seller.id !== profile.id), profile]
    storageService.setItem(STORAGE_KEYS.sellerMasters, next)
    return profile
  },
  getRecentSellers() {
    return recentSellerIds.map((id) => this.getSellerById(id)).filter((seller): seller is SellerMaster => Boolean(seller))
  },
  rememberSeller(id: string) {
    recentSellerIds = [id, ...recentSellerIds.filter((item) => item !== id)].slice(0, 3)
  },
  getDefaults(id: string) {
    const seller = this.getSellerById(id)
    if (!seller) return undefined
    return {
      ...seller,
      defaultMdName: getUserById(seller.defaultMdId)?.name ?? '',
      defaultManagerName: getUserById(seller.defaultManagerId)?.name ?? '',
    }
  },
  getRegistrationPath() { return '/sellers/new' },
  getManagementPath(id: string) { return `/sellers/${encodeURIComponent(id)}` },
  canAssignDefaults(id: string) {
    const seller = this.getSellerById(id)
    return Boolean(seller && appUsers.some((user) => user.id === seller.defaultMdId) && appUsers.some((user) => user.id === seller.defaultManagerId))
  },
}
