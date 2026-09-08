import type { Campaign } from '../types/campaign'
import { isSupabaseConfigured, supabase } from '../lib/supabase'
import { SupabaseCampaignRepository } from '../repositories/campaignRepository'
import { STORAGE_KEYS, storageService } from './storageService'

const DEMO_CAMPAIGN_NAMES = new Set([
  '한나 × 머즈캐리어 3차',
  '스탠다드푸드 뼈용이×전진단',
  '셀러A×브랜드B',
  '주방용품 공동구매',
  '건강식품 공동구매',
  '여름 스킨케어 집중 공구',
  '홈트 소도구 스타터 세트',
  '베이비 케어 정기 공구',
  '프리미엄 침구 공동구매',
  '반려동물 간식 공동구매',
  '리빙 수납 박스 공동구매',
  '가을 아우터 프리오더',
])

/** 로그인 사용자의 Supabase 일정을 로컬 운영 화면에 다시 연결합니다. */
export async function restoreRemoteCampaigns() {
  if (!isSupabaseConfigured() || !supabase) return
  try {
    const { data } = await supabase.auth.getSession()
    if (!data.session) return
    const remoteCampaigns = await new SupabaseCampaignRepository().list()
    const actualCampaigns = remoteCampaigns.filter((campaign) => !DEMO_CAMPAIGN_NAMES.has(campaign.campaignName))
    if (!actualCampaigns.length) return

    const localCampaigns = storageService.getItem<Campaign[]>(STORAGE_KEYS.campaigns, [])
    const merged = new Map(localCampaigns.map((campaign) => [campaign.id, campaign]))
    actualCampaigns.forEach((campaign) => merged.set(campaign.id, campaign))
    storageService.setItem(STORAGE_KEYS.campaigns, [...merged.values()])
  } catch (error) {
    console.warn('등록된 공동구매 일정을 불러오지 못했습니다.', error)
  }
}
