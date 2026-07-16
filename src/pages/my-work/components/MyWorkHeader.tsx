import { workNowTime, workToday } from '../../../features/myWork/workPriority'
import type { WorkUser } from '../../../features/myWork/types'
import { UserRoleSwitcher } from './UserRoleSwitcher'

type MyWorkHeaderProps = {
  users: WorkUser[]
  selectedUser: WorkUser
  todayCount: number
  selectedUserId: string
  onUserChange: (userId: string) => void
  onRefresh: () => void
}

export function MyWorkHeader({
  users,
  selectedUser,
  todayCount,
  selectedUserId,
  onUserChange,
  onRefresh,
}: MyWorkHeaderProps) {
  return (
    <section className="my-work-header">
      <div>
        <p className="page-eyebrow">My Work</p>
        <h2>My Work</h2>
        <p className="my-work-subtitle">오늘 해야 할 업무를 우선순위대로 확인하세요.</p>
        <strong className="my-work-greeting">
          안녕하세요, {selectedUser.name}님. 오늘 처리해야 할 업무가 {todayCount}건 있습니다.
        </strong>
      </div>
      <div className="my-work-header__meta">
        <span>{selectedUser.name} / {selectedUser.role}</span>
        <span>오늘 날짜 {workToday}</span>
        <span>현재 시간 {workNowTime}</span>
        <span>마지막 업데이트 {workToday} {workNowTime}</span>
        <button className="secondary-button" onClick={onRefresh} type="button">새로고침</button>
        <UserRoleSwitcher onChange={onUserChange} selectedUserId={selectedUserId} users={users} />
      </div>
    </section>
  )
}
