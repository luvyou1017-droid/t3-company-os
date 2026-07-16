import { useMemo, useState } from 'react'
import { campaignSchedules } from '../../features/campaignSchedules/mockData'
import { campaignDetailMock } from '../../features/campaignDetail/mockData'
import type {
  CampaignChecklistItem,
  CampaignLinkInfo,
  PriceBannerConfig,
} from '../../features/campaignDetail/types'
import { CampaignChecklistTab } from './components/CampaignChecklistTab'
import { CampaignDetailHeader } from './components/CampaignDetailHeader'
import { CampaignDetailTabs, type DetailTab } from './components/CampaignDetailTabs'
import { CampaignLinkOrderTab } from './components/CampaignLinkOrderTab'
import { CampaignOverviewTab } from './components/CampaignOverviewTab'
import { CampaignPlaceholderTab } from './components/CampaignPlaceholderTab'
import { CampaignProposalTab } from './components/CampaignProposalTab'
import { CampaignSampleTab } from './components/CampaignSampleTab'
import { PriceBannerEditor } from './components/PriceBannerEditor'

type CampaignDetailPageProps = {
  scheduleId: string
  onBack: () => void
}

export function CampaignDetailPage({ scheduleId, onBack }: CampaignDetailPageProps) {
  const [activeTab, setActiveTab] = useState<DetailTab>('개요')
  const [checklist, setChecklist] = useState<CampaignChecklistItem[]>(campaignDetailMock.checklist)
  const [linkInfo, setLinkInfo] = useState<CampaignLinkInfo>(campaignDetailMock.linkInfo)
  const [priceBannerConfig, setPriceBannerConfig] = useState<PriceBannerConfig>(campaignDetailMock.priceBanner)
  const [proposalNotice, setProposalNotice] = useState('')
  const [linkNotice, setLinkNotice] = useState('')
  const [bannerNotice, setBannerNotice] = useState('')

  const schedule = useMemo(
    () => campaignSchedules.find((item) => item.id === scheduleId) ?? campaignSchedules[0],
    [scheduleId],
  )

  const detail = campaignDetailMock

  const toggleChecklistItem = (id: string) => {
    setChecklist((items) =>
      items.map((item) => (item.id === id ? { ...item, completed: !item.completed } : item)),
    )
  }

  const toggleReviewItem = (key: keyof CampaignLinkInfo['reviewChecklist']) => {
    setLinkInfo((current) => ({
      ...current,
      reviewChecklist: {
        ...current.reviewChecklist,
        [key]: !current.reviewChecklist[key],
      },
    }))
  }

  const renderTab = () => {
    if (activeTab === '개요') {
      return <CampaignOverviewTab checklist={checklist} detail={detail} />
    }

    if (activeTab === '체크리스트') {
      return <CampaignChecklistTab checklist={checklist} onToggle={toggleChecklistItem} />
    }

    if (activeTab === '링크·발주') {
      return (
        <CampaignLinkOrderTab
          linkInfo={linkInfo}
          notice={linkNotice}
          onMockAction={setLinkNotice}
          onToggleReviewItem={toggleReviewItem}
          onUpdate={setLinkInfo}
        />
      )
    }

    if (activeTab === '제안서') {
      return (
        <CampaignProposalTab
          notice={proposalNotice}
          onMockAction={setProposalNotice}
          proposal={detail.proposal}
        />
      )
    }

    if (activeTab === '가격 배너') {
      return (
        <PriceBannerEditor
          config={priceBannerConfig}
          notice={bannerNotice}
          onChange={setPriceBannerConfig}
          onMockAction={setBannerNotice}
        />
      )
    }

    if (activeTab === '샘플') {
      return <CampaignSampleTab campaignId={schedule.id} />
    }

    return <CampaignPlaceholderTab title={activeTab} />
  }

  return (
    <section className="campaign-detail-page">
      <CampaignDetailHeader detail={detail} onBack={onBack} schedule={schedule} />
      <section className="panel detail-panel">
        <CampaignDetailTabs activeTab={activeTab} onChange={setActiveTab} />
        <div className="detail-panel__body">{renderTab()}</div>
      </section>
    </section>
  )
}
