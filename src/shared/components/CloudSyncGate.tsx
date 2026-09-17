import { useEffect, useState, type ReactNode } from 'react'
import { cloudSyncService, type CloudSyncStatus } from '../services/cloudSyncService'

export function CloudSyncGate({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<CloudSyncStatus>(() => cloudSyncService.hasCompletedInitialSync() ? 'synced' : 'connecting')

  useEffect(() => {
    let active = true
    let stop: () => void = () => undefined
    void cloudSyncService.initialize().then((result) => {
      if (!active) return
      setStatus(result.status)
      stop = result.stop
    })
    const unsubscribe = cloudSyncService.subscribe((detail) => {
      if (!active) return
      if (detail.status === 'connecting' && cloudSyncService.hasCompletedInitialSync()) return
      setStatus(detail.status)
    })
    return () => { active = false; stop(); unsubscribe() }
  }, [])

  if (status === 'connecting') {
    return <main className="auth-page"><section className="auth-card auth-card--notice"><div className="auth-brand" aria-hidden="true">W</div><h1>회사 데이터를 불러오고 있어요</h1><p className="auth-description">다른 컴퓨터와 동일한 최신 자료를 확인하고 있습니다.</p></section></main>
  }
  return children
}
