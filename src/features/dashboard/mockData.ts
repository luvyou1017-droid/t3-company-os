import { campaigns } from '../../shared/data/campaigns'

export type MetricTone = 'default' | 'warning' | 'danger'

export type DashboardMetric = {
  label: string
  value: string
  helper: string
  tone?: MetricTone
}

export type ActiveCampaign = {
  id: string
  campaignName: string
  brandName: string
  mdName: string
  managerName: string
  salesPeriod: string
  status: '판매중' | '검수완료' | '일정확정'
  revenue: string
  csPending: number
}

export const dashboardMetrics: DashboardMetric[] = [
  {
    label: '오늘 진행중 공동구매',
    value: '12',
    helper: '판매중 8건, 오픈 예정 4건',
  },
  {
    label: 'D-Day 일정',
    value: '5',
    helper: '오늘 마감 또는 오픈 일정',
    tone: 'warning',
  },
  {
    label: '링크 검수 대기',
    value: '7',
    helper: '브랜드 링크 확인 필요',
    tone: 'warning',
  },
  {
    label: 'CS 처리 대기',
    value: '23',
    helper: '24시간 이상 대기 4건',
    tone: 'danger',
  },
  {
    label: '정산 대기',
    value: '9',
    helper: '판매 데이터 확정 후 처리 예정',
  },
  {
    label: '지급 승인 대기',
    value: '3',
    helper: '대표 승인 필요',
    tone: 'warning',
  },
]

export const activeCampaigns: ActiveCampaign[] = campaigns.slice(0, 5).map((campaign, index) => ({
  id: campaign.id,
  campaignName: campaign.campaignName,
  brandName: campaign.brandName,
  mdName: campaign.mdName,
  managerName: campaign.managerName,
  salesPeriod: `${campaign.startDate.slice(5).replace('-', '.')} - ${campaign.endDate.slice(5).replace('-', '.')}`,
  status: index < 3 ? '판매중' : index === 3 ? '검수완료' : '일정확정',
  revenue: campaign.revenue ?? '0원',
  csPending: campaign.pendingCsCount ?? 0,
}))
