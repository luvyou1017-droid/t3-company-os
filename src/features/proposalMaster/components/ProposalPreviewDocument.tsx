import type { SharedProposalView } from '../types'

const money = (value: number) => `${value.toLocaleString('ko-KR')}원`

export function ProposalPreviewDocument({ proposal }: { proposal: SharedProposalView }) {
  const representative = proposal.products.find((product) => product.representative) ?? proposal.products[0]
  const rest = proposal.products.filter((product) => product.id !== representative?.id)
  const pages = Array.from({ length: Math.ceil(rest.length / 4) }, (_, index) => rest.slice(index * 4, index * 4 + 4))
  return <div className="proposal-document" aria-label={`${proposal.title} 공유용 제안서`}>
    <ProposalPage className="proposal-cover">
      <header><strong>{proposal.companyLabel}</strong><span>{proposal.category ?? 'PRODUCT PROPOSAL'}</span></header>
      <div className="proposal-cover__title"><p>{proposal.vendorOrBrand}</p><h1>{proposal.title}</h1>{proposal.subtitle && <h2>{proposal.subtitle}</h2>}<span>제안 기준일 {proposal.referenceDateLabel}</span></div>
      {representative && <article className="proposal-featured-product">
        <div className="proposal-featured-product__image">{representative.imageUrl ? <img src={representative.imageUrl} alt="" /> : '상품 이미지 준비 중'}</div>
        <div><small>{representative.brandName} · 대표 추천</small><h2>{representative.productName}</h2><p>{representative.compositionText}</p><PriceBlock product={representative} />{representative.sellerCommissionRate !== undefined && <div className="proposal-commission"><span>셀러 수수료</span><strong>{representative.sellerCommissionRate}%</strong></div>}<p>{representative.shippingText} · {representative.sampleText}</p><PointList points={representative.keyPoints} /></div>
      </article>}
      <footer>상품 진행 가능 일정과 세부 조건은 담당 매니저와 협의해주세요.</footer>
    </ProposalPage>
    {pages.map((products, index) => <ProposalPage key={index}>
      <header><strong>PRODUCT COLLECTION</strong><span>{index + 2} / {pages.length + 2}</span></header>
      <div className="proposal-page-heading"><p>{proposal.vendorOrBrand}</p><h2>추천 상품을 확인해주세요</h2></div>
      <div className="proposal-product-grid">{products.map((product) => <article className="proposal-product-card" key={product.id}>
        <div className="proposal-product-card__image">{product.imageUrl ? <img src={product.imageUrl} alt="" /> : '상품 이미지 준비 중'}</div><small>{product.brandName}</small><h3>{product.productName}</h3><p>{product.compositionText}</p><PriceBlock product={product} compact /><div className="proposal-card-meta"><span>셀러 수수료 {product.sellerCommissionRate ?? '-'}%</span><span>{product.shippingText}</span></div><PointList points={product.keyPoints} />
      </article>)}</div>
      <footer>WISE PRODUCT PROPOSAL</footer>
    </ProposalPage>)}
    <ProposalPage className="proposal-guide-page">
      <header><strong>OPERATION GUIDE</strong><span>마지막 안내</span></header>
      <div className="proposal-page-heading"><p>배송 · 샘플 · 운영</p><h2>진행 전 확인해주세요</h2></div>
      <div className="proposal-guide-grid"><Guide title="배송 안내" body={`${proposal.shippingGuide.courierName ? `${proposal.shippingGuide.courierName} · ` : ''}${proposal.shippingGuide.shippingText}`} /><Guide title="샘플 안내" body={proposal.shippingGuide.sampleText} /><Guide title="교환·반품" body={proposal.shippingGuide.exchangeReturnNotes || '상품별 조건은 담당 매니저가 안내해드립니다.'} /><Guide title="운영 참고" body={proposal.shippingGuide.operationNotes || '실제 일정과 판매 조건은 협의 후 확정됩니다.'} /></div>
      <section className="proposal-selling-points"><h3>이번 제안의 판매 포인트</h3><PointList points={proposal.sellingPoints} /></section>
      <section className="proposal-manager-box"><span>담당 매니저</span><strong>{proposal.contact.managerName}</strong><p>궁금한 상품이 있으면 카카오톡 또는 전화로 편하게 문의해주세요.</p>{proposal.contact.managerContact && <small>{proposal.contact.managerContact}</small>}</section>
      <footer>{proposal.companyLabel} · 본 자료는 상품 검토를 위한 제안서입니다.</footer>
    </ProposalPage>
  </div>
}

function ProposalPage({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <section className={`proposal-page ${className}`}>{children}</section>
}
function PriceBlock({ product, compact = false }: { product: SharedProposalView['products'][number]; compact?: boolean }) {
  return <div className={compact ? 'proposal-price proposal-price--compact' : 'proposal-price'}><div><span>정상가</span><del>{money(product.regularPrice)}</del></div><div><span>공구가</span><strong>{money(product.groupBuyPrice)}</strong></div><b>{product.discountRate}% 할인</b></div>
}
function PointList({ points }: { points: string[] }) {
  return <ul className="proposal-point-list">{points.slice(0, 5).map((point) => <li key={point}>{point}</li>)}</ul>
}
function Guide({ title, body }: { title: string; body: string }) {
  return <article><span>{title}</span><strong>{body}</strong></article>
}
