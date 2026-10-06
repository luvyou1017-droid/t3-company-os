import type { SampleOrder, SampleOrderDraft, SamplePayer } from './sampleOrderModel.ts'
import type { Campaign } from '../../shared/types/campaign'
import type { Settlement } from '../../shared/types/settlement'

export const PROVISION_METHODS = ['무상 제공', '유상 구매', '대여', '테스트 후 진행', '조건부 제공', '진행 시 협의'] as const
export const PAYMENT_METHODS = ['셀러 즉시 입금', '회사 선입금', '매니저 선입금', '정산 시 상계', '공급사 후정산', '기타'] as const
export const LOAN_STATUSES = ['대여 요청', '발송 완료', '사용 중', '반납 대기', '수거 필요', '수거 중', '반납 완료', '분실/파손'] as const
export const SUPPLIER_STATUSES = ['공급사 정산 미완료', '지급 요청', '지급 승인', '지급 완료'] as const
export type Shares = Record<SamplePayer, number>
export type Burden = { mode: 'free' | 'percent' | 'amount'; shares: Shares }
export type ProvisionSnapshot = {
  version: 1; capturedAt: string; method: typeof PROVISION_METHODS[number]; provider: string
  unitPrice: number | null; shippingFee: number; burden: Burden
  threshold: number | null; achieved: Burden; missed: Burden; agreedTerms: string
  paymentMethod: typeof PAYMENT_METHODS[number]; orderMethod: string; landing: string
}
export type SampleOperations = {
  depositRequestedAt: string; depositExpected: number | null; depositReceived: boolean
  depositReceivedAt: string; depositConfirmedBy: string; offsetCompleted: boolean
  supplierStatus: typeof SUPPLIER_STATUSES[number]
  loanStatus: typeof LOAN_STATUSES[number]; shippedAt: string; collectionDate: string; collectionMemo: string
  testStatus: '테스트 중' | '진행 확정' | '진행 안 함'; reviewRecovery: boolean; reviewCost: boolean
}
export type SampleLine = { productId: string; skuId: string; productName: string; optionName: string; detailOption: string; quantity: number; unitPrice: number | null; supplierId?: string; supplierName?: string }
export const zeroShares = (): Shares => ({ seller: 0, company: 0, supplier: 0, manager: 0 })
export const blankBurden = (): Burden => ({ mode: 'percent', shares: { ...zeroShares(), seller: 100 } })
export const blankProvision = (): ProvisionSnapshot => ({ version: 1, capturedAt: new Date().toISOString(), method: '유상 구매', provider: '공급사', unitPrice: null, shippingFee: 0, burden: blankBurden(), threshold: null, achieved: { mode: 'free', shares: zeroShares() }, missed: blankBurden(), agreedTerms: '', paymentMethod: '정산 시 상계', orderMethod: '', landing: '' })
export const blankOperations = (): SampleOperations => ({ depositRequestedAt: '', depositExpected: null, depositReceived: false, depositReceivedAt: '', depositConfirmedBy: '', offsetCompleted: false, supplierStatus: '공급사 정산 미완료', loanStatus: '대여 요청', shippedAt: '', collectionDate: '', collectionMemo: '', testStatus: '테스트 중', reviewRecovery: false, reviewCost: false })
export function provisionTotal(draft: SampleOrderDraft) {
  const p = draft.provision
  if (!p || p.unitPrice === null || draft.additionalItems?.some(item => item.unitPrice === null)) return null
  return p.unitPrice * draft.quantity + (draft.additionalItems ?? []).reduce((sum, item) => sum + item.unitPrice! * item.quantity, 0) + p.shippingFee
}
export function validateBurden(b: Burden, total: number | null) {
  if (b.mode === 'free') return
  const values = Object.values(b.shares)
  if (values.some(value => !Number.isFinite(value) || value < 0)) throw new Error('부담 비율·금액은 0 이상이어야 합니다.')
  const expected = b.mode === 'percent' ? 100 : total
  if (expected === null || Math.abs(values.reduce((s, v) => s + v, 0) - expected) > 0.000001) throw new Error(b.mode === 'percent' ? '부담 비율 합계는 100%여야 합니다.' : '부담 금액 합계는 총비용과 일치해야 합니다.')
}
export function validateProvision(draft: SampleOrderDraft, requireCosts = false) {
  const p = draft.provision
  if (!p) return
  if (!PROVISION_METHODS.includes(p.method) || !PAYMENT_METHODS.includes(p.paymentMethod)) throw new Error('제공·결제 방식을 확인해주세요.')
  const total = provisionTotal(draft)
  for (const amount of [p.unitPrice, p.shippingFee, p.threshold]) if (amount !== null && (!Number.isFinite(amount) || amount < 0)) throw new Error('금액은 0 이상이어야 합니다.')
  if (total !== null && !Number.isSafeInteger(total)) throw new Error('총비용은 원 단위 정수로 입력해주세요.')
  for (const item of draft.additionalItems ?? []) if (!item.skuId || !Number.isSafeInteger(item.quantity) || item.quantity < 1 || (item.unitPrice !== null && (!Number.isSafeInteger(item.unitPrice) || item.unitPrice < 0))) throw new Error('추가 SKU 수량·금액을 확인해주세요.')
  if (['무상 제공', '대여'].includes(p.method)) return
  if (requireCosts && total === null) throw new Error('상품 단가와 배송비를 확인해주세요.')
  if (p.method === '조건부 제공') {
    if (p.threshold === null) throw new Error('기준 매출을 입력해주세요.')
    validateBurden(p.achieved, total); validateBurden(p.missed, total)
  } else validateBurden(p.burden, total)
  if (['진행 시 협의', '테스트 후 진행'].includes(p.method) && !p.agreedTerms.trim()) throw new Error('이번 요청에 적용할 조건을 입력해주세요.')
}
export function allocate(b: Burden, total: number): Shares {
  if (b.mode === 'free') return zeroShares()
  validateBurden(b, total)
  if (b.mode === 'amount') return { ...b.shares }
  const result = zeroShares(); const keys = ['supplier', 'company', 'manager', 'seller'] as const
  // Largest remainder distributes won exactly, without creating/losing money.
  for (const key of keys) result[key] = Math.floor(total * b.shares[key] / 100)
  const sorted = [...keys].sort((a, bKey) => (total * b.shares[bKey] / 100 % 1) - (total * b.shares[a] / 100 % 1))
  for (let i = 0, remaining = total - Object.values(result).reduce((s, v) => s + v, 0); i < remaining; i++) result[sorted[i % 4]]++
  return result
}
export function effectiveBurden(order: SampleOrder, finalSales?: number) {
  const p = order.provision
  if (!p) return { reason: '기존 제공조건' }
  if (['무상 제공', '대여'].includes(p.method)) return { reason: '정산 차감 불필요' }
  if (p.method === '테스트 후 진행' && order.operations?.testStatus !== '진행 확정') return { reason: '테스트 진행 여부 확인 필요' }
  const total = provisionTotal(order)
  if (total === null) return { reason: '샘플 비용 확인 필요' }
  let b = p.burden
  if (p.method === '조건부 제공') {
    if (finalSales === undefined || !Number.isFinite(finalSales) || p.threshold === null) return { reason: '최종 매출 확인 필요' }
    b = finalSales >= p.threshold ? p.achieved : p.missed
  }
  const shares = allocate(b, total)
  const ops = order.operations
  if (ops?.depositReceived) shares.seller = Math.max(0, shares.seller - (ops.depositExpected ?? 0))
  if (ops?.offsetCompleted) shares.seller = 0
  for (const amount of Object.values(shares)) if (!Number.isSafeInteger(amount) || amount < 0) throw new Error('부담금은 원 단위 정수여야 합니다.')
  return { shares, total, reason: undefined }
}
export function unsettledCampaigns(campaigns: Campaign[], settlements: Settlement[], sellerId: string, sellerName: string, query: string, connectedId = '') {
  const finalized = new Set(settlements.filter(s => s.settlementConfirmed || ['approved', 'payment_ready', 'partially_paid', 'completed'].includes(s.status)).map(s => s.campaignId))
  const q = query.trim().toLowerCase()
  return campaigns.filter(c => c.id === connectedId || (!c.deletedAt && !finalized.has(c.id) && c.status !== 'settled' && (!sellerId ? !sellerName || c.sellerName.toLowerCase().includes(sellerName.toLowerCase()) : c.sellerId === sellerId || c.sellerName === sellerName) && `${c.sellerName} ${c.campaignName} ${c.productName}`.toLowerCase().includes(q)))
}
export function collectionDue(order: SampleOrder, campaign?: Pick<Campaign, 'endDate'>) {
  if (order.provision?.method !== '대여' || !order.campaignId || !campaign?.endDate) return ''
  const date = new Date(`${campaign.endDate.slice(0, 10)}T00:00:00+09:00`)
  if (!Number.isFinite(date.getTime())) return ''
  date.setUTCDate(date.getUTCDate() + 7)
  return date.toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' })
}
export function needsCollection(order: SampleOrder, campaign: Pick<Campaign, 'endDate'> | undefined, today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' })) {
  const due = collectionDue(order, campaign)
  return !!due && today >= due && order.status !== '취소' && !!order.operations?.shippedAt && !['반납 완료', '분실/파손'].includes(order.operations.loanStatus)
}
