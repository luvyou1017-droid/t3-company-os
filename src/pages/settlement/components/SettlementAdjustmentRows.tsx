import { adjustmentLabel, namedAdjustmentRows } from '../../../shared/utils/settlementAdjustmentLabels'
import { calculateDeductions, getSettlementCostBreakdown } from '../../../shared/utils/settlement'
import type { SettlementCalculationSnapshot, SettlementDeduction } from '../../../shared/types/settlement'
import { isPaymentAdjustment, orderedAdjustments } from '../../../shared/utils/settlementAdjustments'
import { formatCurrency } from '../../../shared/utils/salesData'
export function SettlementAdjustmentRows({items}:{items:SettlementDeduction[]}) {
 const rows=orderedAdjustments(items.filter(item=>item.reflected && (item.direction || isPaymentAdjustment(item) || ['net_company_commission', 'net_company_commission_credit', 'manager_reimbursement'].includes(item.applyLocation))))
 if(!rows.length)return null
 const labels={seller:'셀러',company:'회사',manager:'매니저',brand:'공급사',undecided:'확인 필요'}
 return <details><summary>차감·지급내역 상세보기</summary><table className="seller-document__table"><thead><tr><th>구분</th><th>항목</th><th>부담 주체 / 지급 대상</th><th>단가</th><th>수량</th><th>반영금액</th></tr></thead><tbody>{rows.map(item=><tr key={item.id}><td>{(isPaymentAdjustment(item) || item.applyLocation === 'net_company_commission_credit')?'지급내역':'차감내역'}</td><td>{adjustmentLabel(item)}</td><td>{item.applyLocation === 'manager_reimbursement' ? '회사 부담(매니저 선지급) · 매니저 환급' : <>{labels[item.costOwner]} {(isPaymentAdjustment(item) || item.applyLocation === 'net_company_commission_credit')?'지급':'부담'}</>}</td><td>{item.unitPrice === undefined ? '—' : formatCurrency(item.unitPrice)}</td><td>{item.quantity ?? '—'}</td><td>{(isPaymentAdjustment(item) || item.applyLocation === 'net_company_commission_credit')?'+':'−'} {formatCurrency(item.amount)}</td></tr>)}</tbody></table></details>
}

export function SettlementPaymentRow({ amount = 0, items = [] }: { amount?: number; items?: SettlementDeduction[] }) {
  const payments = calculateDeductions(items).distributionPayments
  return <>{namedAdjustmentRows(payments, amount, '지급내역').map(row => <tr key={row.id} className="settlement-payment-credit"><th>+ {row.label}</th><td className="amount-cell">+ {formatCurrency(row.amount)}</td></tr>)}</>
}

export function SettlementCostRows({ calculation }: { calculation: SettlementCalculationSnapshot }) {
  const costs = getSettlementCostBreakdown(calculation)
  const total = costs.eventCost + costs.srookPayFee + costs.otherCost
  const items = calculateDeductions(calculation.deductions).distributionCosts
  return <>{namedAdjustmentRows(items, total, '차감·조정비용').map(row => <tr key={row.id} className="manager-calculation-deduction"><th>− {row.label}</th><td className="amount-cell">− {formatCurrency(row.amount)}</td></tr>)}</>
}
