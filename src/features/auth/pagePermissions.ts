import type { AppPage } from '../../App'
import type { CampaignTab } from '../../shared/types/campaignWorkspace'
import type { CompanyProfile } from './AuthGate'

export type CompanyRole = CompanyProfile['role']

const CEO_ONLY_PAGES = new Set<AppPage>(['사용자 승인'])
const PAYMENT_PAGES = new Set<AppPage>(['지급 승인'])
const MD_HIDDEN_PAGES = new Set<AppPage>(['판매 데이터'])

export function canAccessPage(role: CompanyRole, page: AppPage) {
  if (role === 'partner_vendor') return false
  if (CEO_ONLY_PAGES.has(page)) return role === 'ceo' || role === 'admin'
  if (PAYMENT_PAGES.has(page)) return ['ceo', 'admin', 'settlement_cs', 'team_lead'].includes(role)
  if (role === 'md' && MD_HIDDEN_PAGES.has(page)) return false
  return true
}

export function canAccessCampaignTab(role: CompanyRole, tab: CampaignTab) {
  return !(role === 'md' && tab === 'sales')
}
