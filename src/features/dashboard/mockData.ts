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

export const activeCampaigns: ActiveCampaign[] = [
  {
    id: 'CP-2026-0715-01',
    campaignName: '여름 스킨케어 집중 공구',
    brandName: 'Lumi Skin',
    mdName: '김민서',
    managerName: '박지훈',
    salesPeriod: '07.12 - 07.18',
    status: '판매중',
    revenue: '42,800,000원',
    csPending: 8,
  },
  {
    id: 'CP-2026-0715-02',
    campaignName: '프리미엄 단백질 쉐이크',
    brandName: 'Fit Table',
    mdName: '정다은',
    managerName: '오세린',
    salesPeriod: '07.14 - 07.21',
    status: '판매중',
    revenue: '28,450,000원',
    csPending: 5,
  },
  {
    id: 'CP-2026-0715-03',
    campaignName: '키친웨어 한정 구성',
    brandName: 'Maison Cook',
    mdName: '김민서',
    managerName: '윤태호',
    salesPeriod: '07.15 - 07.20',
    status: '판매중',
    revenue: '16,920,000원',
    csPending: 2,
  },
  {
    id: 'CP-2026-0715-04',
    campaignName: '베이비 케어 정기 공구',
    brandName: 'Tiny Haus',
    mdName: '한유리',
    managerName: '박지훈',
    salesPeriod: '07.16 - 07.23',
    status: '검수완료',
    revenue: '0원',
    csPending: 0,
  },
  {
    id: 'CP-2026-0715-05',
    campaignName: '홈트 소도구 스타터 세트',
    brandName: 'Move Lab',
    mdName: '정다은',
    managerName: '최유진',
    salesPeriod: '07.17 - 07.24',
    status: '일정확정',
    revenue: '0원',
    csPending: 0,
  },
]
