import { getCampaignStatus } from '../../../features/campaignSchedules/scheduleStatus'
import type { CampaignSchedule } from '../../../features/campaignSchedules/types'

type CampaignSummaryProps = {
  schedules: CampaignSchedule[]
  onCreateClick: () => void
}

export function CampaignSummary({ schedules, onCreateClick }: CampaignSummaryProps) {
  const counts = {
    전체: schedules.length,
    '일정 픽스': schedules.filter((schedule) => getCampaignStatus(schedule).includes('일정 픽스'))
      .length,
    '진행 중': schedules.filter((schedule) => getCampaignStatus(schedule).includes('진행 중')).length,
    '공구 종료': schedules.filter((schedule) => {
      const status = getCampaignStatus(schedule)
      return status.includes('공구 종료') || status.includes('공구 마감')
    }).length,
    '정산 중': schedules.filter((schedule) => {
      const status = getCampaignStatus(schedule)
      return (
        status.includes('업체 정산') ||
        status.includes('정산서') ||
        status.includes('셀러 정산') ||
        status.includes('매니저 정산')
      )
    }).length,
    '최종 완료': schedules.filter((schedule) => getCampaignStatus(schedule).includes('최종 완료')).length,
  }

  return (
    <section className="schedule-summary">
      <div className="schedule-summary__title">
        <div>
          <p className="page-eyebrow">Campaign Schedule</p>
          <h2>공동구매 일정</h2>
        </div>
        <button className="primary-button" onClick={onCreateClick} type="button">
          새 일정 등록
        </button>
      </div>

      <div className="schedule-summary__grid">
        {Object.entries(counts).map(([label, count]) => (
          <article className="summary-count-card" key={label}>
            <span>{label}</span>
            <strong>{count}</strong>
          </article>
        ))}
      </div>
    </section>
  )
}
