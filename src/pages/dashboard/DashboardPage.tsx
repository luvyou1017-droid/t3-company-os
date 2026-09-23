import { useEffect, useMemo, useState } from 'react'
import { getTodayInSeoul } from '../../features/campaignSchedules/scheduleStatus'
import type { DashboardMetric, MetricTone } from '../../features/dashboard/mockData'
import { CampaignTimingBadge } from '../../shared/components/CampaignTimingBadge'
import { LandingPageBadge } from '../../shared/components/LandingPageBadge'
import { ManagerBadge } from '../../shared/components/ManagerBadge'
import { MetricCard } from '../../shared/components/MetricCard'
import { getDataProviderMode } from '../../shared/lib/dataProvider'
import { SupabaseCampaignRepository } from '../../shared/repositories/campaignRepository'
import { campaignService } from '../../shared/services/campaignService'
import type { Campaign } from '../../shared/types/campaign'
import { DataConnectionCard } from './DataConnectionCard'
import { getCampaignSalesChannel } from '../../shared/utils/campaignSalesChannel'

type DashboardPageProps = {
  onOpenCampaign: (campaignId: string) => void
  onViewAll: () => void
}

type DashboardCampaign = Campaign & {
  dashboardStatus: '판매중' | '오늘 오픈' | '오픈 예정'
}

const approvalPendingStatuses = new Set(['approval_pending'])

function formatPeriod(startDate: string, endDate: string) {
  const format = (date: string) => date ? date.slice(5).replace('-', '.') : '-'
  return `${format(startDate)} - ${format(endDate)}`
}

function isActive(campaign: Campaign, today: string) {
  return Boolean(campaign.startDate && campaign.endDate && campaign.startDate <= today && campaign.endDate >= today)
}

function dashboardStatus(campaign: Campaign, today: string): DashboardCampaign['dashboardStatus'] {
  if (campaign.startDate === today) return '오늘 오픈'
  return isActive(campaign, today) ? '판매중' : '오픈 예정'
}

function metric(label: string, value: number, helper: string, tone: MetricTone = 'default'): DashboardMetric {
  return { label, value: String(value), helper, tone }
}

