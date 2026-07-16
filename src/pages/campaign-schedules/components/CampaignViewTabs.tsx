import type { CampaignViewTab } from '../../../features/campaignSchedules/types'

const tabs: CampaignViewTab[] = ['전체', '내 일정', '발주·링크', 'CS', '샘플', '정산', '완료']

type CampaignViewTabsProps = {
  activeTab: CampaignViewTab
  onChange: (tab: CampaignViewTab) => void
}

export function CampaignViewTabs({ activeTab, onChange }: CampaignViewTabsProps) {
  return (
    <div className="view-tabs" role="tablist" aria-label="Campaign schedule views">
      {tabs.map((tab) => (
        <button
          aria-selected={activeTab === tab}
          className={activeTab === tab ? 'view-tab is-active' : 'view-tab'}
          key={tab}
          onClick={() => onChange(tab)}
          role="tab"
          type="button"
        >
          {tab}
        </button>
      ))}
    </div>
  )
}
