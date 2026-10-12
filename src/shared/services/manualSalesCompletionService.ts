import { supabase } from '../lib/supabase'
import { STORAGE_KEYS } from './storageService'
import { rememberWorkspaceRow } from './workspacePayloadCache'
import type { SalesDataImport } from '../types/salesData'
import type { Settlement } from '../types/settlement'
import { buildManualSalesCompletion } from '../utils/manualSalesCompletion'

export async function completeSalesManually(id: string, grossSales: number, client = supabase) {
  if (!client) throw new Error('운영 서버 연결이 없어 완료 처리하지 않았습니다.')
  const { data: auth, error: authError } = await client.auth.getUser()
  if (authError || !auth.user) throw new Error('다시 로그인해주세요.')
  const { data: profile, error: profileError } = await client.from('profiles').select('display_name,role,active,approval_status').eq('id', auth.user.id).maybeSingle()
  if (profileError || !profile?.active || profile.approval_status !== 'approved' || !['ceo', 'admin'].includes(profile.role)) throw new Error('승인된 대표·관리자만 강제 완료처리할 수 있습니다.')
  const read = (key: string) => client.from('workspace_state').select('payload,revision,updated_at,deleted').eq('workspace_id', 'wisevendor').eq('storage_key', key).maybeSingle()
  const [sales, settlements] = await Promise.all([read(STORAGE_KEYS.salesDataImports), read(STORAGE_KEYS.settlements)])
  if (sales.error || settlements.error) throw new Error('최신 판매데이터와 정산 상태를 확인하지 못했습니다.')
  if (sales.data?.deleted || !Array.isArray(sales.data?.payload)) throw new Error('운영 판매데이터를 확인해주세요.')
  const items = sales.data.payload as SalesDataImport[]
  const matches = items.filter(item => item.id === id)
  if (matches.length !== 1) throw new Error('판매데이터 ID가 없거나 중복됩니다. 새로고침해주세요.')
  const linked = (Array.isArray(settlements.data?.payload) ? settlements.data.payload : []) as Settlement[]
  if (linked.some(item => item.salesDataImportId === id && item.status !== 'canceled')) throw new Error('기존 정산서가 있습니다. 해당 정산서에서 완료 처리해주세요. 금액과 Snapshot은 변경하지 않았습니다.')
  const next = buildManualSalesCompletion(matches[0], grossSales, { id: auth.user.id, name: profile.display_name }, new Date().toISOString())
  const payload = items.map(item => item.id === id ? next : item)
  let savedPayload = items
  let updatedAt = sales.data.updated_at
  if (next !== matches[0]) {
    const { data, error } = await client.from('workspace_state').update({ payload }).eq('workspace_id', 'wisevendor').eq('storage_key', STORAGE_KEYS.salesDataImports).eq('revision', sales.data.revision).eq('updated_at', sales.data.updated_at).select('payload,updated_at').maybeSingle()
    if (error) throw error
    if (!data) throw new Error('다른 사용자가 판매데이터를 수정했습니다. 새로고침 후 다시 처리해주세요.')
    savedPayload = data.payload as SalesDataImport[]
    updatedAt = data.updated_at
  }
  // Publish locally only after confirmed server persistence; no source-row/financial writes.
  if (typeof localStorage !== 'undefined') {
    const raw = JSON.stringify(savedPayload)
    localStorage.setItem(STORAGE_KEYS.salesDataImports, raw)
    await rememberWorkspaceRow(STORAGE_KEYS.salesDataImports, updatedAt, raw)
  }
  return savedPayload.find(item => item.id === id)!
}
