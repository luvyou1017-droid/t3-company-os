import { mergeNotionCampaign, scheduleRequiredErrors } from '../utils/campaignReadiness'
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
      seller_id: (item.sellerId ? toDatabaseUuid(item.sellerId) : null), seller_name: item.sellerName, brand_id: (item.brandId ? toDatabaseUuid(item.brandId) : null), brand_name: item.brandName,
      product_id: (item.productId ? toDatabaseUuid(item.productId) : null), product_name: item.productName, manager_id: toDatabaseUuid(item.managerId), manager_name: item.managerName,
      md_id: (item.mdId ? toDatabaseUuid(item.mdId) : null), md_name: item.mdName, start_date: item.startDate, end_date: item.endDate,
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
    const { data: existing, error } = await this.client.from(this.table).select('id, metadata')
    if (error) throw error
    const merged = items.map(item => {
      const source = item.notionImportMetadata?.sourceId?.replace(/-/g, '')
      if (!source) throw new Error('Notion 원본 ID 확인 필요')
      const matches = (existing ?? []).filter(row => (row.metadata as Campaign)?.notionImportMetadata?.sourceId?.replace(/-/g, '') === source)
      if (matches.length > 1) throw new Error(`${item.campaignName}: 중복 Notion 연결 확인 필요`)
      const byScheduleId = (existing ?? []).filter(row => (row.metadata as Campaign)?.id === item.id || String(row.id) === item.id)
      if (!matches.length && byScheduleId.length > 1) throw new Error(`${item.campaignName}: 일정 ID 중복 확인 필요`)
      if (!matches.length && byScheduleId[0] && (byScheduleId[0].metadata as Campaign)?.notionImportMetadata?.sourceId && (byScheduleId[0].metadata as Campaign).notionImportMetadata?.sourceId?.replace(/-/g, '') !== source) throw new Error(`${item.campaignName}: 기존 일정은 다른 Notion 페이지와 연결되어 있습니다`)
      const saved = matches[0] ?? byScheduleId[0]
      if (matches[0] && byScheduleId[0] && matches[0].id !== byScheduleId[0].id) throw new Error(`${item.campaignName}: Notion 연결과 일정 ID 충돌`)
      const current = saved ? { ...(saved.metadata as Campaign), id: (saved.metadata as Campaign).id || String(saved.id) } : undefined
      const next = mergeNotionCampaign(current, item)
      const errors = current?.deletedAt || current?.status === 'settled' ? [] : scheduleRequiredErrors(next)
      if (errors.length) throw new Error(`${item.campaignName}: ${errors.join(' · ')}`)
      return { next, saved }
    })
    // Reuse the actual database primary key. Never delete/recreate a linked schedule.
    for (const { next, saved } of merged) {
      if (next.deletedAt || next.status === 'settled') continue
      // Preserve the database primary key and all business columns on an update.
      const row = this.toRow(next)
      const result = saved
        ? await this.client.from(this.table).update({ campaign_name: row.campaign_name, start_date: row.start_date, end_date: row.end_date, metadata: row.metadata, updated_at: row.updated_at }).eq('id', saved.id).select('id')
        : await this.client.from(this.table).insert(row).select('id')
      if (result.error || result.data?.length !== 1) return { succeeded: 0, failed: items.length, errors: [result.error?.message ?? '일정 저장 결과를 확인해주세요.'], campaigns: [] }
    }
    return { succeeded: items.length, failed: 0, errors: [], campaigns: merged.map(x => x.next) }

  }
}
export function createCampaignRepository(): DataRepository<Campaign> {
  return getDataProviderMode() === 'supabase' ? new SupabaseCampaignRepository() : new LocalCampaignRepository()
}
