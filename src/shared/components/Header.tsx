import { NotificationCenter } from '../notifications/NotificationCenter'

type HeaderProps = {
  onOpenCsCase: (csCaseId: string) => void
}

export function Header({ onOpenCsCase }: HeaderProps) {
  return (
    <header className="header">
      <div>
        <p className="header__eyebrow">운영 대시보드</p>
        <h1>오늘의 공동구매 운영 현황</h1>
      </div>
      <div className="header__right">
        <NotificationCenter onOpenCsCase={onOpenCsCase} />
        <div className="header__user">
          <span className="header__role">대표</span>
          <strong>이현지</strong>
        </div>
      </div>
    </header>
  )
}
