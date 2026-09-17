import { getCampaignTiming } from '../../features/campaignSchedules/scheduleStatus'

type CampaignTimingBadgeProps = {
  startDate?: string
  endDate?: string
}

export function CampaignTimingBadge({ startDate, endDate }: CampaignTimingBadgeProps) {
  const timing = getCampaignTiming({ startDate, endDate })

  return (
    <div className={`campaign-timing campaign-timing--${timing.phase}`}>
      <strong>{timing.label}</strong>
      <small className={`campaign-timing__detail campaign-timing__detail--${timing.deadlineTone}`}>{timing.detail}</small>
    </div>
  )
}
