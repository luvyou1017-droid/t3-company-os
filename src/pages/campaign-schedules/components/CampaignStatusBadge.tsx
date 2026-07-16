import type { CampaignStatus } from '../../../features/campaignSchedules/types'

type CampaignStatusBadgeProps = {
  status: CampaignStatus
}

function getStatusTone(status: CampaignStatus) {
  if (status.includes('최종 완료')) {
    return 'complete'
  }

  if (status.includes('정산') || status.includes('지급')) {
    return 'settlement'
  }

  if (status.includes('종료') || status.includes('마감')) {
    return 'danger'
  }

  if (status.includes('진행 중')) {
    return 'progress'
  }

  if (status.includes('일정 픽스')) {
    return 'warning'
  }

  return 'muted'
}

export function CampaignStatusBadge({ status }: CampaignStatusBadgeProps) {
  return <span className={`campaign-status campaign-status--${getStatusTone(status)}`}>{status}</span>
}
