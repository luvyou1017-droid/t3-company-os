import type { LinkOwner } from '../types/campaign'

type LandingKind = 'wise' | 'supplier' | 'seller' | 'unknown'

const presentation: Record<LandingKind, { icon: string; label: string }> = {
  wise: { icon: '🛍️', label: '와이즈' },
  supplier: { icon: '🏢', label: '공급사' },
  seller: { icon: '👤', label: '셀러' },
  unknown: { icon: '🔗', label: '확인 필요' },
}

function getKind(landingPageType?: string, linkOwner?: LinkOwner): LandingKind {
  if (landingPageType === 'wise_shop_link' || landingPageType?.includes('와이즈') || landingPageType?.includes('스룩')) return 'wise'
  if (landingPageType === 'supplier_link' || landingPageType === '공급사' || linkOwner === '브랜드사') return 'supplier'
  if (landingPageType === 'seller_checkout' || landingPageType === '셀러' || linkOwner === '셀러') return 'seller'
  if (linkOwner === '자사') return 'wise'
  return 'unknown'
}

export function LandingPageBadge({ landingPageType, linkOwner }: { landingPageType?: string; linkOwner?: LinkOwner }) {
  const kind = getKind(landingPageType, linkOwner)
  const item = presentation[kind]
  const label = landingPageType === 'wise_shop_link' ? '와이즈(스룩)'
    : landingPageType === 'supplier_link' ? '공급사'
      : landingPageType === 'seller_checkout' ? '셀러'
        : kind === 'wise' && landingPageType ? landingPageType : item.label

  return <span className={`landing-page-badge landing-page-badge--${kind}`}><span aria-hidden="true">{item.icon}</span>{label}</span>
}
