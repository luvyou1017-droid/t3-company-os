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
        if (!order || order.status !== '요청' || order.exportBatchId || order.history.length !== expectedHistoryLength) throw new Error('요청 상태에서만 수정할 수 있습니다. 최신 내용을 확인해주세요.')
        const next = { ...order, ...editableSampleFields(draft), history: [...order.history, { at, actorId: actor.id, actor: actor.name, action: '요청 정보·비용 수정' }] }
        return { ...book, orders: book.orders.map((item) => item.id === id ? next : item) }
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
