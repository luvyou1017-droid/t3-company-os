import { SampleCollectionAlerts } from '../sample-management/components/SampleCollectionAlerts'
import { useEffect, useMemo, useState } from 'react'
import { workUsers } from '../../features/myWork/mockData'
import { useCompanyAuth } from '../../features/auth/AuthGate'
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
  const { profile } = useCompanyAuth()
  const ownUser = workUsers.find((user) => user.name === profile.display_name)
  const canViewTeam = ['ceo', 'admin', 'team_lead'].includes(profile.role)
  const [selectedUserId, setSelectedUserId] = useState(ownUser?.id ?? profile.id)
  const [items, setItems] = useState<WorkItem[]>(() => workService.listWorkItems())
  const [filter, setFilter] = useState<WorkFilter>(initialFilter)
  const [selectedItem, setSelectedItem] = useState<WorkItem | null>(null)
  const [completeTarget, setCompleteTarget] = useState<WorkItem | null>(null)
  const [briefingNonce, setBriefingNonce] = useState(0)
  const [copyStatus, setCopyStatus] = useState('')
  const refresh = () => { setItems(workService.listWorkItems()); setBriefingNonce((value) => value + 1); setCopyStatus('') }

  useEffect(() => {
    const sync = () => setItems(workService.listWorkItems())
    window.addEventListener('t3-storage-updated', sync)
    return () => window.removeEventListener('t3-storage-updated', sync)
  }, [])

  const selectedUser = workUsers.find((user) => user.id === selectedUserId) ?? { id: profile.id, name: profile.display_name, role: '매니저' as const }
  const userItems = items.filter((item) => item.assigneeId === selectedUser.id || (!ownUser && item.assigneeName === selectedUser.name))

  const summary = useMemo(() => ({
    '오늘 업무': userItems.filter((item) => isDueToday(item) && item.status !== 'completed').length,
    '긴급 업무': userItems.filter((item) => calculateWorkPriority(item) === 'urgent').length,
    '지연 업무': userItems.filter(isWorkOverdue).length,
    '오늘 마감': userItems.filter((item) => item.dueDate === workToday() && item.status !== 'completed').length,
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
    지연: filteredItems.filter((item) => isWorkOverdue(item)),
    긴급: filteredItems.filter((item) => !isWorkOverdue(item) && calculateWorkPriority(item) === 'urgent' && item.status !== 'completed'),
    오늘: filteredItems.filter((item) => !isWorkOverdue(item) && isDueToday(item) && calculateWorkPriority(item) !== 'urgent' && item.status !== 'completed'),
    '이번 주': filteredItems.filter((item) => !isWorkOverdue(item) && isDueThisWeek(item) && !isDueToday(item) && calculateWorkPriority(item) !== 'urgent' && item.status !== 'completed'),
    '이후 예정': filteredItems.filter((item) => !isWorkOverdue(item) && !isDueThisWeek(item) && item.status !== 'completed'),
    완료: filteredItems.filter((item) => item.status === 'completed'),
  }

  const topPriorityWork = userItems
    .filter((item) => item.status !== 'completed')
    .sort((a, b) => {
      const weight = { urgent: 0, high: 1, medium: 2, low: 3 }
      return weight[calculateWorkPriority(a)] - weight[calculateWorkPriority(b)]
    })[0]

  const briefingItems = [...userItems.filter((item) => item.status !== 'completed' && (isWorkOverdue(item) || isDueToday(item)))].sort((a, b) => a.dueAt.localeCompare(b.dueAt))
  const briefing = `${selectedUser.name}님, ${workToday()} 업무 안내\n지연 ${summary['지연 업무']}건 · 오늘 ${summary['오늘 업무']}건\n${briefingItems.length ? briefingItems.slice(0, 12).map((item, index) => `${index + 1}. ${item.campaignName} · ${item.title} (${isWorkOverdue(item) ? '지연' : item.dueTime || '오늘'})`).join('\n') : '오늘 또는 지연된 등록 업무가 없습니다.'}${briefingItems.length > 12 ? `\n외 ${briefingItems.length - 12}건은 내 업무에서 확인해주세요.` : ''}`

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
      <SampleCollectionAlerts />
      <MyWorkHeader
        onRefresh={refresh}
        onUserChange={(userId) => {
          setSelectedUserId(userId)
          setFilter(initialFilter)
        }}
        selectedUser={selectedUser}
        selectedUserId={selectedUserId}
        todayCount={summary['오늘 업무']}
        users={canViewTeam ? workUsers : [selectedUser]}
      />
      <WorkSummaryCards activeQuick={filter.quick} onSelect={(quick) => setFilter({ ...filter, quick })} summary={summary} />
      <DailyBriefingCard
        key={briefingNonce}
        message={briefing}
        copyStatus={copyStatus}
        onCopy={() => void navigator.clipboard.writeText(briefing).then(() => setCopyStatus('업무 안내를 복사했습니다. 카카오톡에 붙여넣어 전달할 수 있습니다.')).catch(() => setCopyStatus('복사에 실패했습니다. 브라우저의 클립보드 권한을 확인해주세요.'))}
        onImportantOnly={() => setFilter({ ...filter, quick: '긴급' })}
        onRefresh={refresh}
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
