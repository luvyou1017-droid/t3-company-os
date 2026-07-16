import {
  getCampaignStatus,
  getChecklistRate,
  getDday,
} from '../../../features/campaignSchedules/scheduleStatus'
import type { CampaignSchedule } from '../../../features/campaignSchedules/types'
import { CampaignStatusBadge } from './CampaignStatusBadge'

type CampaignPreviewDrawerProps = {
  schedule: CampaignSchedule | null
  onClose: () => void
  onOpenDetail: (scheduleId: string) => void
}

function toDoneText(value: boolean) {
  return value ? '완료' : '미완료'
}

export function CampaignPreviewDrawer({ schedule, onClose, onOpenDetail }: CampaignPreviewDrawerProps) {
  if (!schedule) {
    return null
  }

  const status = getCampaignStatus(schedule)
  const checklistRate = getChecklistRate(schedule)

  return (
    <div className="drawer-backdrop" onClick={onClose}>
      <aside
        aria-label="공동구매 일정 preview"
        className="preview-drawer"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="preview-drawer__header">
          <div>
            <p className="page-eyebrow">{getDday(schedule)}</p>
            <h2>{schedule.campaignName}</h2>
          </div>
          <button className="icon-button" onClick={onClose} type="button" aria-label="닫기">
            ×
          </button>
        </div>

        <CampaignStatusBadge status={status} />

        <dl className="preview-list">
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
            <dt>담당 매니저</dt>
            <dd>{schedule.managerName}</dd>
          </div>
          <div>
            <dt>MD</dt>
            <dd>{schedule.mdName}</dd>
          </div>
          <div>
            <dt>판매 기간</dt>
            <dd>
              {schedule.startDate && schedule.endDate
                ? `${schedule.startDate} - ${schedule.endDate}`
                : '미정'}
            </dd>
          </div>
          <div>
            <dt>링크 주체</dt>
            <dd>{schedule.linkOwner}</dd>
          </div>
          <div>
            <dt>오늘 해야 할 일</dt>
            <dd>{schedule.todayTask}</dd>
          </div>
          <div>
            <dt>체크리스트 완료율</dt>
            <dd>{checklistRate}%</dd>
          </div>
          <div>
            <dt>미처리 CS 수</dt>
            <dd>{schedule.pendingCsCount}건</dd>
          </div>
          <div>
            <dt>샘플 업무 수</dt>
            <dd>{schedule.pendingSampleCount}건</dd>
          </div>
          <div>
            <dt>업체 정산 상태</dt>
            <dd>{toDoneText(schedule.vendorSettlementCompleted)}</dd>
          </div>
          <div>
            <dt>정산서 상태</dt>
            <dd>{toDoneText(schedule.settlementDocumentCompleted)}</dd>
          </div>
          <div>
            <dt>셀러 지급 상태</dt>
            <dd>{toDoneText(schedule.sellerPaymentCompleted)}</dd>
          </div>
          <div>
            <dt>매니저 지급 상태</dt>
            <dd>{toDoneText(schedule.managerPaymentCompleted)}</dd>
          </div>
        </dl>

        <div className="preview-drawer__actions">
          <button className="primary-button" onClick={() => onOpenDetail(schedule.id)} type="button">
            상세 보기
          </button>
          <button className="secondary-button" type="button">
            오늘 업무 보기
          </button>
          <button className="secondary-button" onClick={onClose} type="button">
            닫기
          </button>
        </div>
      </aside>
    </div>
  )
}
