import type { Campaign } from '../types/campaign'
import { campaigns as mockCampaigns } from '../data/campaigns'
import { getDataProviderMode } from '../lib/dataProvider'
import { STORAGE_KEYS, storageService } from '../services/storageService'
import { LocalRepository, SupabaseRepository, type DataRepository } from './baseRepository'
import { toDatabaseUuid } from '../utils/databaseId'

export class LocalCampaignRepository extends LocalRepository<Campaign> {
  constructor() { super(() => storageService.getItem(STORAGE_KEYS.campaigns, mockCampaigns), (items) => storageService.setItem(STORAGE_KEYS.campaigns, items)) }
}
export class SupabaseCampaignRepository extends SupabaseRepository<Campaign> {
  constructor() { super('campaigns') }
  protected databaseId(id: string) { return toDatabaseUuid(id) }
  protected toRow(item: Campaign) {
    return {
      id: toDatabaseUuid(item.id), campaign_code: item.campaignCode, campaign_name: item.campaignName,
      seller_id: toDatabaseUuid(item.sellerId), seller_name: item.sellerName, brand_id: toDatabaseUuid(item.brandId), brand_name: item.brandName,
      product_id: toDatabaseUuid(item.productId), product_name: item.productName, manager_id: toDatabaseUuid(item.managerId), manager_name: item.managerName,
      md_id: toDatabaseUuid(item.mdId), md_name: item.mdName, start_date: item.startDate, end_date: item.endDate,
      sales_channel_type: item.salesChannelType, link_owner: item.linkOwner, business_type: item.businessType,
      total_commission_rate: item.totalCommissionRate, seller_commission_rate: item.sellerCommissionRate,
      settlement_due_date: item.settlementDueDate, status: item.status, memo: item.memo, updated_at: item.updatedAt,
      metadata: item,
    }
  }
}
export function createCampaignRepository(): DataRepository<Campaign> {
  return getDataProviderMode() === 'supabase' ? new SupabaseCampaignRepository() : new LocalCampaignRepository()
}
