import { useCompanyAuth } from '../../features/auth/AuthGate'
import { AutomaticSyncPanel } from '../../features/automaticSync/AutomaticSyncPanel'
import { WorkspaceDataSyncPanel } from './WorkspaceDataSyncPanel'

export function NotionImportPage() {
  const { profile } = useCompanyAuth()
  const admin = profile.role === 'ceo' || profile.role === 'admin'
  return <section className="master-page notion-import-page">
    <div className="master-page__heading"><div><p className="page-eyebrow">SUPABASE · EXTERNAL INPUT</p><h1>가져오기/내보내기</h1><p>Supabase 공용 DB가 업무 데이터의 기준입니다. Notion 일정은 외부 입력원이며 검토 후 반영합니다.</p></div></div>
    <AutomaticSyncPanel />
    {admin && <details><summary>관리자 도구 · 기존 로컬 데이터 마이그레이션</summary><WorkspaceDataSyncPanel /></details>}
  </section>
}
