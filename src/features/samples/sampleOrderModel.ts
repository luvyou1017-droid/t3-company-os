import type { ProductMaster, ProductSku } from '../productMaster/types.ts'

export const SAMPLE_ORDER_STATUSES = ['요청', '승인대기', '발주대기', '발주완료', '배송중', '수령완료', '취소'] as const
export type SampleOrderStatus = typeof SAMPLE_ORDER_STATUSES[number]
export type SamplePayer = 'seller' | 'company' | 'manager' | 'supplier'
export const SAMPLE_PAYERS: Record<SamplePayer, string> = {
  seller: '샘플 구매 : 셀러 부담', company: '샘플 구매 : 회사 부담',
  manager: '샘플 구매 : 매니저 부담', supplier: '공급사 지원',
}
export const SAMPLE_PAYER_HELP: Record<SamplePayer, string> = {
  seller: '셀러 지급액에서 차감 / 차액은 회사 귀속', company: '회사 부담 / 배분 전 차감',
  manager: '매니저 정산금에서 차감', supplier: '전액 또는 일부 지원 금액을 기록합니다.',
}
export type SampleCostSnapshot = {
  sellerUnitPrice: number | null
  companyUnitCost: number | null
  source: 'sku' | 'manual'
  capturedAt: string
}
export type SampleOrderDraft = {
  supplierId?: string; supplierName?: string
  ordererName?: string; ordererPhone?: string
  targetType?: 'seller' | 'vendor' | 'unspecified'; targetDisplayName?: string; supplyAudience?: 'seller' | 'vendor'
  sellerId: string; sellerName: string; campaignId: string; campaignName: string
  productId: string; skuId: string; brandName: string; productName: string; optionName: string; detailOption: string
  quantity: number; recipient: string; phone: string; address: string; purpose: string; memo: string; deliveryMemo: string
  payer: SamplePayer; supportType: 'full' | 'partial'; supportAmount: number | null
  costs: SampleCostSnapshot
}
export type SampleOrder = SampleOrderDraft & {
  id: string; requestedAt: string; managerId: string; managerName: string; status: SampleOrderStatus
  settlementReflected: boolean
  history: Array<{ at: string; actorId: string; actor: string; action: string; from?: SampleOrderStatus; to?: SampleOrderStatus }>
  exportBatchId?: string; exportedAt?: string; orderedAt?: string; externalOrderReference?: string
}
export type SampleOrderBook = { schemaVersion: 1; orders: SampleOrder[] }
export type SampleActor = { id: string; name: string }
export const EMPTY_SAMPLE_BOOK: SampleOrderBook = { schemaVersion: 1, orders: [] }

