import { getCampaignStatus } from '../../../features/campaignSchedules/scheduleStatus'
import type { CampaignSchedule } from '../../../features/campaignSchedules/types'
import type { CampaignDetail } from '../../../features/campaignDetail/types'
import { CampaignStatusBadge } from '../../campaign-schedules/components/CampaignStatusBadge'

type CampaignDetailHeaderProps = {
  detail: CampaignDetail
  schedule: CampaignSchedule
  onBack: () => void
}

export function CampaignDetailHeader({ detail, schedule, onBack }: CampaignDetailHeaderProps) {
  return (
    <section className="detail-hero">
      <div className="detail-hero__main">
        <button className="back-button" onClick={onBack} type="button">
          ← 목록으로
        </button>
        <div className="detail-hero__title">
          <CampaignStatusBadge status={getCampaignStatus(schedule)} />
          <span className="dday-pill">D+2</span>
          <h2>{detail.campaignName}</h2>
        </div>
        <dl className="detail-meta-grid">
          <div>
            <dt>셀러</dt>
            <dd>{detail.sellerName}</dd>
          </div>
          <div>
            <dt>브랜드</dt>
            <dd>{detail.brandName}</dd>
          </div>
          <div>
            <dt>상품</dt>
            <dd>{detail.productName}</dd>
          </div>
          <div>
            <dt>담당 매니저</dt>
            <dd>{detail.managerName}</dd>
          </div>
          <div>
            <dt>MD</dt>
            <dd>{detail.mdName}</dd>
          </div>
          <div>
            <dt>판매 기간</dt>
            <dd>{detail.startDate.replaceAll('-', '.')} ~ {detail.endDate.replaceAll('-', '.')}</dd>
          </div>
          <div>
            <dt>링크 주체</dt>
            <dd>{detail.linkOwner}</dd>
          </div>
        </dl>
      </div>

      <aside className="detail-hero__summary">
        {detail.summary.map((item) => (
          <span key={item}>{item}</span>
        ))}
      </aside>
    </section>
  )
}
