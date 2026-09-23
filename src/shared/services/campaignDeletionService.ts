import { supabase } from '../lib/supabase'
import { SupabaseCampaignRepository } from '../repositories/campaignRepository'
import { toDatabaseUuid } from '../utils/databaseId'
import { containsCampaignReference, deleteUnlinkedCampaign, type CampaignDeletionRepository } from '../utils/campaignDeletionGuard'
import { STORAGE_KEYS } from './storageService'

const linkedTables = ['sales_data_imports', 'sales_data_rows', 'settlements', 'settlement_adjustments', 'seller_settlements', 'payment_requests', 'payment_evidence', 'withholding_tax_items', 'activity_logs'] as const
const labels: Record<string, string> = { sales_data_imports: '판매 업로드', sales_data_rows: '판매행', settlements: '정산', settlement_adjustments: '정산 조정', seller_settlements: '셀러 정산', payment_requests: '지급요청', payment_evidence: '증빙', withholding_tax_items: '세무 이력', activity_logs: '활동 이력' }

const repository: CampaignDeletionRepository = {
  async inspect(id) {
    if (!supabase) throw new Error('연결 검사를 위해 기존 운영 DB 연결이 필요합니다.')
    const { data: auth, error: authError } = await supabase.auth.getUser()
    if (authError || !auth.user) throw new Error('로그인 상태를 확인해주세요. 삭제하지 않았습니다.')
    const { data: actor, error: roleError } = await supabase.from('profiles').select('role,active,approval_status').eq('id', auth.user.id).single()
    if (roleError || !actor?.active || actor.approval_status !== 'approved' || !['ceo','admin'].includes(actor.role)) throw new Error('대표·관리자만 완전삭제할 수 있습니다.')
    const campaign = await new SupabaseCampaignRepository().getById(id)
    if (!campaign) throw new Error('일정을 찾지 못했습니다. 목록을 새로고침해주세요.')
    const linkedSources: string[] = []
    const dbId = toDatabaseUuid(id)
    for (const table of linkedTables) {
      const { count, error } = await supabase.from(table).select('id', { count: 'exact', head: true }).eq('campaign_id', dbId)
      if (error || count === null) throw new Error(`${labels[table]} 연결을 확인하지 못해 삭제를 차단했습니다.`)
      if (count) linkedSources.push(labels[table])
    }
    const { count: batches, error: batchError } = await supabase.from('payment_request_batches').select('id', { count: 'exact', head: true }).contains('campaign_ids', [dbId])
    if (batchError || batches === null) throw new Error('지급 묶음 연결을 확인하지 못해 삭제를 차단했습니다.')
    if (batches) linkedSources.push('지급 묶음')
    const revisions: string[] = []
    // Includes sample v1, legacy samples, CS, files, tasks, events and snapshots.
    // Paginate; a server row limit must never turn an incomplete scan into permission.
    for (const table of ['workspace_state', 'workspace_state_history']) {
      for (let offset = 0; ; offset += 100) {
        const { data, error } = await supabase.from(table).select('storage_key,payload,revision').eq('workspace_id', 'wisevendor').order(table === 'workspace_state' ? 'storage_key' : 'id').range(offset, offset + 99)
        if (error || !data) throw new Error('공용 자료·과거 이력 연결을 확인하지 못해 삭제를 차단했습니다.')
        for (const row of data) {
          revisions.push(`${table}:${row.storage_key}:${row.revision}`)
          if (row.storage_key === STORAGE_KEYS.campaigns) {
            if (!Array.isArray(row.payload)) throw new Error('공용 일정 자료 형식을 확인하지 못해 삭제를 차단했습니다.')
            // A previous version can retain a proposal even when the current row does not.
            const versions = row.payload.filter(item => item && [id, dbId].includes(item.id))
            if (versions.some(item => item.productId || item.proposalSnapshots?.length || item.campaignProducts?.length || item.campaignEvents?.length)) linkedSources.push('공용 일정의 상품·제안서 이력')
            if (containsCampaignReference(row.payload.filter(item => item && ![id, dbId].includes(item.id)), [id, dbId])) linkedSources.push('다른 공구 연결')
            continue
          }
          if (containsCampaignReference(row.payload, [id, dbId])) linkedSources.push(table === 'workspace_state_history' ? '과거 공용 이력' : row.storage_key === 't3_sample_order_book_v1' ? '샘플발주' : '공용 업무 자료')
        }
        if (data.length < 100) break
      }
    }
    return { campaign, linkedSources, revision: revisions.join('|') }
  },
  async remove(campaign) {
    if (!supabase) throw new Error('운영 DB 연결이 필요합니다.')
    // Existing FK constraints reject concurrent normalized-record links (no cascade).
    const { data, error } = await supabase.from('campaigns').delete().eq('id', toDatabaseUuid(campaign.id)).eq('updated_at', campaign.updatedAt).eq('metadata->>deletedAt', campaign.deletedAt!).select('id')
    if (error) throw new Error('연결 자료 또는 변경된 일정이 있어 삭제하지 못했습니다. 다시 확인해주세요.')
    if (data?.length !== 1) throw new Error('일정 상태가 변경되어 삭제하지 않았습니다.')
  },
}

export const campaignDeletionService = { remove: (id: string, expectedUpdatedAt: string) => deleteUnlinkedCampaign(repository, id, expectedUpdatedAt) }