export function DashboardPage({ onOpenCampaign, onViewAll }: DashboardPageProps) {
  const sharedMode = getDataProviderMode() === 'supabase'
  const cachedCampaigns = campaignService.getCampaigns()
  const [campaigns, setCampaigns] = useState<Campaign[]>(cachedCampaigns)
  const [loading, setLoading] = useState(sharedMode && cachedCampaigns.length === 0)
  const [loadError, setLoadError] = useState('')
  const today = getTodayInSeoul()

  useEffect(() => {
    if (!sharedMode) return
    let active = true
    new SupabaseCampaignRepository().list()
      .then((items) => {
        if (!active) return
        campaignService.saveCampaigns(items)
        setCampaigns(items)
        setLoadError('')
      })
      .catch(() => {
        if (active) setLoadError('공용 DB의 공구 일정을 불러오지 못했습니다. 잠시 후 다시 열어주세요.')
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => { active = false }
  }, [sharedMode])

  const dashboard = useMemo(() => {
    const active = campaigns.filter((campaign) => isActive(campaign, today))
    const startsToday = campaigns.filter((campaign) => campaign.startDate === today)
    const endsToday = campaigns.filter((campaign) => campaign.endDate === today)
    const linkReviewPending = campaigns.filter((campaign) => campaign.linkReviewPending)
    const csCampaigns = campaigns.filter((campaign) => (campaign.pendingCsCount ?? 0) > 0)
    const pendingCsCount = csCampaigns.reduce((sum, campaign) => sum + (campaign.pendingCsCount ?? 0), 0)
    const settlementPending = campaigns.filter((campaign) =>
      Boolean(campaign.endDate && campaign.endDate < today) &&
      !(campaign.sellerPaymentCompleted && campaign.managerPaymentCompleted),
    )
    const paymentApprovalPending = campaigns.filter((campaign) =>
      approvalPendingStatuses.has(campaign.sellerPaymentRequestStatus ?? '') ||
      approvalPendingStatuses.has(campaign.managerPaymentRequestStatus ?? ''),
    )

    const metrics = [
      metric('오늘 진행중 공동구매', active.length, `오늘 오픈 ${startsToday.length}건, 오늘 마감 ${endsToday.length}건`),
      metric('D-Day 일정', startsToday.length, '오늘 시작하는 공구 일정', 'warning'),
      metric('링크 검수 대기', linkReviewPending.length, '검수 필요로 표시된 일정', 'warning'),
      metric('CS 처리 대기', pendingCsCount, `${csCampaigns.length}개 공구에서 처리 대기`, pendingCsCount ? 'danger' : 'default'),
      metric('정산 대기', settlementPending.length, '공구 종료 후 최종 완료 전'),
      metric('지급 승인 대기', paymentApprovalPending.length, '대표 승인 필요', 'warning'),
    ]

    const operationalCampaigns = campaigns
      .filter((campaign) => isActive(campaign, today) || campaign.startDate > today)
      .sort((a, b) => {
        const activeDifference = Number(isActive(b, today)) - Number(isActive(a, today))
        return activeDifference || a.startDate.localeCompare(b.startDate) || a.campaignName.localeCompare(b.campaignName, 'ko')
      })
      .slice(0, 5)
      .map((campaign): DashboardCampaign => ({ ...campaign, dashboardStatus: dashboardStatus(campaign, today) }))

    return { metrics, operationalCampaigns }
  }, [campaigns, today])

  return (
    <section className="dashboard">
      {loadError && <div className="inline-notice" role="alert"><span>{loadError}</span></div>}

      <div className="dashboard__summary" aria-busy={loading}>
        {dashboard.metrics.map((item) => (
          <MetricCard
            helper={loading ? '공용 DB 확인 중' : item.helper}
            key={item.label}
            label={item.label}
            tone={item.tone}
            value={loading ? '—' : item.value}
          />
        ))}
      </div>

      <section className="panel">
        <div className="panel__header">
          <div>
            <h2>진행중인 공동구매</h2>
            <p>현재 판매 중인 일정부터 가까운 오픈 일정 순으로 표시합니다.</p>
          </div>
          <button className="panel__action" onClick={onViewAll} type="button">
            전체 보기
          </button>
        </div>

        <div className="table-wrap">
          <table className="campaign-table">
            <thead>
              <tr>
                <th>D-day</th>
                <th>캠페인</th>
                <th>매니저</th>
                <th>랜딩페이지</th>
                <th>판매 기간</th>
                <th>상태</th>
                <th>누적 매출</th>
                <th>CS 대기</th>
              </tr>
            </thead>
            <tbody>
              {!loading && dashboard.operationalCampaigns.map((campaign) => (
                <tr key={campaign.id}>
                  <td><CampaignTimingBadge endDate={campaign.endDate} startDate={campaign.startDate} /></td>
                  <td>
                    <button className="campaign-table__link" onClick={() => onOpenCampaign(campaign.id)} type="button">
                      <strong>{campaign.campaignName}</strong>
                    </button>
                  </td>
                  <td><ManagerBadge name={campaign.managerName} /></td>
                  <td><LandingPageBadge landingPageType={getCampaignSalesChannel(campaign)} linkOwner={campaign.linkOwner} /></td>
                  <td>{formatPeriod(campaign.startDate, campaign.endDate)}</td>
                  <td><span className="status-badge">{campaign.dashboardStatus}</span></td>
                  <td>{campaign.revenue ?? '0원'}</td>
                  <td>{campaign.pendingCsCount ?? 0}건</td>
                </tr>
              ))}
              {!loading && !dashboard.operationalCampaigns.length && (
                <tr><td className="dashboard-table-empty" colSpan={8}>진행 중이거나 예정된 공동구매 일정이 없습니다.</td></tr>
              )}
              {loading && (
                <tr><td className="dashboard-table-empty" colSpan={8}>공용 DB의 공구 일정을 불러오는 중입니다.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
      {import.meta.env.DEV && <DataConnectionCard />}
    </section>
  )
}
