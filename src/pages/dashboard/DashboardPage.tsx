import { MetricCard } from '../../shared/components/MetricCard'
import { campaignService } from '../../shared/services/campaignService'
import { csService } from '../../shared/services/csService'
import { paymentRequestService } from '../../shared/services/paymentRequestService'
import { settlementService } from '../../shared/services/settlementService'
import { DataConnectionCard } from './DataConnectionCard'

export function DashboardPage() {
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(new Date())
  const campaigns = campaignService.getCampaigns()
  const csCases = csService.getCsCases()
  const settlements = settlementService.getSettlements()
  const paymentRequests = paymentRequestService.getPaymentRequests()
  const activeCampaigns = campaigns
    .filter((campaign) => campaign.status === 'active' || campaign.status === 'preparing')
    .slice(0, 5)
    .map((campaign) => ({
      ...campaign,
      salesPeriod: [campaign.startDate, campaign.endDate].filter(Boolean).join(' - '),
      displayStatus: campaign.status === 'active' ? '판매중' : campaign.landingPageCompleted ? '검수완료' : '일정확정',
      csPending: csCases.filter((item) => item.campaignId === campaign.id && item.status !== '처리 완료' && item.status !== '운영 기간 종료').length,
    }))
  const dashboardMetrics = [
    { label: '오늘 진행중 공동구매', value: String(campaigns.filter((item) => item.startDate <= today && item.endDate >= today).length), helper: '등록된 운영 일정을 기준으로 표시됩니다.' },
    { label: 'D-Day 일정', value: String(campaigns.filter((item) => item.startDate === today || item.endDate === today).length), helper: '오늘 마감 또는 오픈 일정', tone: 'warning' as const },
    { label: '링크 검수 대기', value: String(campaigns.filter((item) => item.linkReviewPending).length), helper: '브랜드 링크 확인 필요', tone: 'warning' as const },
    { label: 'CS 처리 대기', value: String(csCases.filter((item) => item.status !== '처리 완료' && item.status !== '운영 기간 종료').length), helper: '현재 미완료 CS', tone: 'danger' as const },
    { label: '정산 대기', value: String(settlements.filter((item) => item.status !== 'completed').length), helper: '완료 전 정산 건' },
    { label: '지급 승인 대기', value: String(paymentRequests.filter((item) => item.status === 'approval_pending').length), helper: '대표 승인 필요', tone: 'warning' as const },
  ]

  return (
    <section className="dashboard">
      <div className="dashboard__summary">
        {dashboardMetrics.map((metric) => (
          <MetricCard
            helper={metric.helper}
            key={metric.label}
            label={metric.label}
            tone={metric.tone}
            value={metric.value}
          />
        ))}
      </div>

      <section className="panel">
        <div className="panel__header">
          <div>
            <h2>진행중인 공동구매</h2>
            <p>현재 판매 중이거나 오픈 준비가 완료된 캠페인입니다.</p>
          </div>
          <button className="panel__action" type="button">
            전체 보기
          </button>
        </div>

        <div className="table-wrap">
          <table className="campaign-table">
            <thead>
              <tr>
                <th>캠페인</th>
                <th>브랜드</th>
                <th>MD</th>
                <th>매니저</th>
                <th>판매 기간</th>
                <th>상태</th>
                <th>누적 매출</th>
                <th>CS 대기</th>
              </tr>
            </thead>
            <tbody>
              {activeCampaigns.map((campaign) => (
                <tr key={campaign.id}>
                  <td>
                    <strong>{campaign.campaignName}</strong>
                    <span>{campaign.id}</span>
                  </td>
                  <td>{campaign.brandName}</td>
                  <td>{campaign.mdName}</td>
                  <td>{campaign.managerName}</td>
                  <td>{campaign.salesPeriod}</td>
                  <td>
                    <span className="status-badge">{campaign.displayStatus}</span>
                  </td>
                  <td>{campaign.revenue}</td>
                  <td>{campaign.csPending}건</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      {import.meta.env.DEV && <DataConnectionCard />}
    </section>
  )
}
