export type DetailTab =
  | '개요'
  | '체크리스트'
  | '링크·발주'
  | '제안서'
  | '가격 배너'
  | '샘플'
  | 'CS'
  | '판매 데이터'
  | '정산'
  | '이력'

const tabs: DetailTab[] = ['개요', '체크리스트', '링크·발주', '제안서', '가격 배너', '샘플', 'CS', '판매 데이터', '정산', '이력']

type CampaignDetailTabsProps = {
  activeTab: DetailTab
  onChange: (tab: DetailTab) => void
}

export function CampaignDetailTabs({ activeTab, onChange }: CampaignDetailTabsProps) {
  return (
    <div className="detail-tabs" role="tablist" aria-label="Campaign detail tabs">
      {tabs.map((tab) => (
        <button
          aria-selected={activeTab === tab}
          className={activeTab === tab ? 'detail-tab is-active' : 'detail-tab'}
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
