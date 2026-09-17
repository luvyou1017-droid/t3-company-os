import { useEffect, useState } from 'react'
import { useCompanyAuth } from '../../features/auth/AuthGate'
import { cloudSyncService } from '../../shared/services/cloudSyncService'

export function WorkspaceDataSyncPanel() {
  const { profile } = useCompanyAuth()
  const [detail, setDetail] = useState(cloudSyncService.getStatus())
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const canMigrate = profile.role === 'ceo' || profile.role === 'admin'
  const recordCount = cloudSyncService.getLocalRecordCount()

  useEffect(() => cloudSyncService.subscribe(setDetail), [])

  const migrate = async () => {
    setBusy(true)
    setMessage('')
    try {
      cloudSyncService.downloadBackup()
      const result = await cloudSyncService.migrateThisComputer()
      setMessage(`백업 파일을 저장했고, ${result.storageAreas}개 데이터 영역·약 ${result.records}건을 공용 DB로 이전했습니다.`)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '데이터 이전에 실패했습니다.')
    } finally { setBusy(false) }
  }

  const adoptShared = async () => {
    setBusy(true)
    setMessage('')
    try {
      cloudSyncService.downloadBackup()
      const result = await cloudSyncService.adoptSharedWorkspace()
      setMessage(`이 컴퓨터의 기존 자료를 백업하고, 공용 DB의 ${result.storageAreas}개 데이터 영역·약 ${result.records}건을 적용했습니다.`)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '공용 자료 적용에 실패했습니다.')
    } finally { setBusy(false) }
  }

  const restore = async (file?: File) => {
    if (!file) return
    setBusy(true)
    setMessage('')
    try {
      const result = await cloudSyncService.importBackup(file)
      setMessage(`백업 파일에서 약 ${result.records}건을 복원하고 공용 DB에 반영했습니다.`)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '백업 복원에 실패했습니다.')
    } finally { setBusy(false) }
  }

  return <section className="workspace-sync-panel">
    <div className="workspace-sync-panel__heading"><div><p className="page-eyebrow">COMPANY DATA SYNC</p><h2>컴퓨터 간 데이터 통합</h2><p>현재 컴퓨터에 저장된 업무 자료를 백업한 뒤 회사 공용 데이터베이스로 이전합니다.</p></div><span className={`workspace-sync-state is-${detail.status}`}>{detail.status === 'synced' ? '공용 저장 중' : detail.status === 'migration_required' ? '이전 필요' : '확인 필요'}</span></div>
    <div className="workspace-sync-summary"><div><span>현재 컴퓨터 자료</span><strong>약 {recordCount}건</strong></div><div><span>공용 저장 상태</span><strong>{detail.status === 'synced' ? '연결 완료' : '미완료'}</strong></div><div><span>다른 컴퓨터 반영</span><strong>{detail.status === 'synced' ? '자동' : '이전 후 자동'}</strong></div></div>
    <div className="workspace-sync-notice"><strong>{detail.status === 'migration_required' ? '공용 DB 자료를 기준으로 연결합니다' : '이 컴퓨터를 기준으로 통합합니다'}</strong><p>{detail.status === 'migration_required' ? '버튼을 누르면 이 컴퓨터의 기존 자료를 먼저 백업한 뒤 회사 공용 자료로 교체합니다. 필터·스크롤·작성 중 초안은 개인 설정으로 남습니다.' : '버튼을 누르면 먼저 JSON 백업 파일이 내려받아지고, 그다음 현재 컴퓨터의 업무 자료가 공용본으로 저장됩니다. 필터·스크롤·작성 중 초안은 개인 설정으로 남습니다.'}</p></div>
    {message && <p className="workspace-sync-message" role="status">{message}</p>}
    <div className="workspace-sync-actions"><button className="secondary-button" type="button" onClick={() => { cloudSyncService.downloadBackup(); setMessage('현재 컴퓨터의 백업 파일을 저장했습니다.') }}>백업 파일만 저장</button>{detail.status === 'migration_required' && <button className="primary-action" disabled={busy} type="button" onClick={() => void adoptShared()}>{busy ? '공용 자료 적용 중…' : '백업 후 공용 DB 자료 사용'}</button>}{canMigrate && detail.status !== 'migration_required' && <button className="primary-action" disabled={busy} type="button" onClick={() => void migrate()}>{busy ? '안전하게 이전 중…' : detail.status === 'synced' ? '현재 자료로 다시 동기화' : '백업 후 공용 DB로 이전'}</button>}<label className="secondary-button workspace-sync-upload">백업 파일 복원<input type="file" accept="application/json,.json" disabled={busy || !canMigrate} onChange={(event) => void restore(event.target.files?.[0])} /></label></div>
    {!canMigrate && <small>공용 자료를 이 컴퓨터에 적용할 수 있습니다. 공용본에 덮어쓰기와 백업 복원은 대표 또는 관리자 계정에서만 가능합니다.</small>}
  </section>
}
