export type HolidayProvider = {
  isHoliday(date: Date): boolean | undefined
}

const koreaParts = (date: Date) => new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit',
}).formatToParts(date).reduce<Record<string, string>>((parts, part) => {
  if (part.type !== 'literal') parts[part.type] = part.value
  return parts
}, {})

function koreaDate(value: string | Date) {
  const date = typeof value === 'string' ? new Date(value) : value
  if (Number.isNaN(date.getTime())) throw new Error('정산 일정 기준일이 올바르지 않습니다.')
  const parts = koreaParts(date)
  return new Date(Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), 12))
}

const addDays = (date: Date, days: number) => new Date(date.getTime() + days * 86_400_000)

export function calculateSellerSupplyPrice(groupBuyPrice: number, sellerCommissionRate: number) {
  if (!Number.isFinite(groupBuyPrice) || groupBuyPrice < 0) throw new Error('공구가는 0 이상의 유한한 숫자여야 합니다.')
  if (!Number.isFinite(sellerCommissionRate) || sellerCommissionRate < 0 || sellerCommissionRate > 100) throw new Error('셀러 수수료율은 0~100 사이여야 합니다.')
  return Math.round(groupBuyPrice * (1 - sellerCommissionRate / 100))
}

export function calculateSellerSupplyTotal(groupBuyPrice: number, sellerCommissionRate: number, quantity: number) {
  if (!Number.isFinite(quantity) || quantity < 0) throw new Error('판매수량은 0 이상의 유한한 숫자여야 합니다.')
  return calculateSellerSupplyPrice(groupBuyPrice, sellerCommissionRate) * Math.round(quantity)
}

export function formatKoreanDocumentDate(value: string | Date) {
  const parts = koreaParts(typeof value === 'string' ? new Date(value) : value)
  return `${parts.year}.${parts.month}.${parts.day}`
}

export function formatKoreanExportTime(value = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(value).reduce<Record<string, string>>((result, part) => {
    if (part.type !== 'literal') result[part.type] = part.value
    return result
  }, {})
  return `${parts.year}.${parts.month}.${parts.day} ${parts.hour}:${parts.minute}`
}

export function getSellerSettlementSchedule(reference: string | Date, holidayProvider?: HolidayProvider) {
  const referenceDate = koreaDate(reference)
  const day = referenceDate.getUTCDay()
  const mondayBasedDay = day === 0 ? 7 : day
  const friday = addDays(referenceDate, 5 - mondayBasedDay)
  const scheduledMonday = addDays(friday, 3)
  let paymentDate = scheduledMonday
  const mondayHoliday = holidayProvider?.isHoliday(scheduledMonday)
  if (mondayHoliday === true) {
    do paymentDate = addDays(paymentDate, 1)
    while (paymentDate.getUTCDay() === 0 || paymentDate.getUTCDay() === 6 || holidayProvider?.isHoliday(paymentDate) === true)
  }
  return {
    referenceDate,
    evidenceDeadline: friday,
    scheduledMonday,
    paymentDate,
    provisional: true,
    holidayDataConnected: Boolean(holidayProvider),
    adjustedForHoliday: paymentDate.getTime() !== scheduledMonday.getTime(),
  }
}
