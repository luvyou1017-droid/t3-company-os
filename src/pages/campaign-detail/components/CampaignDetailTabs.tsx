import type { CampaignTab } from '../../../shared/types/campaignWorkspace'
import { useCompanyAuth } from '../../../features/auth/AuthGate'
import { canAccessCampaignTab } from '../../../features/auth/pagePermissions'

export const campaignTabs: Array<{ id: CampaignTab; label: string }> = [
  { id: 'overview', label: '개요' },
  { id: 'timeline', label: '타임라인' },
  { id: 'work', label: '업무' },
  { id: 'files', label: '제안서·파일' },
  { id: 'communications', label: '소통' },
  { id: 'samples', label: '샘플' },
  { id: 'cs', label: 'CS' },
  { id: 'sales', label: '판매 데이터' },
  { id: 'settlement', label: '정산' },
  { id: 'history', label: '이력' },
]

type Props = { activeTab: CampaignTab; onChange: (tab: CampaignTab) => void }

export function CampaignDetailTabs({ activeTab, onChange }: Props) {
  const { profile } = useCompanyAuth()
  const visibleTabs = campaignTabs.filter((tab) => canAccessCampaignTab(profile.role, tab.id))

  return (
    <nav aria-label="Campaign 상세 탭" className="workspace-tabs">
      {visibleTabs.map((tab) => (
        <button
          aria-current={activeTab === tab.id ? 'page' : undefined}
          className={activeTab === tab.id ? 'is-active' : ''}
          key={tab.id}
          onClick={() => onChange(tab.id)}
          type="button"
        >
          {tab.label}
        </button>
      ))}
    </nav>
  )
}
