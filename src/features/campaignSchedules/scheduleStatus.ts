import type { CampaignSchedule, CampaignStatus } from './types'

const MS_PER_DAY = 24 * 60 * 60 * 1000

function toCalendarTime(date: string) {
  const [year, month, day] = date.split('-').map(Number)
  return Date.UTC(year, month - 1, day)
}

export function getTodayInSeoul() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    day: '2-digit',
    month: '2-digit',
    timeZone: 'Asia/Seoul',
    year: 'numeric',
  }).formatToParts(new Date())

  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]))

  return `${value.year}-${value.month}-${value.day}`
}

export function getDaysBetweenCalendarDates(fromDate: string, toDate: string) {
  return Math.round((toCalendarTime(toDate) - toCalendarTime(fromDate)) / MS_PER_DAY)
}

export function getCampaignStatus(
  schedule: CampaignSchedule,
  today = getTodayInSeoul(),
): CampaignStatus {
  if (schedule.sellerPaymentCompleted && schedule.managerPaymentCompleted) {
    return '😊 최종 완료'
  }

  if (schedule.managerPaymentCompleted) {
    return '7️⃣ 매니저 정산 완료'
  }

  if (schedule.sellerPaymentCompleted) {
    return '6️⃣ 셀러 정산 완료'
  }

  if (schedule.settlementDocumentCompleted) {
    return '5️⃣ 정산서 완성'
  }

  if (schedule.vendorSettlementCompleted) {
    return '4️⃣ 업체 정산 완료'
  }

  if (schedule.endDate) {
    const daysAfterEnd = getDaysBetweenCalendarDates(schedule.endDate, today)

    if (daysAfterEnd === 1) {
      return '3️⃣ 어제 공구 마감'
    }

    if (daysAfterEnd > 1) {
      return '3️⃣ 공구 종료'
    }
  }

  if (schedule.startDate && schedule.endDate) {
    const startsTodayOrEarlier = getDaysBetweenCalendarDates(schedule.startDate, today) >= 0
    const endsTodayOrLater = getDaysBetweenCalendarDates(today, schedule.endDate) >= 0

    if (startsTodayOrEarlier && endsTodayOrLater) {
      return '2️⃣ 진행 중'
    }

    return '1️⃣ 일정 픽스'
  }

  return '미정'
}

export function getDday(schedule: CampaignSchedule, today = getTodayInSeoul()) {
  return getCampaignTiming(schedule, today).label
}

export type CampaignTiming = {
  label: string
  detail: string
  phase: 'upcoming' | 'today' | 'active' | 'ended' | 'unknown'
  deadlineTone: 'today' | 'tomorrow' | 'normal'
}

export function getCampaignTiming(
  schedule: Pick<CampaignSchedule, 'startDate' | 'endDate'>,
  today = getTodayInSeoul(),
): CampaignTiming {
  if (!schedule.startDate) {
    return { label: '미정', detail: '일정 확인 필요', phase: 'unknown', deadlineTone: 'normal' }
  }

  const daysUntilStart = getDaysBetweenCalendarDates(today, schedule.startDate)

  if (daysUntilStart > 0) {
    return { label: `D-${daysUntilStart}`, detail: `오픈까지 ${daysUntilStart}일`, phase: 'upcoming', deadlineTone: 'normal' }
  }

  const daysUntilEnd = schedule.endDate
    ? getDaysBetweenCalendarDates(today, schedule.endDate)
    : undefined

  if (daysUntilStart === 0) {
    const detail = daysUntilEnd === undefined
      ? '오늘 오픈'
      : daysUntilEnd === 0
        ? '오늘 마감'
        : daysUntilEnd === 1
          ? '내일 마감'
          : `마감까지 ${daysUntilEnd}일`
    const deadlineTone = daysUntilEnd === 0 ? 'today' : daysUntilEnd === 1 ? 'tomorrow' : 'normal'
    return { label: '✅ D-Day', detail, phase: 'today', deadlineTone }
  }

  if (daysUntilEnd === undefined || daysUntilEnd >= 0) {
    const detail = daysUntilEnd === undefined
      ? '종료일 확인 필요'
      : daysUntilEnd === 0
        ? '오늘 마감'
        : daysUntilEnd === 1
          ? '내일 마감'
          : `마감까지 ${daysUntilEnd}일`
    const deadlineTone = daysUntilEnd === 0 ? 'today' : daysUntilEnd === 1 ? 'tomorrow' : 'normal'
    return { label: `✅ D+${Math.abs(daysUntilStart)}`, detail, phase: 'active', deadlineTone }
  }

  return { label: '종료', detail: `종료 후 ${Math.abs(daysUntilEnd)}일`, phase: 'ended', deadlineTone: 'normal' }
}

export function getCampaignSortGroup(schedule: CampaignSchedule, today = getTodayInSeoul()) {
  if (!schedule.startDate) return 4
  if (schedule.startDate === today) return 0
  if (schedule.startDate < today && (!schedule.endDate || schedule.endDate >= today)) return 1
  if (schedule.startDate > today) return 2
  return 3
}

export function compareCampaignSchedules(a: CampaignSchedule, b: CampaignSchedule, today = getTodayInSeoul()) {
  const groupDifference = getCampaignSortGroup(a, today) - getCampaignSortGroup(b, today)
  if (groupDifference) return groupDifference
  const dateDifference = (a.startDate ?? '9999-12-31').localeCompare(b.startDate ?? '9999-12-31')
  return dateDifference || a.campaignName.localeCompare(b.campaignName, 'ko')
}

export function isSettlementPending(schedule: CampaignSchedule, today = getTodayInSeoul()) {
  if (!schedule.endDate) {
    return false
  }

  const isEnded = getDaysBetweenCalendarDates(schedule.endDate, today) > 0
  const isFullyCompleted = schedule.sellerPaymentCompleted && schedule.managerPaymentCompleted

  return isEnded && !isFullyCompleted
}

export function getChecklistRate(schedule: CampaignSchedule) {
  const checks = [
    schedule.landingPageCompleted,
    !schedule.linkReviewPending,
    !schedule.orderPending,
    schedule.pendingCsCount === 0,
    schedule.pendingSampleCount === 0,
    schedule.vendorSettlementCompleted,
    schedule.settlementDocumentCompleted,
    schedule.sellerPaymentCompleted,
    schedule.managerPaymentCompleted,
  ]

  const completedCount = checks.filter(Boolean).length

  return Math.round((completedCount / checks.length) * 100)
}
