import { calculateSellerSupplyPrice, calculateSellerSupplyTotal, formatKoreanExportTime, getSellerSettlementSchedule } from '../src/shared/utils/settlementDocument.ts'

const schedule = getSellerSettlementSchedule('2026-08-26T01:00:00.000Z')
const holidaySchedule = getSellerSettlementSchedule('2026-08-26T01:00:00.000Z', { isHoliday: (date) => date.toISOString().startsWith('2026-08-31') })
const checks = [
  ['셀러 공급가 원화 반올림', calculateSellerSupplyPrice(14_000, 29) === 9_940],
  ['SKU 공급가 합계', calculateSellerSupplyTotal(14_000, 29, 25) === 248_500],
  ['증빙 마감 금요일', schedule.evidenceDeadline.toISOString().startsWith('2026-08-28')],
  ['다음 주 월요일 지급', schedule.paymentDate.toISOString().startsWith('2026-08-31')],
  ['공휴일 provider 다음 영업일', holidaySchedule.paymentDate.toISOString().startsWith('2026-09-01') && holidaySchedule.adjustedForHoliday],
  ['한국 시간 export 포맷', formatKoreanExportTime(new Date('2026-08-26T01:42:00.000Z')) === '2026.08.26 10:42'],
]

checks.forEach(([label, passed]) => console.log(`${passed ? 'PASS' : 'FAIL'} ${label}`))
console.log(`TOTAL ${checks.filter(([, passed]) => passed).length}/${checks.length}`)
if (checks.some(([, passed]) => !passed)) process.exitCode = 1
