import type { Settlement } from '../types/settlement'

// Completed settlements stay in the working list for one calendar month after the last payment.
// This changes only visibility; the settlement, payment requests, and snapshots are untouched.
export function isArchivedSettlement(settlement: Settlement, today: string) {
  if (!['completed', 'partially_paid'].includes(settlement.status) || !settlement.sellerPaymentCompleted || !settlement.managerPaymentCompleted) return false
  const completedAt = [settlement.sellerPaymentCompletedAt, settlement.managerPaymentCompletedAt].filter(Boolean).sort().at(-1) ?? settlement.updatedAt
  const completedDate = completedAt?.includes('T')
    ? new Date(completedAt).toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' })
    : completedAt?.slice(0, 10)
  if (!completedDate || !/^\d{4}-\d{2}-\d{2}$/.test(completedDate)) return false
  const [year, month, day] = completedDate.split('-').map(Number)
  const lastDayNextMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate()
  const archiveDate = new Date(Date.UTC(year, month, Math.min(day, lastDayNextMonth))).toISOString().slice(0, 10)
  return archiveDate <= today
}
