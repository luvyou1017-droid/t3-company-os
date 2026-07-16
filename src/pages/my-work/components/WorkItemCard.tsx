import { calculateWorkPriority, getDdayLabel } from '../../../features/myWork/workPriority'
import type { WorkItem, WorkPriority } from '../../../features/myWork/types'

type WorkItemCardProps = {
  item: WorkItem
  onOpen: (item: WorkItem) => void
}

const priorityLabel: Record<WorkPriority, string> = {
  urgent: '긴급',
  high: '높음',
  medium: '보통',
  low: '낮음',
}

export function WorkItemCard({ item, onOpen }: WorkItemCardProps) {
  const priority = calculateWorkPriority(item)
  return (
    <button className="work-item-card" onClick={() => onOpen(item)} type="button">
      <div className="work-item-card__top">
        <span className={`work-priority work-priority--${priority}`}>● {priorityLabel[priority]}</span>
        <span>{getDdayLabel(item)} · {item.dueTime}</span>
      </div>
      <h4>{item.title}</h4>
      <p>{item.createdReason}</p>
      <dl>
        <div><dt>유형</dt><dd>{item.workType}</dd></div>
        <div><dt>공동구매</dt><dd>{item.campaignName}</dd></div>
        <div><dt>셀러</dt><dd>{item.sellerName}</dd></div>
        <div><dt>담당자</dt><dd>{item.assigneeName}</dd></div>
      </dl>
      <div className="work-item-card__bottom">
        <span>{item.relatedMenu}</span>
        <strong>{item.status === 'completed' ? '완료' : '미완료'}</strong>
      </div>
    </button>
  )
}
