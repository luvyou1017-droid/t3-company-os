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
  if (!schedule.startDate || !schedule.endDate) {
    return '미정'
  }

  const daysUntilStart = getDaysBetweenCalendarDates(today, schedule.startDate)
  const daysAfterEnd = getDaysBetweenCalendarDates(schedule.endDate, today)

  if (daysUntilStart > 0) {
    return `D-${daysUntilStart}`
  }

  if (daysAfterEnd > 0) {
    return `D+${daysAfterEnd}`
  }

  return 'D-Day'
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
