import type { Settlement } from '../types/settlement'
import { getDataProviderMode } from '../lib/dataProvider'
import { STORAGE_KEYS, storageService } from '../services/storageService'
import { LocalRepository, SupabaseRepository, type DataRepository } from './baseRepository'
import { toDatabaseUuid } from '../utils/databaseId'

export class LocalSettlementRepository extends LocalRepository<Settlement> {
  constructor() { super(() => storageService.getItem<Settlement[]>(STORAGE_KEYS.settlements, []), (items) => storageService.setItem(STORAGE_KEYS.settlements, items)) }
}
export class SupabaseSettlementRepository extends SupabaseRepository<Settlement> {
  constructor() { super('settlements') }
  protected databaseId(id: string) { return toDatabaseUuid(id) }
  protected toRow(item: Settlement) {
    const c = item.currentCalculation
    return {
      id: toDatabaseUuid(item.id), campaign_id: toDatabaseUuid(item.campaignId), settlement_code: `SET-${item.id}`, status: item.status,
      gross_sales: c.grossSales, total_commission_rate: c.totalCommissionRate, total_commission_amount: c.grossCommission,
      seller_commission_rate: c.sellerCommissionRate, seller_commission_amount: c.sellerCommissionAmount,
      vendor_commission_amount: c.vendorCommission, deductions_amount: c.deductionTotal,
      distributable_amount: c.distributableVendorCommission, manager_payment_amount: c.managerAmount,
      company_amount: c.companyAmount, source_version: item.settlementVersion,
      calculation_snapshot: item.calculationSnapshot ?? c, approved_by: null, approved_at: null,
      version: item.settlementVersion, updated_at: item.updatedAt, metadata: this.metadata(item),
    }
  }
}
export function createSettlementRepository(): DataRepository<Settlement> {
  return getDataProviderMode() === 'supabase' ? new SupabaseSettlementRepository() : new LocalSettlementRepository()
}
