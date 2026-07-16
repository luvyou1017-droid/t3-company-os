import { useMemo, useState } from 'react'
import { campaignSchedules } from '../../features/campaignSchedules/mockData'
import { campaignDetailMock } from '../../features/campaignDetail/mockData'
import { campaignService } from '../../shared/services/campaignService'
import type { Campaign } from '../../shared/types/campaign'
import type {
  CampaignChecklistItem,
  CampaignLinkInfo,
  PriceBannerConfig,
} from '../../features/campaignDetail/types'
import { CampaignChecklistTab } from './components/CampaignChecklistTab'
import { CampaignCsTab } from './components/CampaignCsTab'
import { CampaignDetailHeader } from './components/CampaignDetailHeader'
import { CampaignDetailTabs, type DetailTab } from './components/CampaignDetailTabs'
import { CampaignLinkOrderTab } from './components/CampaignLinkOrderTab'
import { CampaignOverviewTab } from './components/CampaignOverviewTab'
import { CampaignPlaceholderTab } from './components/CampaignPlaceholderTab'
import { CampaignProposalTab } from './components/CampaignProposalTab'
import { CampaignSampleTab } from './components/CampaignSampleTab'
import { CampaignSalesDataTab } from './components/CampaignSalesDataTab'
import { CampaignSettlementTab } from './components/CampaignSettlementTab'
import { PriceBannerEditor } from './components/PriceBannerEditor'

function toSchedule(campaign: Campaign) {
  return {
    id: campaign.id,
    campaignName: campaign.campaignName,
    sellerName: campaign.sellerName,
    brandName: campaign.brandName,
    productName: campaign.productName,
    managerName: campaign.managerName,
    mdName: campaign.mdName,
    startDate: campaign.startDate || undefined,
    endDate: campaign.endDate || undefined,
    linkOwner: campaign.linkOwner,
    landingPageCompleted: Boolean(campaign.landingPageCompleted),
    sellerBusinessType: campaign.businessType,
    pendingTaskCount: campaign.pendingTaskCount ?? 0,
    pendingCsCount: campaign.pendingCsCount ?? 0,
    pendingSampleCount: campaign.pendingSampleCount ?? 0,
    linkReviewPending: Boolean(campaign.linkReviewPending),
    orderPending: Boolean(campaign.orderPending),
    vendorSettlementCompleted: Boolean(campaign.vendorSettlementCompleted),
    settlementDocumentCompleted: Boolean(campaign.settlementDocumentCompleted),
    sellerPaymentCompleted: Boolean(campaign.sellerPaymentCompleted),
    managerPaymentCompleted: Boolean(campaign.managerPaymentCompleted),
    todayTask: campaign.todayTask ?? '',
  }
}

function toChecklistItem(item: ReturnType<typeof campaignService.getChecklistItemsByCampaignId>[number]): CampaignChecklistItem {
  return {
    id: item.id,
    group: (item.group ?? campaignDetailMock.checklist.find((mockItem) => mockItem.title === item.title)?.group ?? 'D-DAY') as CampaignChecklistItem['group'],
    title: `${item.status === 'overdue' ? '[지연] ' : ''}${item.title}`,
    completed: item.status === 'completed',
  }
}

type CampaignDetailPageProps = {
  scheduleId: string
  onBack: () => void
  onOpenSalesData?: (salesDataImportId: string) => void
  onOpenSettlement?: (settlementId: string) => void
}

export function CampaignDetailPage({ scheduleId, onBack, onOpenSalesData, onOpenSettlement }: CampaignDetailPageProps) {
  const [activeTab, setActiveTab] = useState<DetailTab>('개요')
  const generatedChecklist = campaignService.getChecklistItemsByCampaignId(scheduleId).map(toChecklistItem)
  const [checklist, setChecklist] = useState<CampaignChecklistItem[]>(generatedChecklist.length ? generatedChecklist : campaignDetailMock.checklist)
  const [linkInfo, setLinkInfo] = useState<CampaignLinkInfo>(campaignDetailMock.linkInfo)
  const [priceBannerConfig, setPriceBannerConfig] = useState<PriceBannerConfig>(campaignDetailMock.priceBanner)
  const [proposalNotice, setProposalNotice] = useState('')
  const [linkNotice, setLinkNotice] = useState('')
  const [bannerNotice, setBannerNotice] = useState('')

  const schedule = useMemo(() => {
    const campaign = campaignService.getCampaignById(scheduleId)
    if (campaign) return toSchedule(campaign)
    return campaignSchedules.find((item) => item.id === scheduleId) ?? campaignSchedules[0]
  }, [scheduleId])

  const campaign = campaignService.getCampaignById(scheduleId)
  const detail = campaign
    ? {
        ...campaignDetailMock,
        id: campaign.id,
        campaignName: campaign.campaignName,
        sellerName: campaign.sellerName,
        brandName: campaign.brandName,
        productName: campaign.productName,
        managerName: campaign.managerName,
        mdName: campaign.mdName,
        startDate: campaign.startDate,
        endDate: campaign.endDate,
        settlementDueDate: campaign.settlementDueDate,
        linkOwner: campaign.linkOwner,
        sellerBusinessType: campaign.businessType,
        pendingCsCount: campaign.pendingCsCount ?? 0,
        summary: [
          `체크리스트 ${checklist.filter((item) => item.completed).length} / ${checklist.length}`,
          campaign.linkReviewPending ? '링크 검수 대기' : '링크 검수 완료',
          `미처리 CS ${campaign.pendingCsCount ?? 0}건`,
          '판매 데이터 대기',
          '정산 시작 전',
        ],
      }
    : campaignDetailMock

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

    if (activeTab === 'CS') {
      return <CampaignCsTab campaignId={schedule.id} />
    }

    if (activeTab === '판매 데이터') {
      return <CampaignSalesDataTab campaignId={schedule.id} onOpenSalesData={onOpenSalesData} />
    }

    if (activeTab === '정산') {
      return <CampaignSettlementTab campaignId={schedule.id} onOpenSettlement={onOpenSettlement} />
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
