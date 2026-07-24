import { campaignService } from './campaignService'
import { settlementService } from './settlementService'
import { paymentRequestService } from './paymentRequestService'
import { paymentEvidenceService } from './paymentEvidenceService'
import { withholdingTaxService } from './withholdingTaxService'
import { SupabaseCampaignRepository } from '../repositories/campaignRepository'
import { SupabaseSettlementRepository } from '../repositories/settlementRepository'
import { SupabasePaymentRequestRepository } from '../repositories/paymentRequestRepository'
import { SupabasePaymentEvidenceRepository } from '../repositories/paymentEvidenceRepository'
import { SupabaseWithholdingTaxRepository } from '../repositories/withholdingTaxRepository'
import { isSupabaseConfigured, supabase } from '../lib/supabase'

export type MigrationEntity = 'campaigns' | 'settlements' | 'paymentRequests' | 'paymentEvidence' | 'withholdingTax'
export type MigrationResult = { entity: MigrationEntity; total: number; succeeded: number; failed: number; errors: string[] }

function localCollections() {
  return {
    campaigns: campaignService.getCampaigns(),
    settlements: settlementService.getSettlements(),
    paymentRequests: paymentRequestService.getPaymentRequests(),
    paymentEvidence: paymentEvidenceService.getAllEvidence(),
    withholdingTax: withholdingTaxService.getItems(),
  }
}

export const dataMigrationService = {
  getLocalCounts() {
    const data = localCollections()
    return Object.fromEntries(Object.entries(data).map(([key, items]) => [key, items.length])) as Record<MigrationEntity, number>
  },
  async getMigrationPreview() {
    const data = localCollections()
    if (!isSupabaseConfigured()) {
      return Object.entries(data).map(([entity, items]) => ({ entity: entity as MigrationEntity, localCount: items.length, duplicateCount: 0, newCount: items.length, available: false }))
    }
    const repositories = {
      campaigns: new SupabaseCampaignRepository(),
      settlements: new SupabaseSettlementRepository(),
      paymentRequests: new SupabasePaymentRequestRepository(),
      paymentEvidence: new SupabasePaymentEvidenceRepository(),
      withholdingTax: new SupabaseWithholdingTaxRepository(),
    }
    return Promise.all((Object.keys(data) as MigrationEntity[]).map(async (entity) => {
      const items = data[entity]
      const duplicateFlags = await Promise.all(items.map((item) => repositories[entity].exists(item.id).catch(() => false)))
      const duplicateCount = duplicateFlags.filter(Boolean).length
      return { entity, localCount: items.length, duplicateCount, newCount: items.length - duplicateCount, available: true }
    }))
  },
  async migrate(entity: MigrationEntity): Promise<MigrationResult> {
    if (!isSupabaseConfigured()) return { entity, total: 0, succeeded: 0, failed: 0, errors: ['Supabase 환경변수가 설정되지 않았습니다.'] }
    const data = localCollections()
    if (entity === 'campaigns') return { entity, total: data.campaigns.length, ...await new SupabaseCampaignRepository().upsertMany(data.campaigns) }
    if (entity === 'settlements') return { entity, total: data.settlements.length, ...await new SupabaseSettlementRepository().upsertMany(data.settlements) }
    if (entity === 'paymentRequests') return { entity, total: data.paymentRequests.length, ...await new SupabasePaymentRequestRepository().upsertMany(data.paymentRequests) }
    if (entity === 'paymentEvidence') return { entity, total: data.paymentEvidence.length, ...await new SupabasePaymentEvidenceRepository().upsertMany(data.paymentEvidence) }
    return { entity, total: data.withholdingTax.length, ...await new SupabaseWithholdingTaxRepository().upsertMany(data.withholdingTax) }
  },
  migrateCampaigns() { return this.migrate('campaigns') },
  migrateSettlements() { return this.migrate('settlements') },
  migratePaymentRequests() { return this.migrate('paymentRequests') },
  migratePaymentEvidence() { return this.migrate('paymentEvidence') },
  migrateWithholdingTax() { return this.migrate('withholdingTax') },
  async testConnection() {
    if (!supabase) return { ok: false, message: 'Supabase 환경변수가 없어 Local 모드로 동작합니다.' }
    const { error } = await supabase.from('profiles').select('id', { head: true, count: 'exact' })
    return error ? { ok: false, message: `데이터베이스 연결에 실패했습니다. ${error.message}` } : { ok: true, message: 'Supabase 연결과 profiles 조회 권한을 확인했습니다.' }
  },
}
