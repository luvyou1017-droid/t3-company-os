import { supabase } from '../lib/supabase'
import { getDataProviderMode } from '../lib/dataProvider'
import { sanitizeAccountNumberInput } from '../utils/accountNumber'
import { managerPaymentService, type ManagerMasterProfile } from './managerPaymentService'
import { storageService, STORAGE_KEYS } from './storageService'

type Account = { bankName: string; accountNumber: string; accountHolder: string }
export function normalizeManagerAccountPatch(value: Partial<Account>): Partial<Account> {
  const patch: Partial<Account> = {}
  for (const key of ['bankName', 'accountNumber', 'accountHolder'] as const) {
    if (value[key] === undefined) continue
    const normalized = key === 'accountNumber' ? sanitizeAccountNumberInput(value[key]) : value[key].trim()
    if (!normalized || (key === 'accountNumber' && !/[0-9]/.test(normalized))) throw new Error('은행명, 계좌번호, 예금주를 확인해주세요.')
    patch[key] = normalized
  }
  return patch
}
export function normalizeManagerAccount(value: Account): Account {
  const account = normalizeManagerAccountPatch(value)
  if (!account.bankName || !account.accountNumber || !account.accountHolder) throw new Error('은행명, 계좌번호, 예금주를 확인해주세요.')
  return account as Account
}
export function mergeManagerAccount(profiles: ManagerMasterProfile[], id: string, account: Partial<Account>) {
  if (profiles.filter(item => item.id === id).length !== 1) throw new Error('매니저 등록 정보를 확인해주세요. 기존 정보는 변경하지 않았습니다.')
  return profiles.map(item => item.id === id ? { ...item, ...normalizeManagerAccountPatch(account) } : item)
}
// Existing workspace JSON storage; compare-and-set prevents stale account edits
// from replacing another manager's concurrent update. No settlement writes.
export async function persistManagerAccount(id: string, value: Partial<Account>, client = supabase) {
  const account = normalizeManagerAccountPatch(value)
  if (!client) throw new Error('공용 DB 연결을 확인해주세요.')
  for (let attempt = 0; attempt < 3; attempt++) {
    const { data: current, error } = await client.from('workspace_state').select('payload,updated_at,deleted')
      .eq('workspace_id', 'wisevendor').eq('storage_key', STORAGE_KEYS.managerMasters).single()
    if (error) throw error
    if (!current || current.deleted || !Array.isArray(current.payload)) throw new Error('매니저 등록 정보를 확인해주세요.')
    const payload = mergeManagerAccount(current.payload as ManagerMasterProfile[], id, account)
    const { data: saved, error: saveError } = await client.from('workspace_state').update({ payload, source_device_id: typeof localStorage === 'undefined' ? null : localStorage.getItem('t3_company_os_cloud_device_id') })
      .eq('workspace_id', 'wisevendor').eq('storage_key', STORAGE_KEYS.managerMasters)
      .eq('updated_at', current.updated_at).select('payload').maybeSingle()
    if (saveError) throw saveError
    if (saved) return saved.payload as ManagerMasterProfile[]
  }
  throw new Error('다른 사용자가 매니저 정보를 수정했습니다. 다시 저장해주세요.')
}
export const managerAccountService = {
  async save(id: string, value: Partial<Account>) {
    const profiles = getDataProviderMode() === 'supabase'
      ? await persistManagerAccount(id, value)
      : mergeManagerAccount(managerPaymentService.getProfiles(), id, value)
    // Publish locally only after server acknowledgement; do not enqueue another save.
    storageService.setItemFromCloud(STORAGE_KEYS.managerMasters, profiles)
    return profiles.find(item => item.id === id)!
  },
}
