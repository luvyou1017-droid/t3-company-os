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
  { label: '오늘 진행중 공동구매', value: '0', helper: '등록된 운영 일정을 기준으로 표시됩니다.' },
  { label: 'D-Day 일정', value: '0', helper: '오늘 마감 또는 오픈 일정', tone: 'warning' },
  { label: '링크 검수 대기', value: '0', helper: '브랜드 링크 확인 필요', tone: 'warning' },
  { label: 'CS 처리 대기', value: '0', helper: '처리할 CS가 없습니다.', tone: 'danger' },
  { label: '정산 대기', value: '0', helper: '판매 데이터 확정 후 표시됩니다.' },
  { label: '지급 승인 대기', value: '0', helper: '승인할 지급 요청이 없습니다.', tone: 'warning' },
]

export const activeCampaigns: ActiveCampaign[] = []
