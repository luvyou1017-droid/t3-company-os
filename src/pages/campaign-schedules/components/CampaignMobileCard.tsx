import { campaignService } from '../../../shared/services/campaignService'
import { campaignReadiness } from '../../../shared/utils/campaignReadiness'
import { campaignProductCatalogService } from '../../../shared/services/campaignProductCatalogService'
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
  const campaign = campaignService.getCampaignById(schedule.id)
  const readiness = campaign ? campaignReadiness(campaign, campaignProductCatalogService.getManagedProducts()) : undefined
  const status = getCampaignStatus(schedule)
  const remainingWorkCount =
    schedule.pendingTaskCount + schedule.pendingCsCount + schedule.pendingSampleCount

  return (
    <button className="schedule-mobile-card" onClick={() => onClick(schedule)} type="button">
      <div className="schedule-mobile-card__top">
        <strong>{schedule.campaignName}</strong>
        <CampaignTimingBadge endDate={schedule.endDate} startDate={schedule.startDate} />
      </div>
      <span>일정 등록 완료 · {readiness?.label}</span><span>{schedule.settlementStage}</span><CampaignStatusBadge status={status} />
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
        <span>남은 업무 {remainingWorkCount + (readiness?.tasks.length ?? 0)}건</span>
      </div>
    </button>
  )
}
