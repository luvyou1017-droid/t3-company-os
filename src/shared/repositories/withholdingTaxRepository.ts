import type { WithholdingTaxItem } from '../types/withholdingTax'
import { getDataProviderMode } from '../lib/dataProvider'
import { STORAGE_KEYS, storageService } from '../services/storageService'
import { LocalRepository, SupabaseRepository, type DataRepository } from './baseRepository'
import { toDatabaseUuid } from '../utils/databaseId'

export class LocalWithholdingTaxRepository extends LocalRepository<WithholdingTaxItem> {
  constructor() { super(() => storageService.getItem<WithholdingTaxItem[]>(STORAGE_KEYS.withholdingTaxItems, []), (items) => storageService.setItem(STORAGE_KEYS.withholdingTaxItems, items)) }
}
export class SupabaseWithholdingTaxRepository extends SupabaseRepository<WithholdingTaxItem> {
  constructor() { super('withholding_tax_items') }
  protected databaseId(id: string) { return toDatabaseUuid(id) }
  protected toRow(item: WithholdingTaxItem) {
    return {
      id: toDatabaseUuid(item.id), campaign_id: toDatabaseUuid(item.campaignId), settlement_id: toDatabaseUuid(item.settlementId), payment_request_id: item.paymentRequestId ? toDatabaseUuid(item.paymentRequestId) : null,
      owner_type: item.ownerType, owner_id: toDatabaseUuid(item.ownerId), owner_name: item.ownerName, payment_month: item.paymentMonth,
      payment_date: item.paymentDate, gross_settlement_amount: item.grossSettlementAmount, withholding_base_amount: item.withholdingBaseAmount,
      income_tax_rate: item.incomeTaxRate, income_tax_amount: item.incomeTaxAmount, local_income_tax_rate: item.localIncomeTaxRate,
      local_income_tax_amount: item.localIncomeTaxAmount, total_withholding_tax_amount: item.totalWithholdingTaxAmount,
      final_payment_amount: item.finalPaymentAmount, source_version: item.sourceVersion, status: item.status,
      created_by: item.createdBy, updated_by: item.updatedBy, created_at: item.createdAt, updated_at: item.updatedAt, metadata: this.metadata(item),
    }
  }
}
export function createWithholdingTaxRepository(): DataRepository<WithholdingTaxItem> {
  return getDataProviderMode() === 'supabase' ? new SupabaseWithholdingTaxRepository() : new LocalWithholdingTaxRepository()
}
