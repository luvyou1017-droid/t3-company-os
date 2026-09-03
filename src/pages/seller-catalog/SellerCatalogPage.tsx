import { useEffect, useMemo, useState } from 'react'
import { productService } from '../../features/productMaster/services/productService'
import type { ProductBadge, SellerCatalogProduct, SellerPortalStatus } from '../../features/productMaster/types'

const money = (value: number) => `${value.toLocaleString('ko-KR')}원`
const statusLabels: Record<SellerPortalStatus, string> = {
  available: '공구 가능', coming_soon: '곧 진행 가능', paused: '일시 중단', sold_out: '품절', closed: '진행 종료',
}
const badgeLabels: Record<ProductBadge, string> = { new: 'NEW', popular: '인기', recommended: '추천', recently_successful: '최근 진행 성과' }

function priceRange([min, max]: [number, number]) {
  return min === max ? money(min) : `${money(min)} ~ ${money(max)}`
}

export function SellerCatalogPage({ productId, onOpen, onBackToCatalog, onLeave }: { productId?: string; onOpen: (id: string) => void; onBackToCatalog: () => void; onLeave: () => void }) {
  const [products, setProducts] = useState<SellerCatalogProduct[]>([])
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState('')

  useEffect(() => { void productService.listSellerCatalog().then(setProducts) }, [])
  const current = productId ? products.find((product) => product.id === productId) : undefined
  const categories = useMemo(() => [...new Set(products.map((product) => product.category).filter(Boolean))] as string[], [products])
  const filtered = products.filter((product) => {
    const text = `${product.brandName} ${product.productName} ${product.category ?? ''} ${product.sellerDescription ?? ''} ${product.options.map((option) => option.optionName).join(' ')}`.toLowerCase()
    return (!query || text.includes(query.toLowerCase())) && (!category || product.category === category)
  })

  if (productId && products.length > 0 && !current) {
    return <PortalShell onLeave={onLeave}><div className="catalog-empty"><h1>조회할 수 없는 상품입니다</h1><p>비공개 또는 판매가 중단된 상품은 셀러 카탈로그에서 확인할 수 없습니다.</p><button className="primary-button" onClick={onBackToCatalog}>카탈로그로 돌아가기</button></div></PortalShell>
  }
  if (productId && !current) return <PortalShell onLeave={onLeave}><div className="catalog-empty">상품 정보를 확인하고 있습니다.</div></PortalShell>
  if (current) return <PortalShell onLeave={onLeave}><SellerProductDetail product={current} onBack={onBackToCatalog} /></PortalShell>

  return <PortalShell onLeave={onLeave}>
    <section className="seller-catalog">
      <header className="catalog-hero"><div><p className="page-eyebrow">T3 PRODUCT CATALOG</p><h1>진행 가능한 공동구매 상품</h1><p>구매나 즉시 신청을 위한 쇼핑몰이 아닙니다. 궁금한 상품은 담당 매니저와 상의해주세요.</p></div><ManagerCard /></header>
      <div className="catalog-filters">
        <input aria-label="상품 검색" placeholder="브랜드, 상품, 옵션, 카테고리 검색" value={query} onChange={(event) => setQuery(event.target.value)} />
        <select aria-label="카테고리별 보기" value={category} onChange={(event) => setCategory(event.target.value)}><option value="">전체 카테고리</option>{categories.map((item) => <option key={item}>{item}</option>)}</select>
      </div>
      <div className="catalog-result-head"><strong>전체 상품 {filtered.length}개</strong><span>담당 매니저와 조건 확인 후 실제 진행이 확정됩니다.</span></div>
      {filtered.length ? <div className="catalog-grid">{filtered.map((product) => <button className="catalog-card" key={product.id} onClick={() => onOpen(product.id)}>
        <div className="catalog-card__image">{product.representativeImageUrl ? <img src={product.representativeImageUrl} alt="" /> : <span>상품 이미지 준비 중</span>}<span className={`catalog-status ${product.sellerPortalStatus}`}>{statusLabels[product.sellerPortalStatus]}</span></div>
        <div className="catalog-card__body"><div className="catalog-badges">{product.badges.map((item) => <span key={item}>{badgeLabels[item]}</span>)}</div><small>{product.brandName}</small><h2>{product.productName}</h2><p>{product.category ?? '카테고리 미정'}</p><dl><div><dt>예상 소비자가</dt><dd>{priceRange(product.regularPriceRange)}</dd></div><div><dt>예상 공구가</dt><dd>{priceRange(product.groupBuyPriceRange)}</dd></div></dl><footer><span>{product.shippingGuide}</span><strong>{product.sampleAvailable ? '샘플 가능' : '샘플 협의'}</strong></footer></div>
      </button>)}</div> : <div className="catalog-empty"><h2>원하는 상품을 찾지 못하셨나요?</h2><p>담당 매니저에게 문의해주세요.</p></div>}
    </section>
  </PortalShell>
}

function PortalShell({ children, onLeave }: { children: React.ReactNode; onLeave: () => void }) {
  return <div className="seller-portal"><nav><strong>와이즈벤더 상품 카탈로그</strong><button onClick={onLeave}>운영자 로그인</button></nav><main>{children}</main></div>
}

function ManagerCard({ name = '와이즈벤더 담당 매니저' }: { name?: string }) {
  return <aside className="catalog-manager"><span>담당 매니저</span><strong>{name}</strong><p>궁금한 상품이 있으면 담당 매니저에게 편하게 문의해주세요.</p></aside>
}

function SellerProductDetail({ product, onBack }: { product: SellerCatalogProduct; onBack: () => void }) {
  return <section className="catalog-detail">
    <button className="catalog-back" onClick={onBack}>← 상품 목록</button>
    <div className="catalog-detail__hero"><div className="catalog-detail__image">{product.representativeImageUrl ? <img src={product.representativeImageUrl} alt={product.productName} /> : '상품 이미지 준비 중'}</div><div>
      <div className="catalog-badges">{product.badges.map((item) => <span key={item}>{badgeLabels[item]}</span>)}</div><p className="catalog-brand">{product.brandName}</p><h1>{product.productName}</h1><span className={`catalog-status ${product.sellerPortalStatus}`}>{statusLabels[product.sellerPortalStatus]}</span>
      <p className="catalog-description">{product.sellerDescription}</p><div className="catalog-detail__prices"><div><span>예상 소비자가</span><strong>{priceRange(product.regularPriceRange)}</strong></div><div><span>예상 공구가</span><strong>{priceRange(product.groupBuyPriceRange)}</strong></div></div>
      <dl className="catalog-public-info"><div><dt>카테고리</dt><dd>{product.category ?? '미정'}</dd></div><div><dt>배송 안내</dt><dd>{product.shippingGuide}</dd></div><div><dt>샘플</dt><dd>{product.sampleAvailable ? '샘플 가능' : '담당 매니저와 협의'}</dd></div></dl>
    </div></div>
    <section className="catalog-options"><h2>대표 옵션 및 구성</h2>{product.options.map((option) => <div key={option.id}><span>{option.optionName}</span><strong>{money(option.groupBuyPrice)}</strong></div>)}</section>
    <section className="catalog-contact"><ManagerCard name={product.managerName} /><div><h2>이 상품이 궁금하신가요?</h2><p>실제 진행 가능 일정과 세부 조건은 담당 매니저가 카카오톡 또는 전화로 안내해드립니다.</p><button className="primary-button" onClick={() => window.alert(`${product.managerName} 매니저에게 문의해주세요.${product.managerContact ? `\\n${product.managerContact}` : ''}`)}>담당 매니저에게 문의</button></div></section>
  </section>
}
