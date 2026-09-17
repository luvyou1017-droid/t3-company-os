import { calculateSrookPayFee, DEFAULT_SROOKPAY_FEE_RATE } from '../src/shared/utils/srookPay.ts'

const checks = [
  ['기본 수수료율 3.08%(VAT 포함)', DEFAULT_SROOKPAY_FEE_RATE === 3.08],
  ['제품 순매출과 배송비 합계에 수수료 적용', calculateSrookPayFee(398000, 20000) === 12874],
]

for (const [name, passed] of checks) console.log(`${passed ? 'PASS' : 'FAIL'} ${name}`)
console.log(`TOTAL ${checks.filter(([, passed]) => passed).length}/${checks.length}`)
if (checks.some(([, passed]) => !passed)) process.exitCode = 1
