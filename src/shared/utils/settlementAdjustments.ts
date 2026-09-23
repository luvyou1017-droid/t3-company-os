import type { SettlementDeduction } from '../types/settlement'

// Explicit direction wins. Legacy promotions were already labelled as seller payments.
// Legacy manager prepaid reimbursements and pre-distribution costs stay unchanged.
export function isPaymentAdjustment(item: SettlementDeduction) {
  return item.direction === 'payment' || (!item.direction && item.type === 'promotion' && item.applyLocation === 'seller_payment')
}
export function sellerAdditionalPayments(items: SettlementDeduction[], calculationVersion?: number) {
  return items.filter(item => item.reflected && !(calculationVersion === 2 && item.direction) && item.applyLocation === 'seller_payment' && isPaymentAdjustment(item)).reduce((sum,item)=>sum+item.amount,0)
}
export function orderedAdjustments(items: SettlementDeduction[]) {
  const order = {seller:0,company:1,manager:2,brand:3,undecided:4}
  return [...items].sort((a,b)=>Number(isPaymentAdjustment(a))-Number(isPaymentAdjustment(b)) || order[a.costOwner]-order[b.costOwner])
}
