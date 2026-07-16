import type { ReactNode } from 'react'
import type { AppPage } from '../../App'
import { Header } from '../../shared/components/Header'
import { Sidebar } from '../../shared/components/Sidebar'

type AppLayoutProps = {
  activePage: AppPage
  children: ReactNode
  onOpenCsCase: (csCaseId: string) => void
  onNavigate: (page: AppPage) => void
}

export function AppLayout({ activePage, children, onNavigate, onOpenCsCase }: AppLayoutProps) {
  return (
    <div className="app-shell">
      <Sidebar activePage={activePage} onNavigate={onNavigate} />
      <div className="app-content">
        <Header onOpenCsCase={onOpenCsCase} />
        <main className="main-content">{children}</main>
      </div>
    </div>
  )
}
