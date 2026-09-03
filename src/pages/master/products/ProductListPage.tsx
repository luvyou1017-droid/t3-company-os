import { useEffect, useMemo, useState } from 'react'
import { productService } from '../../../features/productMaster/services/productService'
import type { ProductMaster } from '../../../features/productMaster/types'
import type { ProductMasterPermission } from '../../../features/productMaster/permissions'

const money = (value: number) => `${value.toLocaleString('ko-KR')}원`
type ViewMode = 'proposal' | 'admin'

function configurations(product: ProductMaster) {
  const active = product.skus.filter((sku) => sku.active)
  return active.length ? active : [{ id: product.id, productName: product.productName, optionName: '기본 구성', regularPrice: product.regularPrice, groupBuyPrice: product.salePrice, sellerCommissionRate: product.sellerCommissionRate }]
}

function discount(regularPrice: number, groupBuyPrice: number) {
  if (!regularPrice || groupBuyPrice >= regularPrice) return 0
  return Math.ceil((1 - groupBuyPrice / regularPrice) * 100)
}

function proposalText(product: ProductMaster) {
  const priceLines = configurations(product).map((item) => {
    const rate = item.sellerCommissionRate ?? product.sellerCommissionRate
    const sale = discount(item.regularPrice, item.groupBuyPrice)
    return `· ${item.productName ?? product.productName} · ${item.optionName}\n  정상가 ${money(item.regularPrice)} → 공구가 ${money(item.groupBuyPrice)}${sale ? ` (${sale}% 할인)` : ''}\n  셀러 수수료 ${rate}%`
  })
  const references = (product.campaignReferences ?? []).filter((item) => item.sellerName).map((item) => `· 진행 레퍼런스 ${item.sellerName}${item.salesAmount ? ` · 매출 ${money(item.salesAmount)}` : ''}${item.campaignDate ? ` · ${item.campaignDate}` : ''}`)
  return [`[${product.brandName}] ${product.productName}`, ...priceLines, `· 배송 ${product.shippingFee ? money(product.shippingFee) : '무료배송'}`, `· 샘플 ${product.sampleAvailable ? (product.sampleSupportType || '지원 가능') : '별도 협의'}`, ...(product.productUrl ? [`· 상품 링크 ${product.productUrl}`] : []), ...references].join('\n')
}

