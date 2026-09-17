import { NotificationCenter } from '../notifications/NotificationCenter'
import { useCompanyAuth, type CompanyProfile } from '../../features/auth/AuthGate'
import { CloudSyncIndicator } from './CloudSyncStatus'

type HeaderProps = {
  onOpenRelated: (targetId: string) => void
}

export function Header({ onOpenRelated }: HeaderProps) {
  const { profile } = useCompanyAuth()
  const roleLabels: Record<CompanyProfile['role'], string> = { ceo: '대표', admin: '관리자', settlement_cs: '정산·CS', team_lead: '팀장', md: 'MD', manager: '매니저', partner_vendor: '협력 벤더' }
  return (
    <header className="header">
      <div>
        <p className="header__eyebrow">운영 대시보드</p>
        <h1>오늘의 공동구매 운영 현황</h1>
      </div>
      <div className="header__right">
        <CloudSyncIndicator />
        <NotificationCenter onOpenRelated={onOpenRelated} />
        <div className="header__user">
          <span className="header__role">{roleLabels[profile.role]}</span>
          <strong>{profile.display_name || profile.email || '회사 사용자'}</strong>
        </div>
      </div>
    </header>
  )
}
