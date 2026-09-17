import { useEffect, useMemo, useState } from 'react'
import { useCompanyAuth } from '../../features/auth/AuthGate'
import { productService } from '../../features/productMaster/services/productService'
import type { PartnerCatalogProduct } from '../../features/productMaster/types'

const money = (value: number) => `${value.toLocaleString('ko-KR')}원`

export function PartnerCatalogPage() {
  const { profile, signOut } = useCompanyAuth()
  const [products, setProducts] = useState<PartnerCatalogProduct[]>([])
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState('')
  const allowed = ['partner_vendor', 'ceo', 'admin'].includes(profile.role)

  useEffect(() => { if (allowed) void productService.listPartnerCatalog().then(setProducts) }, [allowed])
  const categories = useMemo(() => [...new Set(products.map((product) => product.category).filter(Boolean))] as string[], [products])
  const filtered = products.filter((product) => {
    const text = `${product.brandName} ${product.productName} ${product.category ?? ''} ${product.description ?? ''}`.toLowerCase()
    return (!query || text.includes(query.toLowerCase())) && (!category || product.category === category)
  })

  if (!allowed) return <main className="auth-page"><section className="auth-card auth-card--notice"><div className="auth-brand">W</div><h1>협력 벤더 승인이 필요해요</h1><p className="auth-description">승인된 협력 벤더 계정만 공급가를 확인할 수 있습니다.</p><button className="auth-mode-button" onClick={() => void signOut()}>다른 계정으로 로그인</button></section></main>

  return <div className="seller-portal partner-portal">
    <nav><strong>와이즈벤더 파트너 공급 상품</strong><div><span>{profile.display_name}</span><button onClick={() => void signOut()}>로그아웃</button></div></nav>
    <main><section className="seller-catalog">
      <header className="catalog-hero"><div><p className="page-eyebrow">APPROVED PARTNER CATALOG</p><h1>파트너 벤더 공급 가능 상품</h1><p>와이즈벤더가 협력 벤더에게 공급할 수 있는 상품입니다. 실제 공급은 일정·재고 확인 후 확정됩니다.</p></div><aside className="catalog-manager"><span>공급가 공개 범위</span><strong>승인 계정 전용</strong><p>화면에 표시된 공급 조건은 외부 공유 없이 협력 검토에만 사용해주세요.</p></aside></header>
      <div className="catalog-filters"><input aria-label="파트너 상품 검색" placeholder="브랜드 또는 상품명 검색" value={query} onChange={(event) => setQuery(event.target.value)} /><select aria-label="카테고리 선택" value={category} onChange={(event) => setCategory(event.target.value)}><option value="">전체 카테고리</option>{categories.map((item) => <option key={item}>{item}</option>)}</select></div>
      <div className="catalog-result-head"><strong>공급 가능 상품 {filtered.length}개</strong><span>공급가는 승인된 벤더에게만 표시됩니다.</span></div>
      {filtered.length ? <div className="catalog-grid">{filtered.map((product) => <article className="catalog-card partner-card" key={product.id}>
        <div className="catalog-card__image">{product.representativeImageUrl ? <img src={product.representativeImageUrl} alt="" /> : <span>상품 이미지 준비 중</span>}<span className="catalog-status available">공급 가능</span></div>
        <div className="catalog-card__body"><small>{product.brandName}</small><h2>{product.productName}</h2><p>{product.category ?? '카테고리 미정'}</p>{product.description && <p className="partner-description">{product.description}</p>}
          <div className="partner-price-list">{product.options.length ? product.options.map((option) => <div key={option.id}><span>{option.optionName}</span><dl><div><dt>권장 공구가</dt><dd>{money(option.groupBuyPrice)}</dd></div><div className="partner-supply-price"><dt>벤더 공급가</dt><dd>{money(option.supplyPrice)}</dd></div></dl></div>) : <div><span>기본 구성</span><strong>공급 조건 확인 필요</strong></div>}</div>
          <footer><span>{product.shippingGuide}</span><strong>{product.minimumOrder || '최소 조건 별도 협의'}</strong></footer>{product.supplyNote && <p className="partner-supply-note">{product.supplyNote}</p>}
        </div>
      </article>)}</div> : <div className="catalog-empty"><h2>현재 조건에 맞는 상품이 없습니다.</h2><p>검색어를 바꾸거나 담당자에게 문의해주세요.</p></div>}
    </section></main>
  </div>
}
