import { supabase } from '../../shared/lib/supabase'
import type { SyncJob, SyncKind } from './model'
async function invoke(action: 'status' | 'run', kind?: SyncKind) {
  if (!supabase) throw new Error('운영 DB 연결을 확인해주세요.')
  const { data, error } = await supabase.functions.invoke('automatic-sync', { body: { action, kind } })
  if (error) throw new Error('자동 동기화 서버에 연결하지 못했습니다. 서버 함수·권한·네트워크 설정을 확인해주세요. 실행 여부는 미확인입니다.')
  if (data?.error) throw new Error(data.error)
  return data
}
export const automaticSyncService = {
  async status(): Promise<SyncJob[]> { const result = await invoke('status'); if (!Array.isArray(result.jobs)) throw new Error('자동 동기화 현황 응답을 확인해주세요.'); return result.jobs },
  async run(kind: SyncKind) { return invoke('run', kind) },
}
