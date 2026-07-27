import type { AppPage } from '../../App'

const navigationItems = [
  'Dashboard',
  'My Work',
  '공동구매 일정',
  'CS 관리',
  '샘플 관리',
  '판매 데이터',
  '정산 관리',
  '지급 승인',
  '셀러 관리',
  '상품·제안서',
  '설정',
  ...(import.meta.env.DEV ? ['운영 시나리오 테스트', 'Supabase 파일럿 테스트'] : []),
]

type SidebarProps = {
  activePage: AppPage
  onNavigate: (page: AppPage) => void
}

function isNavigablePage(item: string): item is AppPage {
  return item === 'Dashboard' || item === 'My Work' || item === '공동구매 일정' || item === 'CS 관리' || item === '샘플 관리' || item === '판매 데이터' || item === '정산 관리' || item === '지급 승인' || (import.meta.env.DEV && (item === '운영 시나리오 테스트' || item === 'Supabase 파일럿 테스트'))
}

export function Sidebar({ activePage, onNavigate }: SidebarProps) {
  return (
    <aside className="sidebar" aria-label="Main navigation">
      <div className="sidebar__brand">
        <div className="sidebar__logo">T3</div>
        <div>
          <strong>T3 Company OS</strong>
          <span>Group buying operations</span>
        </div>
      </div>

      <nav className="sidebar__nav">
        {navigationItems.map((item) => (
          <button
            className={item === activePage ? 'sidebar__item is-active' : 'sidebar__item'}
            disabled={!isNavigablePage(item)}
            key={item}
            onClick={() => {
              if (isNavigablePage(item)) {
                onNavigate(item)
              }
            }}
            type="button"
          >
            {item}
          </button>
        ))}
      </nav>
    </aside>
  )
}
