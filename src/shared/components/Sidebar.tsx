import type { AppPage } from '../../App'

const navigationItems: AppPage[] = [
  'Dashboard',
  'My Work',
  '공동구매 일정',
  'CS 관리',
  '샘플 관리',
  '판매 데이터',
  '정산 관리',
  '지급 승인',
  ...(import.meta.env.DEV ? ['운영 시나리오 테스트', 'Supabase 파일럿 테스트'] as AppPage[] : []),
]
const masterGroups: Array<{ label: string; items: { label: string; page: AppPage }[] }> = [
  { label: '제품관련 DB', items: [
    { label: '공급처 DB', page: '벤더 마스터' }, { label: '브랜드 DB', page: '브랜드 마스터' },
    { label: '공동구매 물품 DB', page: '상품 마스터' }, { label: '공동구매 제안서 DB', page: '제안서 마스터' },
  ] },
  { label: '셀러관련 DB', items: [
    { label: '셀러 DB', page: '셀러 마스터' }, { label: '매니저 DB', page: '매니저 마스터' },
  ] },
  { label: '데이터 관리', items: [{ label: '가져오기/내보내기', page: '가져오기/내보내기' }] },
]
const masterItems = masterGroups.flatMap((group) => group.items)

type SidebarProps = {
  activePage: AppPage
  onNavigate: (page: AppPage) => void
}

function isNavigablePage(item: string): item is AppPage {
  return navigationItems.includes(item as AppPage) || masterItems.some((master) => master.page === item)
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
        <div className="sidebar__group">
          <span className="sidebar__group-label">마스터 관리</span>
          {masterGroups.map((group) => <div className="sidebar__subgroup" key={group.label}><span>{group.label}</span>{group.items.map((item) => <button className={item.page === activePage ? 'sidebar__item sidebar__subitem is-active' : 'sidebar__item sidebar__subitem'} key={item.page} onClick={() => onNavigate(item.page)} type="button">{item.label}</button>)}</div>)}
        </div>
      </nav>
    </aside>
  )
}
