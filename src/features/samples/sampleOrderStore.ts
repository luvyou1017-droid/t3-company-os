import { blankOperations, sampleItems, itemLoanOrder, LOAN_STATUSES, SUPPLIER_STATUSES, type SampleOperations } from './sampleProvision'
import { readSampleSettlementState } from './sampleSettlementStatus'
import { isLinkedSampleDeduction } from './sampleSettlementCandidate'
import { productService } from '../productMaster/services/productService'
import type { SampleOrder } from './sampleOrderModel'
import { supabase } from '../../shared/lib/supabase'
import { EMPTY_SAMPLE_BOOK, createSampleOrder, editableSampleFields, reserveSampleExport, transitionSample, validateSampleDraft,
  type SampleActor, type SampleOrderBook, type SampleOrderDraft, type SampleOrderStatus } from './sampleOrderModel'

// Separate, authoritative workspace row. Never put this key in background
// localStorage synchronization: every write must pass the revision CAS below.
export const SAMPLE_ORDER_KEY = 't3_sample_order_book_v1'
const WORKSPACE = 'wisevendor'
type VersionedBook = { book: SampleOrderBook; revision: number | null }

export interface SampleBookRepository {
  read(): Promise<VersionedBook>
  write(book: SampleOrderBook, expectedRevision: number | null): Promise<VersionedBook>
}

const repository: SampleBookRepository = {
  async read() {
    if (!supabase) throw new Error('기존 운영 데이터베이스 연결이 필요합니다.')
    const { data, error } = await supabase.from('workspace_state').select('payload,revision,deleted')
      .eq('workspace_id', WORKSPACE).eq('storage_key', SAMPLE_ORDER_KEY).maybeSingle()
    if (error) throw error
    if (!data) return { book: structuredClone(EMPTY_SAMPLE_BOOK), revision: null }
    if (data.deleted || data.payload?.schemaVersion !== 1 || !Array.isArray(data.payload?.orders)) throw new Error('샘플 저장자료를 확인해주세요. 기존 자료를 덮어쓰지 않았습니다.')
    return { book: data.payload as SampleOrderBook, revision: Number(data.revision) }
  },
  async write(book, expectedRevision) {
    if (!supabase) throw new Error('기존 운영 데이터베이스 연결이 필요합니다.')
    const values = { workspace_id: WORKSPACE, storage_key: SAMPLE_ORDER_KEY, payload: book, deleted: false }
    const query = expectedRevision === null ? supabase.from('workspace_state').insert(values)
      : supabase.from('workspace_state').update({ payload: book }).eq('workspace_id', WORKSPACE).eq('storage_key', SAMPLE_ORDER_KEY).eq('revision', expectedRevision)
    const { data, error } = await query.select('payload,revision').maybeSingle()
    if (error?.code === '23505' || (!error && !data)) throw new Error('다른 사용자가 변경했습니다. 목록을 새로고침한 뒤 다시 확인해주세요. 중복 발주는 생성하지 않았습니다.')
    if (error) throw error
    return { book: data!.payload as SampleOrderBook, revision: Number(data!.revision) }
  },
}

async function signedInActor(): Promise<SampleActor> {
  if (!supabase) throw new Error('로그인이 필요합니다.')
  const { data: auth, error: authError } = await supabase.auth.getUser()
  if (authError || !auth.user) throw new Error('로그인 상태를 확인해주세요.')
  const { data, error } = await supabase.from('profiles').select('id,display_name,active,approval_status,role').eq('id', auth.user.id).single()
  if (error || !data?.active || data.approval_status !== 'approved' || data.role === 'partner_vendor') throw new Error('승인된 회사 계정으로 로그인해주세요.')
  return { id: data.id, name: data.display_name }
}

async function withOrderSupplier(order: SampleOrder): Promise<SampleOrder> {
  if (order.supplierId || order.supplierName?.trim()) return order
  const product = await productService.getProductById(order.productId)
  if (!product || !product.skus.some(sku => sku.id === order.skuId)) throw new Error('발주 상품/SKU 연결 확인 필요')
  if (!product.vendorId && !product.vendorName?.trim()) throw new Error('발주처/공급처 연결 확인 필요')
  // Preserve recipient and price snapshots; recover only a missing order supplier.
  return { ...order, supplierId: product.vendorId, supplierName: product.vendorName }
}

