import type { WithholdingTaxItem } from '../types/withholdingTax'
import type { PaymentRequest } from '../types/sellerSettlement'

export type AccountingRow = {
  id: string; month: string; name: string; owner: string; gross: number;
  base?: number; incomeTax?: number; localTax?: number; net: number; paidAt: string;
  reportStatus: string; paymentStatus: string;
}
// Requests are the source of truth. Missing sidecar rows must never silently hide a payment.
export function accountingRows(items: WithholdingTaxItem[], requests: PaymentRequest[]): AccountingRow[] {
  return requests.flatMap(request => {
    if ((request.businessType !== 'freelancer' && request.evidenceType !== 'withholding_3_3') || ['canceled','rejected','draft'].includes(request.status)) return []
    const matches = items.filter(item => item.status !== 'canceled' && item.settlementId === request.settlementId &&
      item.ownerId === request.recipientId && item.ownerType === request.recipientType && item.sourceVersion === request.sourceVersion &&
      (item.paymentRequestId === request.id || item.id === request.withholdingTaxItemId))
    const item = matches.length === 1 ? matches[0] : undefined
    // Never recalculate past payouts from today's formula or current seller master.
    const incomeTax = request.incomeTaxAmount ?? item?.incomeTaxAmount
    const localTax = request.localIncomeTaxAmount ?? item?.localIncomeTaxAmount
    const base = request.withholdingBaseAmount ?? item?.withholdingBaseAmount
    const typeConflict = request.businessType !== 'freelancer'
    const needsReview = !Number.isFinite(incomeTax) || !Number.isFinite(localTax) || !Number.isFinite(base)
    return [{ id: item?.id ?? request.id, month: item?.paymentMonth || (request.dueDate || request.requestedAt).slice(0,7),
      name: request.recipientName, owner: request.recipientType === 'seller' ? '셀러' : '매니저',
      gross: request.grossSettlementAmount, base, incomeTax, localTax,
      net: request.actualPaidAmount ?? request.finalPaymentAmount, paidAt: request.completedAt ?? item?.paymentDate ?? '',
      reportStatus: typeConflict ? '확인 필요 · 사업자 유형과 증빙 불일치' : needsReview ? '확인 필요 · 저장된 세금 상세 없음' : item?.status ?? 'ready', paymentStatus: request.status }]
  })
}
export function accountingExportRows(rows: AccountingRow[]) {
  return rows.map(row => ({ 귀속월: row.month, 이름: row.name, 지급대상: row.owner, 지급총액: row.gross,
    부가세제외기준금액: row.base ?? '확인 필요', 소득세: row.incomeTax ?? '확인 필요', 지방소득세: row.localTax ?? '확인 필요', 실지급액: row.net, 지급일: row.paidAt,
    신고상태: row.reportStatus, 지급상태: row.paymentStatus }))
}
export const ACCOUNTING_LINK_SECONDS = 14 * 24 * 60 * 60
export function remainingShareSeconds(expiresAt: string, now = Date.now()) {
  return Math.max(0, Math.min(ACCOUNTING_LINK_SECONDS, Math.floor((Date.parse(expiresAt) - now) / 1000)))
}
