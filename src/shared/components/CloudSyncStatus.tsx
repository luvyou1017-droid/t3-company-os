import { useEffect, useState } from 'react'
import { cloudSyncService } from '../services/cloudSyncService'

export function CloudSyncIndicator() {
  const [detail, setDetail] = useState(cloudSyncService.getStatus())
  useEffect(() => cloudSyncService.subscribe(setDetail), [])
  const label = detail.status === 'synced' ? '공용 저장 완료'
    : detail.status === 'migration_required' ? '기존 자료 이전 필요'
      : detail.status === 'setup_required' ? 'DB 설정 필요'
        : detail.status === 'error' ? '동기화 확인 필요' : '연결 중'
  return <span className={`cloud-sync-indicator is-${detail.status}`} title={detail.message}><i aria-hidden="true" />{label}</span>
}

export function CloudSyncBanner() {
  const [detail, setDetail] = useState(cloudSyncService.getStatus())
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => cloudSyncService.subscribe(setDetail), [])
  const connectShared = async () => {
    if (busy) return
    setBusy(true)
    setError('')
    try {
      cloudSyncService.downloadBackup()
      await cloudSyncService.adoptSharedWorkspace()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '공용 자료를 연결하지 못했습니다. 다시 시도해 주세요.')
    } finally {
      setBusy(false)
    }
  }
  if (detail.status === 'synced' || detail.status === 'connecting') return null
  return <div className={`cloud-sync-banner is-${detail.status}`} role="status" aria-busy={busy}>
    <div>
      <strong>{detail.status === 'migration_required' ? '이 기기에 회사 공용 자료를 연결해 주세요' : '공용 데이터 연결을 확인해 주세요'}</strong>
      <span>{detail.status === 'migration_required' ? '이 기기의 자료를 먼저 백업한 뒤 회사 공용 DB 자료를 불러옵니다. 연결이 완료되면 이 안내는 사라집니다.' : detail.message}</span>
      {error && <p role="alert">{error}</p>}
    </div>
    {detail.status === 'migration_required' && <button type="button" disabled={busy} onClick={() => void connectShared()}>{busy ? '공용 자료 연결 중…' : '백업 후 공용 자료 연결'}</button>}
  </div>
}
