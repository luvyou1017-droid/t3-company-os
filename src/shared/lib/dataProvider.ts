import { isSupabaseConfigured } from './supabase'

export type DataProviderMode = 'local' | 'supabase'

export function getDataProviderMode(): DataProviderMode {
  return isSupabaseConfigured() ? 'supabase' : 'local'
}

export function requireSupabaseMode() {
  if (!isSupabaseConfigured()) throw new Error('Supabase 환경변수가 설정되지 않아 Local 모드로 동작합니다.')
}
