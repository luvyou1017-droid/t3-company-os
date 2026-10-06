import { getCampaignStatus } from '../../../features/campaignSchedules/scheduleStatus'
import type { CampaignSchedule } from '../../../features/campaignSchedules/types'

type CampaignSummaryProps = {
  schedules: CampaignSchedule[]
  onCreateClick: () => void
}

export function CampaignSummary({ schedules, onCreateClick }: CampaignSummaryProps) {
  const ended = schedules.filter((schedule) => getCampaignStatus(schedule).includes('판매 종료'))
  const uploadPending = ended.filter((schedule) => schedule.salesReviewStatus === '업로드 대기').length
  const salesConfirmed = ended.filter((schedule) => schedule.salesReviewStatus === '확정 완료').length
  const otherSales = ended.length - uploadPending - salesConfirmed
  const counts = {
    전체: schedules.length,
    '일정 픽스': schedules.filter((schedule) => getCampaignStatus(schedule).includes('일정 픽스'))
      .length,
    '진행 중': schedules.filter((schedule) => getCampaignStatus(schedule).includes('진행 중')).length,
    '판매 종료': ended.length,
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

      <p className="schedule-summary__scope">공동구매 일정 단계별 건수</p>
      <div className="schedule-summary__grid">
        {Object.entries(counts).map(([label, count]) => (
          <article className="summary-count-card" key={label}>
            <span>{label}</span>
            <strong>{count}</strong>
            {label === '판매 종료' && <small>판매 데이터: 업로드 대기 {uploadPending} · 확정 완료 {salesConfirmed}{otherSales > 0 ? ` · 기타/확인 필요 ${otherSales}` : ''}</small>}
          </article>
        ))}
      </div>
      <p className="schedule-summary__note">판매 종료는 일정 단계입니다. 정산 중인 공구는 별도로 집계하며, 각 공구의 판매 데이터 상태는 위처럼 구분합니다.</p>
    </section>
  )
}
