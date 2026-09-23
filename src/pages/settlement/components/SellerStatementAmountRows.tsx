import { formatCurrency } from '../../../shared/utils/salesData'

// Display-only separation. Payout, receivable ledger, and snapshots are unchanged.
export function sellerStatementAmount(commission: number, deductions: number, payments = 0) {
  return commission - deductions + payments
}
export function SellerStatementAmountRows({ amount, payout, receivable }: { amount: number; payout: number; receivable: number }) {
  return <>
    <tr className="seller-summary-total"><th colSpan={3}>정산금액 <small>(부가세 포함)</small></th><td className="amount-cell">{formatCurrency(amount)}</td></tr>
    <tr><th colSpan={3}>실제 지급액</th><td className="amount-cell">{formatCurrency(payout)}</td></tr>
    {receivable > 0 && <tr><th colSpan={3}>미수금 발생</th><td className="amount-cell">{formatCurrency(receivable)}</td></tr>}
  </>
}