export function nonNegativeMoney(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null
}
export function inputMoney(value: string): number | null {
  return value.trim() ? nonNegativeMoney(Number(value)) : null
}
export function skuCostSnapshot(sku: ProductSku, at = new Date().toISOString()): SampleCostSnapshot {
  // Retail price and seller commission are NOT seller applied supply price.
  // A legacy zero may be an import default, so only explicit current terms confirm zero.
  const explicit = nonNegativeMoney(sku.currentTradeTerms?.companySupplyPrice)
  const legacy = nonNegativeMoney(sku.policyOverrides?.supplyPrice ?? sku.supplyPrice)
  return { sellerUnitPrice: nonNegativeMoney(sku.currentTradeTerms?.sellerSupplyPrice),
    companyUnitCost: explicit ?? (legacy !== null && legacy > 0 ? legacy : null), source: 'sku', capturedAt: at }
}
export function selectableSku(product: ProductMaster, sku: ProductSku) {
  return product.active && !['inactive', 'archived'].includes(product.lifecycleStatus ?? '') && sku.active && !['inactive', 'archived'].includes(sku.lifecycleStatus ?? '')
}
export function selectSampleSku(draft: SampleOrderDraft, product: ProductMaster, sku: ProductSku): SampleOrderDraft {
  if (!selectableSku(product, sku) || sku.productId !== product.id) throw new Error('사용 가능한 상품·SKU를 선택해주세요.')
  return { ...draft, supplierId: product.vendorId, supplierName: product.vendorName, productId: product.id, skuId: sku.id, brandName: product.brandName, productName: product.productName,
    optionName: sku.optionName, detailOption: Object.entries(sku.optionValues ?? {}).map(([key, value]) => `${key}: ${value}`).join(' / '), costs: skuCostSnapshot(sku) }
}
export function sampleTotals(draft: Pick<SampleOrderDraft, 'quantity' | 'costs' | 'payer' | 'supportType' | 'supportAmount'>) {
  const companyCost = draft.costs.companyUnitCost === null ? null : Math.round(draft.costs.companyUnitCost * draft.quantity)
  const sellerAmount = draft.costs.sellerUnitPrice === null ? null : Math.round(draft.costs.sellerUnitPrice * draft.quantity)
  const sellerDeduction = draft.payer === 'seller' ? sellerAmount : 0
  const support = draft.payer !== 'supplier' ? 0 : draft.supportType === 'full' ? companyCost : draft.supportAmount
  const companyBurden = companyCost === null || support === null ? null : companyCost - support
  return { companyCost, sellerDeduction, support, companyBurden,
    difference: draft.payer === 'seller' && sellerDeduction !== null && companyCost !== null ? sellerDeduction - companyCost : null }
}
export function validateSampleDraft(draft: SampleOrderDraft, requireCosts = false) {
  if (!draft.productId || !draft.skuId) throw new Error('상품·SKU를 선택해주세요.')
  if ((!draft.targetType || draft.targetType === 'seller') && !draft.sellerId) throw new Error('셀러를 선택해주세요.')
  if (draft.targetType === 'vendor' && !draft.targetDisplayName?.trim()) throw new Error('거래처/벤더명을 입력해주세요.')
  if (!Number.isSafeInteger(draft.quantity) || draft.quantity < 1) throw new Error('수량은 1 이상의 정수로 입력해주세요.')
  if (![draft.recipient, draft.phone, draft.address, draft.purpose].every((value) => value.trim())) throw new Error('수령인·연락처·주소·샘플 목적을 입력해주세요.')
  if (!SAMPLE_PAYERS[draft.payer]) throw new Error('부담주체를 선택해주세요.')
  for (const amount of [draft.costs.companyUnitCost, draft.costs.sellerUnitPrice, draft.supportAmount]) {
    if (amount !== null && nonNegativeMoney(amount) === null) throw new Error('금액은 0 이상의 숫자로 입력해주세요.')
  }
  const totals = sampleTotals(draft)
  if ([totals.companyCost, totals.sellerDeduction, totals.companyBurden].some((value) => value !== null && !Number.isSafeInteger(value))) throw new Error('계산 가능한 금액 범위를 초과했습니다.')
  if (totals.companyBurden !== null && totals.companyBurden < 0) throw new Error('공급사 지원액은 회사 원가 합계를 초과할 수 없습니다.')
  if (requireCosts && !draft.supplierId && !draft.supplierName?.trim()) throw new Error('발주처/공급처 연결 확인 필요: 상품·SKU를 다시 선택한 후 승인/발주해주세요.')
  if (requireCosts && (totals.companyCost === null || (draft.payer === 'seller' && totals.sellerDeduction === null) || totals.companyBurden === null)) {
    throw new Error('비용 확인 필요: 회사 원가·셀러 적용 공급가·지원액을 확인한 후 승인해주세요.')
  }
}
export function editableSampleFields(draft: SampleOrderDraft): SampleOrderDraft {
  const { supplierId, supplierName, ordererName, ordererPhone, targetType, targetDisplayName, supplyAudience, sellerId, sellerName, campaignId, campaignName, productId, skuId, brandName, productName, optionName, detailOption,
    quantity, recipient, phone, address, purpose, memo, deliveryMemo, payer, supportType, supportAmount, costs } = draft
  return structuredClone({ supplierId, supplierName, ordererName, ordererPhone, targetType, targetDisplayName, supplyAudience, sellerId, sellerName, campaignId, campaignName, productId, skuId, brandName, productName, optionName, detailOption,
    quantity, recipient, phone, address, purpose, memo, deliveryMemo, payer, supportType, supportAmount, costs })
}
export function createSampleOrder(draft: SampleOrderDraft, actor: SampleActor, id: string, at: string): SampleOrder {
  validateSampleDraft(draft)
  return { ...editableSampleFields(draft), id, requestedAt: at, managerId: actor.id, managerName: actor.name,
    status: '요청', settlementReflected: false, history: [{ at, actorId: actor.id, actor: actor.name, action: '샘플 요청 등록', to: '요청' }] }
}
const NEXT: Record<SampleOrderStatus, SampleOrderStatus[]> = {
  요청: ['승인대기', '취소'], 승인대기: ['발주대기', '요청', '취소'], 발주대기: ['발주완료', '취소'],
  발주완료: ['배송중', '취소'], 배송중: ['수령완료', '취소'], 수령완료: [], 취소: [],
}
export function transitionSample(order: SampleOrder, status: SampleOrderStatus, actor: SampleActor, at: string, reference = ''): SampleOrder {
  if (!NEXT[order.status].includes(status)) throw new Error('현재 상태에서 진행할 수 없습니다. 목록을 새로고침해주세요.')
  if (status === '발주대기') validateSampleDraft(order, true)
  if (status === '발주완료' && (!order.exportBatchId || order.orderedAt || !reference.trim())) throw new Error('파일 생성 후 발주모아 발주번호 또는 처리 확인 내용을 입력해주세요.')
  return { ...order, status, ...(status === '발주완료' ? { orderedAt: at, externalOrderReference: reference.trim() } : {}),
    history: [...order.history, { at, actorId: actor.id, actor: actor.name, from: order.status, to: status,
      action: status === '발주대기' ? '샘플 승인' : status === '요청' ? '보완 요청' : `상태 변경: ${status}` }] }
}
export function reserveSampleExport(book: SampleOrderBook, ids: string[], batchId: string, actor: SampleActor, at: string): SampleOrderBook {
  const unique = new Set(ids)
  if (!unique.size || unique.size !== ids.length) throw new Error('발주대기 샘플을 중복 없이 선택해주세요.')
  const targets = book.orders.filter((order) => unique.has(order.id))
  if (targets.length !== unique.size) throw new Error('선택한 샘플을 찾을 수 없습니다.')
  for (const order of targets) {
    if (order.status !== '발주대기' || order.exportBatchId || order.orderedAt) throw new Error('미승인 또는 이미 파일 생성·발주된 샘플입니다. 중복 생성을 차단했습니다.')
    validateSampleDraft(order, true)
  }
  return { ...book, orders: book.orders.map((order) => unique.has(order.id) ? { ...order, exportBatchId: batchId, exportedAt: at,
    history: [...order.history, { at, actorId: actor.id, actor: actor.name, action: `내부 발주파일 생성: ${batchId}` }] } : order) }
}
export function sampleExportRows(orders: SampleOrder[]): Array<Array<string | number>> {
  return [['주문/샘플 식별번호', '상품', '옵션', '수량', '수령인', '연락처', '주소', '배송메모'], ...orders.map((order) => [order.id, order.productName,
    [order.optionName, order.detailOption].filter(Boolean).join(' / '), order.quantity, order.recipient, order.phone, order.address, order.deliveryMemo])]
}
export function sampleRecipientDefaults(seller?: { recipientName?: string; realName?: string; shippingPhone?: string; contact?: string; shippingAddress?: string }) {
  return { recipient: seller?.recipientName || seller?.realName || '', phone: seller?.shippingPhone || seller?.contact || '', address: seller?.shippingAddress || '' }
}
export function sampleCsv(orders: SampleOrder[]): string {
  const escape = (value: string | number) => {
    const raw = String(value)
    // CSVs are opened in spreadsheet software: never allow formula execution.
    const safe = /^[\s]*[=+\-@\t\r]/.test(raw) ? `'${raw}` : raw
    return `"${safe.replaceAll('"', '""')}"`
  }
  return '\uFEFF' + sampleExportRows(orders).map((row) => row.map(escape).join(',')).join('\r\n')
}