export function ProductListPage({ onOpen, permission }: { onOpen: (id?: string) => void; permission: ProductMasterPermission }) {
  const [products, setProducts] = useState<ProductMaster[]>([])
  const [query, setQuery] = useState('')
  const [brand, setBrand] = useState('')
  const [viewMode, setViewMode] = useState<ViewMode>('proposal')
  const [copied, setCopied] = useState('')
  const load = () => productService.listProducts().then(setProducts)
  useEffect(() => { void load() }, [])

  const brands = useMemo(() => [...new Set(products.map((product) => product.brandName))].sort((a, b) => a.localeCompare(b, 'ko')), [products])
  const filtered = useMemo(() => products.filter((product) => {
    const text = `${product.brandName} ${product.productName} ${product.vendorName ?? ''}`.toLowerCase()
    return (!query || text.includes(query.toLowerCase())) && (!brand || product.brandName === brand)
  }).sort((a, b) => a.brandName.localeCompare(b.brandName, 'ko') || a.productName.localeCompare(b.productName, 'ko')), [products, query, brand])
  const grouped = useMemo(() => {
    const map = new Map<string, ProductMaster[]>()
    filtered.forEach((product) => map.set(product.brandName, [...(map.get(product.brandName) ?? []), product]))
    return Array.from(map, ([brandName, items]) => ({ brandName, items }))
  }, [filtered])

  const copy = async (label: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(`${label} 복사 완료`)
      window.setTimeout(() => setCopied(''), 1800)
    } catch { window.prompt('아래 내용을 복사해주세요.', text) }
  }
  const deactivate = async (product: ProductMaster) => {
    if (!window.confirm(`${product.productName} 상품을 비활성화할까요?`)) return
    await productService.deactivateProduct(product.id)
    await load()
  }
  const openSellerCatalog = () => window.open('/seller/catalog', '_blank', 'noopener,noreferrer')
  const copySellerCatalogUrl = () => void copy('셀러 카탈로그 주소', `${window.location.origin}/seller/catalog`)

  return <section className="master-page">
    <div className="master-page__heading">
      <div><p className="page-eyebrow">SELLER PROPOSAL CATALOG</p><h1>브랜드·상품 제안서</h1><p>셀러에게 안내할 구성과 공구 조건을 한눈에 확인하고 바로 복사합니다.</p></div>
      <div className="proposal-heading-actions"><button className="secondary-button" onClick={copySellerCatalogUrl}>카탈로그 주소 복사</button><button className="secondary-button" onClick={openSellerCatalog}>셀러 화면 열기</button><div className="proposal-view-toggle"><button className={viewMode === 'proposal' ? 'is-active' : ''} onClick={() => setViewMode('proposal')}>셀러 제안 보기</button><button className={viewMode === 'admin' ? 'is-active' : ''} onClick={() => setViewMode('admin')}>내부 관리</button></div>{permission.canCreate && <button className="primary-button" onClick={() => onOpen()}>상품 추가</button>}</div>
    </div>
    {copied && <div className="copy-toast" role="status">✓ {copied}</div>}
    <div className="proposal-filters"><input aria-label="상품 검색" placeholder="브랜드 또는 상품명 검색" value={query} onChange={(event) => setQuery(event.target.value)} /><select aria-label="브랜드 선택" value={brand} onChange={(event) => setBrand(event.target.value)}><option value="">전체 브랜드</option>{brands.map((item) => <option key={item}>{item}</option>)}</select></div>

    {viewMode === 'proposal' ? <div className="proposal-catalog">
      {grouped.map((group) => <section className="proposal-brand" key={group.brandName}>
        <header><div><span className="brand-mark" aria-hidden="true">{group.brandName.slice(0, 1)}</span><div><h2>{group.brandName}</h2><p>상품 {group.items.length}개</p></div></div><button className="copy-button" onClick={() => void copy(`${group.brandName} 전체`, group.items.map(proposalText).join('\n\n'))}>브랜드 전체 복사</button></header>
        <div className="proposal-product-list">{group.items.map((product) => <article className="proposal-product" key={product.id}>
          <div className="proposal-product__intro"><div className="product-thumb">{product.representativeImageUrl || product.imageUrl ? <img src={product.representativeImageUrl ?? product.imageUrl} alt="" /> : '이미지 없음'}</div><div><h3>{product.productName}</h3><p>{product.category ?? '카테고리 미등록'} · {product.vendorName ?? '공급처 미지정'}</p></div></div>
          <div className="proposal-price-table"><div className="proposal-price-head"><span>상품명</span><span>구성</span><span>정상가</span><span>공구가</span><span>할인</span><span>셀러 수수료</span></div>{configurations(product).map((item) => <div className="proposal-price-row" key={item.id}><strong>{item.productName ?? product.productName}</strong><span>{item.optionName}</span><span>{money(item.regularPrice)}</span><b>{money(item.groupBuyPrice)}</b><em>{discount(item.regularPrice, item.groupBuyPrice)}%</em><span>{item.sellerCommissionRate ?? product.sellerCommissionRate}%</span></div>)}</div>
          <div className="proposal-product__foot"><p>배송 {product.shippingFee ? money(product.shippingFee) : '무료'} · 샘플 {product.sampleAvailable ? (product.sampleSupportType || '지원 가능') : '협의'} · 진행 레퍼런스 {(product.campaignReferences ?? []).length}건</p><div>{product.productUrl && <a className="secondary-button product-link-button" href={product.productUrl} target="_blank" rel="noreferrer">상품 링크</a>}<button className="copy-button" onClick={() => void copy(product.productName, proposalText(product))}>상품 복사</button><button className="secondary-button" onClick={() => onOpen(product.id)}>{permission.canEdit ? '상세 수정' : '상세 보기'}</button></div></div>
        </article>)}</div>
      </section>)}
      {!grouped.length && <div className="workspace-empty"><h2>표시할 상품이 없습니다.</h2><p>상품을 추가하거나 검색 조건을 바꿔주세요.</p></div>}
    </div> : <div className="panel"><div className="panel__header"><div><h2>내부 상품 관리</h2><p>공급가, 구성 코드, 공개 상태처럼 운영에 필요한 상세 정보를 관리합니다.</p></div></div><div className="table-wrap"><table className="product-master-table"><thead><tr><th>브랜드</th><th>상품명</th><th>공급처</th><th>구성 수</th><th>공구가</th><th>셀러 공개</th><th>상태</th><th>관리</th></tr></thead><tbody>{filtered.map((product) => <tr key={product.id}><td>{product.brandName}</td><td>{product.productName}</td><td>{product.vendorName ?? '-'}</td><td>{configurations(product).length}개</td><td>{money(Math.min(...configurations(product).map((item) => item.groupBuyPrice)))}</td><td>{product.sellerPortalVisible ? '공개' : '비공개'}</td><td>{product.active ? '활성' : '비활성'}</td><td><div className="table-actions"><button onClick={() => onOpen(product.id)}>{permission.canEdit ? '상세 수정' : '상세 보기'}</button>{permission.canDeactivate && product.active && <button className="danger-text" onClick={() => void deactivate(product)}>비활성화</button>}</div></td></tr>)}</tbody></table></div></div>}
  </section>
}
