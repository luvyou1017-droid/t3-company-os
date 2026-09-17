import {
  getCampaignStatus,
} from '../../../features/campaignSchedules/scheduleStatus'
import type { CampaignSchedule } from '../../../features/campaignSchedules/types'
import { CampaignTimingBadge } from '../../../shared/components/CampaignTimingBadge'
import { LandingPageBadge } from '../../../shared/components/LandingPageBadge'
import { ManagerBadge } from '../../../shared/components/ManagerBadge'
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
        <CampaignTimingBadge endDate={schedule.endDate} startDate={schedule.startDate} />
      </div>
      <CampaignStatusBadge status={status} />
      <dl>
        <div>
          <dt>담당</dt>
          <dd><ManagerBadge name={schedule.managerName} /></dd>
        </div>
        <div>
          <dt>랜딩페이지</dt>
          <dd><LandingPageBadge landingPageType={schedule.landingPageType} linkOwner={schedule.linkOwner} /></dd>
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
