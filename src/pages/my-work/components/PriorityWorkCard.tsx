import type { WorkItem } from '../../../features/myWork/types'

type PriorityWorkCardProps = {
  item: WorkItem | undefined
  onComplete: (item: WorkItem) => void
  onOpen: (item: WorkItem) => void
}

export function PriorityWorkCard({ item, onComplete, onOpen }: PriorityWorkCardProps) {
  if (!item) return null

  return (
    <section className="priority-work-card">
      <p className="page-eyebrow">오늘 가장 중요한 업무</p>
      <h3>{item.title}</h3>
      <ul>
        <li>담당자: {item.assigneeName}</li>
        <li>마감: 오늘 {item.dueTime}</li>
        <li>공동구매: {item.campaignName}</li>
        <li>이유: {item.createdReason}</li>
      </ul>
      <div className="action-row">
        <button className="primary-button" onClick={() => onOpen(item)} type="button">업무 열기</button>
        <button className="secondary-button" onClick={() => onComplete(item)} type="button">완료 처리</button>
        <button className="secondary-button" onClick={() => onOpen(item)} type="button">일정 보기</button>
      </div>
    </section>
  )
}
