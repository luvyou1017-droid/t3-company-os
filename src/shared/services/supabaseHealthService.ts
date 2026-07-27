import { getDataProviderMode } from '../lib/dataProvider'
import { isSupabaseConfigured, supabase } from '../lib/supabase'

export const REQUIRED_SUPABASE_TABLES = [
  'profiles', 'campaigns', 'settlements', 'seller_settlements', 'payment_requests',
  'payment_request_batches', 'payment_evidence', 'withholding_tax_items', 'activity_logs',
] as const

export type ConnectionCheckStatus = 'success' | 'failed' | 'not_configured'
export type ConnectionCheck = { target: string; status: ConnectionCheckStatus; message: string; checkedAt: string }

function safeError(error: { message?: string; code?: string } | null, target: string) {
  const message = error?.message?.toLowerCase() ?? ''
  if (message.includes('does not exist') || error?.code === '42P01') return `${target}이 없습니다. Supabase SQL Editor에서 docs/SUPABASE_SCHEMA.sql을 먼저 실행해주세요.`
  if (message.includes('row-level security') || message.includes('permission denied') || error?.code === '42501') return `${target} RLS 권한이 거부되었습니다. 현재 사용자 역할의 최소 권한 정책을 확인해주세요.`
  if (message.includes('jwt') || message.includes('expired')) return '로그인 세션이 만료되었습니다. 다시 로그인해주세요.'
  if (message.includes('fetch') || message.includes('network')) return '네트워크 연결에 실패했습니다. Supabase URL과 네트워크 상태를 확인해주세요.'
  return `${target} 접근에 실패했습니다. Supabase 설정과 RLS 정책을 확인해주세요.`
}

const checkedAt = () => new Date().toISOString()

export const supabaseHealthService = {
  getConfiguration() {
    return { mode: getDataProviderMode(), configured: isSupabaseConfigured(), urlConfigured: Boolean(import.meta.env.VITE_SUPABASE_URL?.trim()), anonKeyConfigured: Boolean(import.meta.env.VITE_SUPABASE_ANON_KEY?.trim()) }
  },
  async checkSupabaseHealth(): Promise<ConnectionCheck[]> {
    if (!supabase) return [{ target: 'database', status: 'not_configured', message: '환경변수가 없어 Local 모드로 정상 동작 중입니다.', checkedAt: checkedAt() }]
    const results: ConnectionCheck[] = []
    const { data: sessionData, error: sessionError } = await supabase.auth.getSession()
    results.push({ target: 'session', status: sessionError ? 'failed' : 'success', message: sessionError ? safeError(sessionError, '로그인 세션') : sessionData.session ? '로그인 세션이 활성화되어 있습니다.' : '연결됨 · 로그인 세션은 없습니다.', checkedAt: checkedAt() })
    const { error } = await supabase.from('profiles').select('id', { head: true, count: 'exact' })
    results.push({ target: 'database', status: error ? 'failed' : 'success', message: error ? safeError(error, '데이터베이스') : 'Supabase API 연결에 성공했습니다. 실제 저장 성공과는 별도입니다.', checkedAt: checkedAt() })
    return results
  },
  async checkRequiredTables(): Promise<ConnectionCheck[]> {
    if (!supabase) return REQUIRED_SUPABASE_TABLES.map((table) => ({ target: table, status: 'not_configured', message: 'Supabase 환경변수가 없습니다.', checkedAt: checkedAt() }))
    const client = supabase
    return Promise.all(REQUIRED_SUPABASE_TABLES.map(async (table) => {
      const { error } = await client.from(table).select('id', { head: true, count: 'exact' })
      return { target: table, status: error ? 'failed' as const : 'success' as const, message: error ? safeError(error, table) : `${table} 조회 가능`, checkedAt: checkedAt() }
    }))
  },
  async checkStorageBucket(): Promise<ConnectionCheck> {
    if (!supabase) return { target: 'payment-evidence', status: 'not_configured', message: 'Supabase 환경변수가 없습니다.', checkedAt: checkedAt() }
    const { data, error } = await supabase.storage.from('payment-evidence').list('', { limit: 1 })
    if (error) return { target: 'payment-evidence', status: 'failed', message: error.message.toLowerCase().includes('bucket') ? 'Storage bucket이 없습니다. private payment-evidence bucket을 준비해주세요.' : safeError(error, 'Storage bucket'), checkedAt: checkedAt() }
    return { target: 'payment-evidence', status: 'success', message: `private bucket 접근 성공 · ${data.length}개 항목 조회`, checkedAt: checkedAt() }
  },
}
