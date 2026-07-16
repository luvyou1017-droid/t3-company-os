import { useMemo, useState } from 'react'
import { dailyBriefings, workUsers } from '../../features/myWork/mockData'
import { workService } from '../../features/cs/services/workService'
import {
  calculateWorkPriority,
  isDueThisWeek,
  isDueToday,
  isWorkOverdue,
  workToday,
} from '../../features/myWork/workPriority'
import type { WorkFilter, WorkItem } from '../../features/myWork/types'
import { CompleteWorkModal } from './components/CompleteWorkModal'
import { DailyBriefingCard } from './components/DailyBriefingCard'
import { MyWorkHeader } from './components/MyWorkHeader'
import { PriorityWorkCard } from './components/PriorityWorkCard'
import { WorkDetailDrawer } from './components/WorkDetailDrawer'
import { WorkFilters } from './components/WorkFilters'
import { WorkGroupSection } from './components/WorkGroupSection'
import { WorkSummaryCards } from './components/WorkSummaryCards'

const initialFilter: WorkFilter = {
  quick: '전체',
  workType: '',
  campaignName: '',
  assigneeName: '',
  date: '',
  search: '',
}

function matchesQuickFilter(item: WorkItem, quick: WorkFilter['quick']) {
  if (quick === '전체') return true
  if (quick === '긴급') return calculateWorkPriority(item) === 'urgent'
  if (quick === '오늘') return isDueToday(item) && item.status !== 'completed'
  if (quick === '지연') return isWorkOverdue(item)
  if (quick === '완료') return item.status === 'completed'
  if (quick === '승인 대기') return item.workType.includes('승인')
  return isDueThisWeek(item)
}

export function MyWorkPage() {
  const [selectedUserId, setSelectedUserId] = useState('u-001')
  const [items, setItems] = useState<WorkItem[]>(() => workService.listWorkItems())
  const [filter, setFilter] = useState<WorkFilter>(initialFilter)
  const [selectedItem, setSelectedItem] = useState<WorkItem | null>(null)
  const [completeTarget, setCompleteTarget] = useState<WorkItem | null>(null)
  const [briefingNonce, setBriefingNonce] = useState(0)

  const selectedUser = workUsers.find((user) => user.id === selectedUserId) ?? workUsers[0]
  const userItems = items.filter((item) => item.assigneeId === selectedUser.id)

  const summary = useMemo(() => ({
    '오늘 업무': userItems.filter((item) => isDueToday(item) && item.status !== 'completed').length,
    '긴급 업무': userItems.filter((item) => calculateWorkPriority(item) === 'urgent').length,
    '지연 업무': userItems.filter(isWorkOverdue).length,
    '오늘 마감': userItems.filter((item) => item.dueDate === workToday).length,
    '승인 대기': userItems.filter((item) => item.workType.includes('승인')).length,
    '이번 주 예정': userItems.filter(isDueThisWeek).length,
  }), [userItems])

  const filteredItems = useMemo(() => {
    const search = filter.search.trim().toLowerCase()
    return userItems.filter((item) => {
      const searchMatched =
        !search ||
        item.title.toLowerCase().includes(search) ||
        item.campaignName.toLowerCase().includes(search) ||
        item.sellerName.toLowerCase().includes(search)

      return (
        searchMatched &&
        matchesQuickFilter(item, filter.quick) &&
        (!filter.workType || item.workType === filter.workType) &&
        (!filter.campaignName || item.campaignName === filter.campaignName) &&
        (!filter.assigneeName || item.assigneeName === filter.assigneeName) &&
        (!filter.date || item.dueDate === filter.date)
      )
    })
  }, [filter, userItems])

  const grouped = {
    긴급: filteredItems.filter((item) => calculateWorkPriority(item) === 'urgent' && item.status !== 'completed'),
    오늘: filteredItems.filter((item) => isDueToday(item) && calculateWorkPriority(item) !== 'urgent' && item.status !== 'completed'),
    지연: filteredItems.filter((item) => isWorkOverdue(item)),
    '이번 주': filteredItems.filter((item) => isDueThisWeek(item) && !isDueToday(item) && item.status !== 'completed'),
    완료: filteredItems.filter((item) => item.status === 'completed'),
  }

  const topPriorityWork = userItems
    .filter((item) => item.status !== 'completed')
    .sort((a, b) => {
      const weight = { urgent: 0, high: 1, medium: 2, low: 3 }
      return weight[calculateWorkPriority(a)] - weight[calculateWorkPriority(b)]
    })[0]

  const briefing = dailyBriefings.find((item) => item.userId === selectedUser.id)?.message ?? ''

  const updateItem = (nextItem: WorkItem) => {
    setItems((current) => {
      const nextItems = current.map((item) => (item.id === nextItem.id ? nextItem : item))
      workService.saveWorkItems(nextItems)
      return nextItems
    })
    setSelectedItem(nextItem)
  }

  const completeItem = (itemId: string, memo: string, completedAt: string) => {
    setItems((current) => {
      const nextItems = current.map((item) =>
        item.id === itemId
          ? {
              ...item,
              status: 'completed' as const,
              completedAt,
              activityLogs: [...item.activityLogs, { id: crypto.randomUUID(), at: completedAt, message: memo }],
            }
          : item,
      )
      workService.saveWorkItems(nextItems)
      return nextItems
    })
    setCompleteTarget(null)
    setSelectedItem(null)
  }

  return (
    <section className="my-work-page">
      <MyWorkHeader
        onRefresh={() => setBriefingNonce((value) => value + 1)}
        onUserChange={(userId) => {
          setSelectedUserId(userId)
          setFilter(initialFilter)
        }}
        selectedUser={selectedUser}
        selectedUserId={selectedUserId}
        todayCount={summary['오늘 업무']}
        users={workUsers}
      />
      <WorkSummaryCards activeQuick={filter.quick} onSelect={(quick) => setFilter({ ...filter, quick })} summary={summary} />
      <DailyBriefingCard
        key={briefingNonce}
        message={briefing}
        onImportantOnly={() => setFilter({ ...filter, quick: '긴급' })}
        onRefresh={() => setBriefingNonce((value) => value + 1)}
      />
      <PriorityWorkCard item={topPriorityWork} onComplete={setCompleteTarget} onOpen={setSelectedItem} />
      <section className="panel">
        <div className="panel__header">
          <div><h2>업무 목록</h2><p>우선순위와 마감 기준으로 개인 업무를 정리합니다.</p></div>
          <strong className="result-count">{filteredItems.length}건</strong>
        </div>
        <div className="my-work-list-body">
          <WorkFilters filter={filter} items={userItems} onChange={setFilter} />
          {Object.entries(grouped).map(([title, groupItems]) => (
            <WorkGroupSection items={groupItems} key={title} onOpen={setSelectedItem} title={title} />
          ))}
        </div>
      </section>
      <WorkDetailDrawer
        item={selectedItem}
        onClose={() => setSelectedItem(null)}
        onCompleteClick={setCompleteTarget}
        onUpdateItem={updateItem}
        users={workUsers}
      />
      <CompleteWorkModal item={completeTarget} onClose={() => setCompleteTarget(null)} onComplete={completeItem} />
    </section>
  )
}
