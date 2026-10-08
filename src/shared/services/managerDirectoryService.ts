import { appUsers } from '../data/users'
import { getDataProviderMode } from '../lib/dataProvider'
import { supabase } from '../lib/supabase'
import { STORAGE_KEYS, storageService } from './storageService'

export type ManagerOption = { id: string; name: string }
let remoteManagers: ManagerOption[] | undefined
export function managerOptions(value: unknown): ManagerOption[] {
  if (!Array.isArray(value)) return []
  const byId = new Map<string, ManagerOption>()
  for (const row of value) {
    if (row && typeof row.id === 'string' && typeof row.name === 'string' && row.name.trim() && row.active !== false) {
      byId.set(row.id, { id: row.id, name: row.name.trim() })
    }
  }
  return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name, 'ko'))
}
export const managerDirectoryService = {
  list(): ManagerOption[] {
    if (getDataProviderMode() === 'local') return appUsers.filter(user => ['대표', '팀장', '매니저'].includes(user.role))
    return remoteManagers ?? managerOptions(storageService.getItem(STORAGE_KEYS.managerMasters, []))
  },
  async load() {
    if (getDataProviderMode() !== 'supabase') return this.list()
    if (!supabase) throw new Error('매니저 DB 연결을 확인해주세요.')
    const { data, error } = await supabase.from('workspace_state').select('payload,deleted')
      .eq('workspace_id', 'wisevendor').eq('storage_key', STORAGE_KEYS.managerMasters).maybeSingle()
    if (error) throw error
    if (!data || data.deleted || !Array.isArray(data.payload)) throw new Error('등록된 매니저 DB를 불러오지 못했습니다.')
    remoteManagers = managerOptions(data.payload)
    return remoteManagers
  },
  name(id: string) { return this.list().find(user => user.id === id)?.name ?? appUsers.find(user => user.id === id)?.name ?? '' },
  label(user: ManagerOption) {
    return this.list().filter(item => item.name === user.name).length > 1 ? `${user.name} · ${user.id.slice(0, 8)}` : user.name
  },
}
