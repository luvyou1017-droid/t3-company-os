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
      metadata: this.metadata(item),
    }
  }
  async deleteBeforeStartDate(cutoffDate: string) {
    const { data, error } = await this.client
      .from(this.table)
      .delete()
      .lt('start_date', cutoffDate)
      .select('id')
    if (error) throw error
    return data?.length ?? 0
  }
  async upsertNotionSnapshot(items: Campaign[]) {
    if (!items.length) return { succeeded: 0, failed: 0, errors: [] }
    const sourceIds = new Set(items.map((item) => item.notionImportMetadata?.sourceId).filter(Boolean))
    const currentIds = new Set(items.map((item) => toDatabaseUuid(item.id)))
    const { data: existing, error: readError } = await this.client
      .from(this.table)
      .select('id, metadata')
      .like('campaign_code', 'NT-%')
    if (readError) throw readError

    const result = await this.upsertMany(items)
    if (result.failed) return result

    const staleIds = (existing ?? []).flatMap((row) => {
      const metadata = row.metadata as Campaign | null
      const sourceId = metadata?.notionImportMetadata?.sourceId
      return sourceId && sourceIds.has(sourceId) && !currentIds.has(String(row.id)) ? [String(row.id)] : []
    })
    if (staleIds.length) {
      const { error: deleteError } = await this.client.from(this.table).delete().in('id', staleIds)
      if (deleteError) throw deleteError
    }
    return result
  }
}
export function createCampaignRepository(): DataRepository<Campaign> {
  return getDataProviderMode() === 'supabase' ? new SupabaseCampaignRepository() : new LocalCampaignRepository()
}
