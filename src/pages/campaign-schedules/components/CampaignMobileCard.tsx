import {
  getCampaignStatus,
  getDday,
} from '../../../features/campaignSchedules/scheduleStatus'
import type { CampaignSchedule } from '../../../features/campaignSchedules/types'
import { CampaignStatusBadge } from './CampaignStatusBadge'

type CampaignMobileCardProps = {
  schedule: CampaignSchedule
  onClick: (schedule: CampaignSchedule) => void
}

export function CampaignMobileCard({ schedule, onClick }: CampaignMobileCardProps) {
  const status = getCampaignStatus(schedule)
  const remainingWorkCount =
    schedule.pendingTaskCount + schedule.pendingCsCount + schedule.pendingSampleCount

  return (
    <button className="schedule-mobile-card" onClick={() => onClick(schedule)} type="button">
      <div className="schedule-mobile-card__top">
        <strong>{schedule.campaignName}</strong>
        <span>{getDday(schedule)}</span>
      </div>
      <CampaignStatusBadge status={status} />
      <dl>
        <div>
          <dt>셀러</dt>
          <dd>{schedule.sellerName}</dd>
        </div>
        <div>
          <dt>브랜드·상품</dt>
          <dd>
            {schedule.brandName} · {schedule.productName}
          </dd>
        </div>
        <div>
          <dt>담당</dt>
          <dd>
            {schedule.managerName} / {schedule.mdName}
          </dd>
        </div>
        <div>
          <dt>오늘 할 일</dt>
          <dd>{schedule.todayTask}</dd>
        </div>
      </dl>
      <div className="schedule-mobile-card__meta">
        <span>CS {schedule.pendingCsCount}건</span>
        <span>남은 업무 {remainingWorkCount}건</span>
      </div>
    </button>
  )
}
