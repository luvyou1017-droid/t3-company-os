import type { Campaign } from '../types/campaign'

// Exact identifiers only; never infer a relationship from a name or a price.
export function containsCampaignReference(value: unknown, ids: readonly string[]): boolean {
  if (typeof value === 'string') return ids.includes(value)
  if (Array.isArray(value)) return value.some(item => containsCampaignReference(item, ids))
  return Boolean(value && typeof value === 'object' && Object.entries(value).some(([key, item]) => ids.includes(key) || containsCampaignReference(item, ids)))
}

export function assertCampaignDeletionAllowed(campaign: Campaign, linkedSources: string[]) {
  if (!campaign.deletedAt) throw new Error('휴지통에 있는 일정만 완전삭제할 수 있습니다.')
  if (campaign.productId || campaign.proposalSnapshots?.length || campaign.campaignProducts?.length || campaign.campaignEvents?.length) {
    throw new Error('제안서 Snapshot·상품·이벤트가 연결되어 완전삭제할 수 없습니다. 휴지통에서 이력을 유지합니다.')
  }
  if (linkedSources.length) throw new Error(`연결 자료가 있어 완전삭제할 수 없습니다: ${[...new Set(linkedSources)].join(', ')}`)
}

export interface CampaignDeletionRepository {
  inspect(id: string): Promise<{ campaign: Campaign; linkedSources: string[]; revision: string }>
  remove(campaign: Campaign): Promise<void>
}

export async function deleteUnlinkedCampaign(repo: CampaignDeletionRepository, id: string, expectedUpdatedAt: string) {
  const first = await repo.inspect(id)
  assertCampaignDeletionAllowed(first.campaign, first.linkedSources)
  if (first.campaign.updatedAt !== expectedUpdatedAt) throw new Error('일정이 변경되었습니다. 목록을 새로고침해주세요.')
  // Recheck after the user's confirmation; a stale UI check never authorizes deletion.
  const latest = await repo.inspect(id)
  assertCampaignDeletionAllowed(latest.campaign, latest.linkedSources)
  if (latest.revision !== first.revision || latest.campaign.updatedAt !== expectedUpdatedAt) throw new Error('연결 자료가 변경되었습니다. 다시 확인해주세요.')
  await repo.remove(latest.campaign)
}
