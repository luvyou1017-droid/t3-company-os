import type { WorkItem, WorkPriority } from './types'

function koreaNow() {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date())
  const value = (type: string) => parts.find((part) => part.type === type)?.value ?? '00'
  return { date: `${value('year')}-${value('month')}-${value('day')}`, time: `${value('hour')}:${value('minute')}` }
}

export const workToday = () => koreaNow().date
export const workNowTime = () => koreaNow().time

function toDateTimeValue(date: string, time: string) {
  return new Date(`${date}T${time}:00`).getTime()
}

function hoursUntilDue(item: WorkItem) {
  return (toDateTimeValue(item.dueDate, item.dueTime || '18:00') - toDateTimeValue(workToday(), workNowTime())) / 36e5
}

export function isWorkOverdue(item: WorkItem) {
  return item.status !== 'completed' && hoursUntilDue(item) < 0
}

export function isDueToday(item: WorkItem) {
  return item.dueDate === workToday()
}

export function isDueThisWeek(item: WorkItem) {
  const due = new Date(`${item.dueDate}T00:00:00`).getTime()
  const start = new Date(`${workToday()}T00:00:00`).getTime()
  const end = start + 6 * 24 * 60 * 60 * 1000
  return due >= start && due <= end
}

export function calculateWorkPriority(item: WorkItem): WorkPriority {
  if (item.status === 'completed') return 'low'
  if (item.hasLinkError || item.hasPriceError) return 'urgent'
  if (isWorkOverdue(item)) return 'urgent'
  if (isDueToday(item) && hoursUntilDue(item) <= 3) return 'urgent'
  if (item.isDdayCampaign) return 'high'
  if (item.isSettlementDelayed) return 'high'
  if (item.isCsOver24h) return 'high'
  if (isDueToday(item)) return 'high'
  if (isDueThisWeek(item)) return 'medium'
  return 'low'
}

export function getDdayLabel(item: WorkItem) {
  const due = new Date(`${item.dueDate}T00:00:00`).getTime()
  const base = new Date(`${workToday()}T00:00:00`).getTime()
  const diff = Math.round((due - base) / (24 * 60 * 60 * 1000))
  if (diff === 0) return 'D-DAY'
  if (diff > 0) return `D-${diff}`
  return `D+${Math.abs(diff)}`
}