export function makeSampleOrderStore(repo: SampleBookRepository, actorProvider: () => Promise<SampleActor>) {
  async function mutate(change: (book: SampleOrderBook, actor: SampleActor, at: string) => SampleOrderBook | Promise<SampleOrderBook>) {
    const actor = await actorProvider()
    const current = await repo.read()
    const next = await change(current.book, actor, new Date().toISOString())
    return (await repo.write(next, current.revision)).book.orders
  }
  return {
    async list() { return (await repo.read()).book.orders },
    async create(draft: SampleOrderDraft, requestId: string) {
      return mutate((book, actor, at) => {
        if (book.orders.some((order) => order.id === requestId)) throw new Error('이미 저장한 요청입니다. 목록을 확인해주세요.')
        return { ...book, orders: [createSampleOrder(draft, actor, requestId, at), ...book.orders] }
      })
    },
    async edit(id: string, draft: SampleOrderDraft, expectedHistoryLength: number) {
      return mutate((book, actor, at) => {
        validateSampleDraft(draft)
        const order = book.orders.find((item) => item.id === id)
        if (!order || order.settlementClaim || order.status !== '요청' || order.exportBatchId || order.history.length !== expectedHistoryLength) throw new Error('요청 상태에서만 수정할 수 있습니다. 최신 내용을 확인해주세요.')
        const next = { ...order, ...editableSampleFields(draft), history: [...order.history, { at, actorId: actor.id, actor: actor.name, action: '요청 정보·비용 수정' }] }
        return { ...book, orders: book.orders.map((item) => item.id === id ? next : item) }
      })
    },
    async claimSettlement(id: string, settlementId: string, expectedOrder: SampleOrder) {
      let claimed: SampleOrder | undefined
      await mutate((book, actor, at) => {
        const order = book.orders.find(item => item.id === id)
        if (!order || JSON.stringify(order) !== JSON.stringify(expectedOrder)) throw new Error('샘플 정보가 변경됐습니다. 다시 확인해주세요.')
        if (order.settlementClaim) throw new Error('이미 정산 반영 요청된 샘플입니다. 정산 연결 기록을 확인해주세요. 중복 차감하지 않았습니다.')
        claimed = { ...order, settlementClaim: {settlementId,claimedAt:at,actorId:actor.id} }
        return { ...book,orders:book.orders.map(item => item.id === id ? claimed! : item) }
      })
      return claimed!
    },
    async completeSettlementClaim(id: string, settlementId: string) {
      return mutate((book, actor, at) => {
        const order = book.orders.find(item => item.id === id)
        if (!order?.settlementClaim || order.settlementClaim.settlementId !== settlementId) throw new Error('정산 반영 요청 기록을 확인해주세요.')
        return { ...book, orders:book.orders.map(item => item.id === id ? { ...item, settlementClaim:{...item.settlementClaim!,committedAt:at}, history:[...item.history,{at,actorId:actor.id,actor:actor.name,action:'정산 저장 완료 확인'}] } : item) }
      })
    },
    async updateOperations(id: string, operations: SampleOperations, expectedHistoryLength: number) {
      return mutate((book, actor, at) => {
        const order = book.orders.find(item => item.id === id)
        if (!order || !order.provision || order.status === '취소' || order.history.length !== expectedHistoryLength) throw new Error('요청 상태가 변경됐습니다. 새로고침해주세요.')
        const itemIds = new Set(sampleItems(order).map(item=>item.itemId))
        for (const [itemId,state] of Object.entries(operations.itemLoans ?? {})) if (!itemIds.has(itemId) || !LOAN_STATUSES.includes(state.loanStatus) || (order.itemConditionsVersion === 2 && sampleItems(order).find(item=>item.itemId===itemId)?.provision?.method !== '대여')) throw new Error('요청에 포함된 SKU 회수상태를 확인해주세요.')
        const financialFields = ['depositRequestedAt','depositExpected','depositReceived','depositReceivedAt','depositConfirmedBy','offsetCompleted'] as const
        if (order.settlementClaim && financialFields.some(key => operations[key] !== (order.operations ?? blankOperations())[key])) throw new Error('정산 반영 요청 후 입금·상계 정보는 변경할 수 없습니다. 업체 정산상태는 별도로 저장할 수 있습니다.')
        for (const [itemId,itemState] of Object.entries(operations.itemFinancials ?? {})) {
          if (!itemIds.has(itemId) || !SUPPLIER_STATUSES.includes(itemState.supplierStatus) || (itemState.depositExpected !== null && (!Number.isSafeInteger(itemState.depositExpected) || itemState.depositExpected < 0))) throw new Error('품목별 입금 금액을 확인해주세요.')
          if (itemState.depositReceived && (!itemState.depositReceivedAt || !itemState.depositConfirmedBy.trim() || itemState.depositExpected === null)) throw new Error('품목별 입금 예정액·입금일·확인자를 입력해주세요.')
        }
        const financialItems = (value?: SampleOperations) => [...itemIds].sort().map(itemId => financialFields.map(key => value?.itemFinancials?.[itemId]?.[key] ?? blankOperations()[key]))
        const itemFinancialChanged = JSON.stringify(financialItems(operations)) !== JSON.stringify(financialItems(order.operations))
        if (order.settlementClaim && itemFinancialChanged) throw new Error('정산 반영 요청 후 품목별 입금·상계 정보는 변경할 수 없습니다.')
        const state = readSampleSettlementState()
        if (state.deductions.some(d => state.activeSettlementIds.has(d.settlementId) && isLinkedSampleDeduction(d,id)) && (operations.depositReceived !== order.operations?.depositReceived || operations.offsetCompleted !== order.operations?.offsetCompleted)) throw new Error('이미 정산에 연결됐습니다. 추가 입금·상계를 기록하지 않았습니다.')
        if (itemFinancialChanged && state.deductions.some(d => state.activeSettlementIds.has(d.settlementId) && isLinkedSampleDeduction(d,id))) throw new Error('이미 정산에 연결됐습니다. 품목별 추가 입금·상계를 기록하지 않았습니다.')
        if (operations.depositReceived && (!operations.depositReceivedAt || !operations.depositConfirmedBy.trim() || operations.depositExpected === null || operations.depositExpected < 0)) throw new Error('입금 예정액·입금일·확인자를 입력해주세요.')
        const next = { ...order, operations: { ...blankOperations(), ...operations }, history: [...order.history,{at,actorId:actor.id,actor:actor.name,action:'결제·입금·업체정산·대여 상태 확인'}] }
        return { ...book, orders:book.orders.map(item => item.id === id ? next : item) }
      })
    },
    async connectCampaign(id: string, campaign: { id: string; campaignName: string; sellerId: string; sellerName: string }, expectedHistoryLength: number) {
      return mutate((book, actor, at) => {
        const order = book.orders.find(item => item.id === id)
        if (!order || order.status === '취소' || order.campaignId || order.history.length !== expectedHistoryLength) throw new Error('기존 공구 연결을 변경하지 않았습니다. 새로고침해주세요.')
        if (sampleItems(order).some(item => {const view=itemLoanOrder(order,item.itemId);return view.provision?.method === '테스트 후 진행' && view.operations?.testStatus !== '진행 확정'})) throw new Error('진행 확정 후 공구를 연결해주세요.')
        if (!campaign.id || (order.sellerId && campaign.sellerId !== order.sellerId && campaign.sellerName !== order.sellerName)) throw new Error('해당 셀러의 공구를 선택해주세요.')
        return { ...book, orders:book.orders.map(item => item.id === id ? { ...item,campaignId:campaign.id,campaignName:campaign.campaignName,history:[...item.history,{at,actorId:actor.id,actor:actor.name,action:'공구 연결 (제공조건·배송정보 유지)'}] } : item) }
      })
    },
    async connectSeller(id: string, seller: { id: string; name: string }, expectedHistoryLength: number) {
      return mutate((book, actor, at) => {
        const order = book.orders.find(item => item.id === id)
        if (!order || order.sellerId || order.history.length !== expectedHistoryLength) throw new Error('셀러 연결 상태가 변경되었습니다. 새로고침해주세요.')
        if (!seller.id || !seller.name) throw new Error('기존 셀러를 선택해주세요.')
        return { ...book, orders: book.orders.map(item => item.id === id ? { ...item, sellerId: seller.id, sellerName: seller.name,
          history: [...item.history, { at, actorId: actor.id, actor: actor.name, action: `기존 셀러 연결: ${seller.name} (배송·비용 조건 유지)` }] } : item) }
      })
    },
    async transition(id: string, from: SampleOrderStatus, to: SampleOrderStatus, reference = '', expectedHistoryLength?: number) {
      return mutate(async (book, actor, at) => {
        const order = book.orders.find((item) => item.id === id)
        if (!order || order.status !== from || (expectedHistoryLength !== undefined && order.history.length !== expectedHistoryLength)) throw new Error('다른 사용자가 내용을 변경했습니다. 최신 내용을 확인해주세요.')
        const next = transitionSample(to === '발주대기' ? await withOrderSupplier(order) : order, to, actor, at, reference)
        return { ...book, orders: book.orders.map((item) => item.id === id ? next : item) }
      })
    },
    async export(ids: string[]) {
      const batchId = `EXPORT-${crypto.randomUUID()}`
      const orders = await mutate(async (book, actor, at) => {
        const orders = await Promise.all(book.orders.map(order => ids.includes(order.id) ? withOrderSupplier(order) : order))
        return reserveSampleExport({ ...book, orders }, ids, batchId, actor, at)
      })
      return { orders, batch: orders.filter((order) => order.exportBatchId === batchId), batchId }
    },
  }
}
export const sampleOrderStore = makeSampleOrderStore(repository, signedInActor)
export function sampleRequestId() {
  const month = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' }).slice(0, 7).replace('-', '')
  return `SAMPLE-${month}-${crypto.randomUUID()}`
}
