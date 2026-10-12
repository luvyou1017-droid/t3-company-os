import { supabase } from '../lib/supabase'
import { STORAGE_KEYS } from './storageService'
import { rememberWorkspaceRow } from './workspacePayloadCache'
import { sellerMasterService } from './sellerMasterService'
import type { PaymentRequest } from '../types/sellerSettlement'
import { planPaymentBatchApproval, approvePlannedRequests } from '../utils/paymentBatchApproval'

const keys = [STORAGE_KEYS.paymentRequests, STORAGE_KEYS.settlements, STORAGE_KEYS.campaigns, STORAGE_KEYS.salesDataImports, STORAGE_KEYS.salesDataRows, STORAGE_KEYS.sellerSettlementRules, STORAGE_KEYS.settlementDeductions, STORAGE_KEYS.managerMasters, STORAGE_KEYS.sellerMasters, STORAGE_KEYS.withholdingTaxItems, STORAGE_KEYS.paymentEvidence]
type Row = { storage_key: string; revision: number; updated_at: string; deleted: boolean; payload: unknown }
export type BatchApprovalPreview = { ids: string[]; versions: Row[]; plan: ReturnType<typeof planPaymentBatchApproval> }

async function actor(client: NonNullable<typeof supabase>) {
  const { data, error } = await client.auth.getUser()
  if (error || !data.user) throw new Error('다시 로그인해주세요.')
  const profile = await client.from('profiles').select('display_name,role,active,approval_status').eq('id', data.user.id).maybeSingle()
  if (profile.error || !profile.data?.active || profile.data.approval_status !== 'approved' || !['ceo', 'admin'].includes(profile.data.role)) throw new Error('승인된 대표·관리자만 일괄 승인할 수 있습니다.')
  return profile.data.display_name?.trim() || data.user.id
}
async function read(client: NonNullable<typeof supabase>) {
  const { data, error } = await client.from('workspace_state').select('storage_key,payload,revision,updated_at,deleted').eq('workspace_id', 'wisevendor').in('storage_key', keys)
  if (error) throw error
  const rows = (data ?? []) as Row[]
  if (![STORAGE_KEYS.paymentRequests, STORAGE_KEYS.settlements, STORAGE_KEYS.campaigns].every(key => rows.some(row => row.storage_key === key && !row.deleted && Array.isArray(row.payload)))) throw new Error('최신 지급요청·정산·일정 데이터를 확인하지 못했습니다.')
  return rows
}
async function apply(rows: Row[], refreshMasters: () => Promise<unknown>) {
  for (const key of keys) {
    const row = rows.find(item => item.storage_key === key)
    const raw = JSON.stringify(row && !row.deleted ? row.payload : [])
    localStorage.setItem(key, raw)
    if (row) await rememberWorkspaceRow(key, row.updated_at, raw)
  }
  await refreshMasters()
}

export async function previewPaymentBatchApproval(ids: string[], issues: (request: PaymentRequest) => string[], client = supabase, refreshMasters = () => sellerMasterService.loadSellers(true)) {
  if (!client) throw new Error('운영 서버 연결을 확인해주세요.')
  await actor(client)
  const versions = await read(client)
  await apply(versions, refreshMasters)
  const requests = versions.find(row => row.storage_key === STORAGE_KEYS.paymentRequests)!.payload as PaymentRequest[]
  return { ids: [...new Set(ids)], versions, plan: planPaymentBatchApproval(ids, requests, issues) }
}

export async function approvePaymentBatch(preview: BatchApprovalPreview, issues: (request: PaymentRequest) => string[], client = supabase, refreshMasters = () => sellerMasterService.loadSellers(true)) {
  if (!client) throw new Error('운영 서버 연결을 확인해주세요.')
  const name = await actor(client)
  const fresh = await read(client)
  if (JSON.stringify(fresh.map(row => [row.storage_key, row.revision, row.updated_at]).sort()) !== JSON.stringify(preview.versions.map(row => [row.storage_key, row.revision, row.updated_at]).sort())) throw new Error('검토 이후 데이터가 변경됐습니다. 다시 일괄 확인해주세요. 승인하지 않았습니다.')
  await apply(fresh, refreshMasters)
  const paymentRow = fresh.find(row => row.storage_key === STORAGE_KEYS.paymentRequests)!
  const requests = paymentRow.payload as PaymentRequest[]
  const plan = planPaymentBatchApproval(preview.ids, requests, issues)
  if (!plan.ready.length) throw new Error('승인 가능한 건이 없습니다. 제외 사유를 확인해주세요.')
  if (JSON.stringify(plan.ready.map(row => [row.id, row.request.finalPaymentAmount])) !== JSON.stringify(preview.plan.ready.map(row => [row.id, row.request.finalPaymentAmount]))) throw new Error('승인 대상 또는 금액이 변경됐습니다. 다시 확인해주세요.')
  const payload = approvePlannedRequests(requests, plan.ready.map(row => row.id), name, new Date().toISOString())
  const { data, error } = await client.from('workspace_state').update({ payload }).eq('workspace_id', 'wisevendor').eq('storage_key', STORAGE_KEYS.paymentRequests).eq('revision', paymentRow.revision).eq('updated_at', paymentRow.updated_at).select('payload,updated_at').maybeSingle()
  if (error) throw error
  if (!data) throw new Error('다른 사용자가 지급요청을 변경했습니다. 승인하지 않았습니다. 다시 확인해주세요.')
  const raw = JSON.stringify(data.payload)
  localStorage.setItem(STORAGE_KEYS.paymentRequests, raw)
  await rememberWorkspaceRow(STORAGE_KEYS.paymentRequests, data.updated_at, raw)
  return { approved: plan.ready.length, skipped: plan.rows.filter(row => row.reasons.length > 0) }
}
