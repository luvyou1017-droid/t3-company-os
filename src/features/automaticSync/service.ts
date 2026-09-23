import { supabase } from '../../shared/lib/supabase'
import type { SyncJob, SyncKind } from './model'

async function explainInvokeError(error: { name?: string; context?: unknown }) {
  const response = error.context
  if (response instanceof Response) {
    let reason = ''
    try { reason = String((await response.clone().json())?.error ?? '') } catch { /* response may not be JSON */ }
    if (response.status === 401) return '로그인 인증이 만료되었습니다. 다시 로그인한 뒤 동기화해주세요.'
    if (response.status === 403) return 'Notion 일정 동기화는 승인된 대표·관리자 계정에서만 실행할 수 있습니다.'
    return `Notion 동기화 서버 오류 (${response.status})${reason ? `: ${reason}` : ''}`
  }
  if (error.name === 'FunctionsFetchError') return 'Notion 동기화 서버에 연결하지 못했습니다. 네트워크 또는 CORS 설정을 확인해주세요.'
  return 'Notion 동기화 서버 호출에 실패했습니다. 잠시 후 다시 시도해주세요.'
}

async function invoke(action: 'status' | 'run' | 'exclude', kind?: SyncKind, ids?: string[], reason?: string) {
  if (!supabase) throw new Error('운영 DB 연결을 확인해주세요.')
  const { data: auth, error: sessionError } = await supabase.auth.getSession()
  if (sessionError || !auth.session?.access_token) throw new Error('로그인 인증이 만료되었습니다. 다시 로그인한 뒤 동기화해주세요.')
  const { data, error } = await supabase.functions.invoke('automatic-sync', {
    body: { action, kind, ids, reason },
    headers: { Authorization: `Bearer ${auth.session.access_token}` },
  })
  if (error) throw new Error(await explainInvokeError(error))
  if (data?.error) throw new Error(data.error)
  return data
}
export const automaticSyncService = {
  async status(): Promise<SyncJob[]> { const result = await invoke('status'); if (!Array.isArray(result.jobs)) throw new Error('자동 동기화 현황 응답을 확인해주세요.'); return result.jobs },
  async run(kind: SyncKind) { return invoke('run', kind) },
  async exclude(ids: string[], reason?: string) { return invoke('exclude', undefined, ids, reason) },
}
