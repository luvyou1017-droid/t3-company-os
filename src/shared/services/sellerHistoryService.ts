import { campaignService } from './campaignService'
import { sellerMasterService, type SellerMaster } from './sellerMasterService'
import { storageService, STORAGE_KEYS } from './storageService'
import type { SellerSettlementRule } from '../types/sellerSettlement'
import { toDatabaseUuid } from '../utils/databaseId'

export const sellerSearchKey = (value: string) => value.normalize('NFKC').replace(/[\s@]/g, '').toLowerCase()
const ownsId = (seller: SellerMaster, id: string) => Boolean(id) && (seller.id === id || seller.historicalSellerIds?.includes(id))
export function savedSellerInformation(sellers: SellerMaster[]) {
  const rules = storageService.getItem<SellerSettlementRule[]>(STORAGE_KEYS.sellerSettlementRules, [])
  return rules.map(rule => {
    const campaign = campaignService.getCampaignById(rule.campaignId)
    const matches = sellers.filter(seller => campaign && ownsId(seller, campaign.sellerId))
    return { rule, campaign, seller: matches.length === 1 ? matches[0] : undefined }
  })
}
export function historicalSellers(sellers: SellerMaster[]) {
  const missing = new Map<string, { id: string; name: string }>()
  for (const campaign of campaignService.getCampaigns()) {
    if (campaign.sellerName && !sellers.some(seller => ownsId(seller, campaign.sellerId))) missing.set(`${campaign.sellerId}:${campaign.sellerName}`, { id: campaign.sellerId, name: campaign.sellerName })
  }
  return [...missing.values()].sort((a, b) => a.name.localeCompare(b.name, 'ko'))
}
export function sellerHistoryDetails(record: { id: string; name: string }, sellers: SellerMaster[]) {
  const rules = storageService.getItem<SellerSettlementRule[]>(STORAGE_KEYS.sellerSettlementRules, [])
  const campaigns = campaignService.getCampaigns().filter(campaign => campaign.sellerId === record.id && campaign.sellerName === record.name)
  return { campaigns, matches: sellers.filter(seller => sellerSearchKey(seller.name) === sellerSearchKey(record.name)),
    rules: rules.filter(rule => campaigns.some(campaign => campaign.id === rule.campaignId)) }
}
export function historicalSellerDraft(record: { id: string; name: string }): SellerMaster {
  const { campaigns } = sellerHistoryDetails(record, [])
  const originalUuid = /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(record.id)
  // Keep valid original UUIDs, including imported Notion UUIDs, unchanged.
  return { id: record.id ? originalUuid ? record.id : toDatabaseUuid(record.id) : crypto.randomUUID(),
    name: record.name.trim(), defaultMdId: campaigns[0]?.mdId ?? 'u-004', defaultManagerId: campaigns[0]?.managerId ?? '', active: true,
    historicalSellerIds: record.id && !originalUuid ? [record.id] : [],
    sourceMetadata: { historicalCampaignIds: campaigns.map(campaign => campaign.id) }, businesses: [] }
}
export async function linkHistoricalSeller(record: { id: string; name: string }, targetId: string) {
  if (!record.id) throw new Error('셀러 ID가 없는 일정은 이 화면에서 자동 연결할 수 없습니다. 일정별 셀러를 확인해주세요.')
  const sellers = await sellerMasterService.loadSellers(true)
  const owner = sellers.find(seller => ownsId(seller, record.id))
  if (owner) throw new Error('이미 연결된 ID입니다. 목록을 다시 불러와 확인해주세요.')
  const target = sellers.find(seller => seller.id === targetId)
  if (!target) throw new Error('연결할 셀러를 선택해주세요.')
  return sellerMasterService.saveSellerProfile({ ...target, historicalSellerIds: [...new Set([...(target.historicalSellerIds ?? []), record.id])] })
}
