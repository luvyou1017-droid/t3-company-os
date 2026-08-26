import { formatKoreanDate, formatKoreanDateTime } from './koreanDate.ts'

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

export type SellerProductSubtotalRow = { unitPrice: number; netQuantity: number; sellerCommissionRate?: number }

export function calculateSellerProductRow(row: SellerProductSubtotalRow, sellerCommissionRate: number) {
  if (!Number.isFinite(row.netQuantity) || row.netQuantity < 0) throw new Error('판매수량은 0 이상의 유한한 숫자여야 합니다.')
  if (!Number.isFinite(row.unitPrice) || row.unitPrice < 0) throw new Error('공구가는 0 이상의 유한한 숫자여야 합니다.')
  const effectiveCommissionRate = row.sellerCommissionRate ?? sellerCommissionRate
  const quantity = Math.round(row.netQuantity)
  const salesAmount = quantity * row.unitPrice
  return {
    quantity,
    supplyPrice: calculateSellerSupplyPrice(row.unitPrice, effectiveCommissionRate),
    supplyTotal: calculateSellerSupplyTotal(row.unitPrice, effectiveCommissionRate, quantity),
    salesAmount,
    commissionAmount: Math.round(salesAmount * effectiveCommissionRate / 100),
  }
}

export function calculateSellerProductSubtotal(rows: SellerProductSubtotalRow[], sellerCommissionRate: number) {
  return rows.reduce((subtotal, row) => {
    const item = calculateSellerProductRow(row, sellerCommissionRate)
    return {
      quantity: subtotal.quantity + item.quantity,
      supplyTotal: subtotal.supplyTotal + item.supplyTotal,
      salesAmount: subtotal.salesAmount + item.salesAmount,
      commissionAmount: subtotal.commissionAmount + item.commissionAmount,
    }
  }, { quantity: 0, supplyTotal: 0, salesAmount: 0, commissionAmount: 0 })
}

export function calculateManagerProductRow(row: SellerProductSubtotalRow, totalCommissionRate: number) {
  if (!Number.isFinite(totalCommissionRate) || totalCommissionRate < 0 || totalCommissionRate > 100) throw new Error('총수수료율은 0 이상 100 이하의 유한한 숫자여야 합니다.')
  if (!Number.isFinite(row.netQuantity) || row.netQuantity < 0) throw new Error('판매수량은 0 이상의 유한한 숫자여야 합니다.')
  if (!Number.isFinite(row.unitPrice) || row.unitPrice < 0) throw new Error('공구가는 0 이상의 유한한 숫자여야 합니다.')
  const quantity = Math.round(row.netQuantity)
  const supplyPrice = Math.round(row.unitPrice * (1 - totalCommissionRate / 100))
  const unitCommission = row.unitPrice - supplyPrice
  return {
    quantity,
    supplyPrice,
    unitCommission,
    salesCommission: unitCommission * quantity,
  }
}

export function formatKoreanDocumentDate(value: string | Date) {
  return formatKoreanDate(value)
}

export function formatKoreanExportTime(value = new Date()) {
  return formatKoreanDateTime(value)
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
