import { useState } from 'react'
import { calculateWorkPriority } from '../../../features/myWork/workPriority'
import type { WorkItem, WorkUser } from '../../../features/myWork/types'
import { openCampaignDetail } from '../../../shared/utils/campaignNavigation'

type WorkDetailDrawerProps = {
  item: WorkItem | null
  users: WorkUser[]
  onClose: () => void
  onCompleteClick: (item: WorkItem) => void
  onUpdateItem: (item: WorkItem) => void
}

export function WorkDetailDrawer({ item, users, onClose, onCompleteClick, onUpdateItem }: WorkDetailDrawerProps) {
  const [newDueDate, setNewDueDate] = useState('')
  if (!item) return null

  const changeAssignee = (userId: string) => {
    const user = users.find((value) => value.id === userId)
    if (!user) return
    onUpdateItem({
      ...item,
      assigneeId: user.id,
      assigneeName: user.name,
      assigneeRole: user.role,
      activityLogs: [...item.activityLogs, { id: crypto.randomUUID(), at: '2026-07-15 11:00', message: `담당자를 ${user.name}님으로 변경했습니다.` }],
    })
  }

  const changeDueDate = () => {
    if (!newDueDate) return
    onUpdateItem({
      ...item,
      dueDate: newDueDate,
      activityLogs: [...item.activityLogs, { id: crypto.randomUUID(), at: '2026-07-15 11:00', message: `마감일을 ${newDueDate}로 변경했습니다.` }],
    })
  }

  return (
    <div className="drawer-backdrop" onClick={onClose}>
      <aside className="preview-drawer work-detail-drawer" onClick={(event) => event.stopPropagation()}>
        <div className="preview-drawer__header">
          <div><p className="page-eyebrow">{item.workType}</p><h2>{item.title}</h2></div>
          <button className="icon-button" onClick={onClose} type="button">×</button>
        </div>
        <span className={`work-priority work-priority--${calculateWorkPriority(item)}`}>우선순위 {calculateWorkPriority(item)}</span>
        <dl className="preview-list">
          {[
            ['관련 공동구매', item.campaignName], ['셀러', item.sellerName], ['브랜드', item.brandName],
            ['담당자', `${item.assigneeName} / ${item.assigneeRole}`], ['마감', `${item.dueDate} ${item.dueTime}`],
            ['업무 설명', item.description], ['생성 이유', item.createdReason], ['관련 체크리스트', item.checklistName],
            ['관련 링크', item.relatedLink],
          ].map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}
        </dl>
        <section className="drawer-control">
          <label><span>담당자 변경</span><select onChange={(event) => changeAssignee(event.target.value)} value={item.assigneeId}>{users.map((user) => <option key={user.id} value={user.id}>{user.name}</option>)}</select></label>
          <label><span>마감일 변경</span><input type="date" value={newDueDate} onChange={(event) => setNewDueDate(event.target.value)} /></label>
          <button className="secondary-button" onClick={changeDueDate} type="button">마감일 변경</button>
        </section>
        <section className="activity-log">
          <h3>이전 처리 이력</h3>
          {item.activityLogs.map((log) => <p key={log.id}>{log.at} · {log.message}</p>)}
        </section>
        <div className="preview-drawer__actions">
          <button className="primary-button" onClick={() => onCompleteClick(item)} type="button">완료 처리</button>
          <button className="secondary-button" onClick={() => changeAssignee(item.assigneeId)} type="button">담당자 변경</button>
          <button className="secondary-button" onClick={() => onUpdateItem({ ...item, status: 'on_hold', activityLogs: [...item.activityLogs, { id: crypto.randomUUID(), at: '2026-07-15 11:00', message: '업무를 보류 처리했습니다.' }] })} type="button">보류</button>
          <button className="secondary-button" onClick={() => openCampaignDetail(item.campaignId, 'work')} type="button">공동구매 상세 보기</button>
          <button className="secondary-button" onClick={onClose} type="button">닫기</button>
        </div>
      </aside>
    </div>
  )
}
