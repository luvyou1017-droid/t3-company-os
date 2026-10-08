import type { Campaign } from '../types/campaign'
import { createCampaignRepository } from '../repositories/campaignRepository'
import { getDataProviderMode } from '../lib/dataProvider'
import type { DataRepository } from '../repositories/baseRepository'
import { campaignService } from './campaignService'

export function mergeRegisteredCampaigns(server: Campaign[], local: Campaign[]) {
  const ids = new Set(server.map(campaign => campaign.id))
  const unpersisted = local.filter(campaign => !ids.has(campaign.id))
  // Retain local-only registrations for explicit recovery; never bulk-upload them.
  return { campaigns: [...unpersisted, ...server], unpersisted }
}

export async function persistRegisteredCampaign(campaign: Campaign, repository?: Pick<DataRepository<Campaign>, 'upsert'>) {
  if (!repository && getDataProviderMode() !== 'supabase') return campaignService.completeCreatedCampaign(campaign)
  const saved = await (repository ?? createCampaignRepository()).upsert(campaign)
  if (!saved || saved.id !== campaign.id) throw new Error('일정 저장 결과를 확인하지 못했습니다. 다시 등록하지 말고 저장된 일정 ID를 확인해주세요.')
  return campaignService.completeCreatedCampaign(saved)
}
