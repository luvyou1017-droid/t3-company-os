import { activeCampaigns, dashboardMetrics } from '../../features/dashboard/mockData'
import { MetricCard } from '../../shared/components/MetricCard'
import { DataConnectionCard } from './DataConnectionCard'

export function DashboardPage() {
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
                    <span className="status-badge">{campaign.status}</span>
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
