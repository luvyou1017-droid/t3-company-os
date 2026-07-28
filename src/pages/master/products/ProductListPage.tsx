import { useEffect, useMemo, useState } from 'react'
import { productService } from '../../../features/productMaster/services/productService'
import type { ProductMaster, SellerPortalStatus } from '../../../features/productMaster/types'
import type { ProductMasterPermission } from '../../../features/productMaster/permissions'

const money = (value: number) => `${value.toLocaleString('ko-KR')}원`
const channelLabels = { supplier_link: '공급사 링크', wise_shop_link: '와이즈샵', seller_checkout: '셀러 결제창' }
const statusLabels: Record<SellerPortalStatus, string> = { available: '공구 가능', coming_soon: '곧 진행 가능', paused: '일시 중단', sold_out: '품절', closed: '진행 종료' }
type SortKey = 'brand-product' | 'updated-desc' | 'price-asc'

function getGroupBuyPrice(product: ProductMaster) {
  const prices = product.skus.filter((sku) => sku.active).map((sku) => sku.groupBuyPrice)
  return prices.length ? Math.min(...prices) : product.salePrice
}

function getPriceRange(product: ProductMaster) {
  const prices = product.skus.filter((sku) => sku.active).map((sku) => sku.groupBuyPrice)
  if (!prices.length) return money(product.salePrice)
  const min = Math.min(...prices)
  const max = Math.max(...prices)
  return `${money(min)}${min !== max ? ` ~ ${money(max)}` : ''}`
}

export function ProductListPage({ onOpen, permission }: { onOpen: (id?: string) => void; permission: ProductMasterPermission }) {
  const [products, setProducts] = useState<ProductMaster[]>([])
  const [query, setQuery] = useState('')
  const [sortKey, setSortKey] = useState<SortKey>('brand-product')
  const [filters, setFilters] = useState({ brand: '', vendor: '', category: '', visible: 'all', status: '', sample: 'all', link: 'all', active: 'all' })
  const load = () => productService.listProducts().then(setProducts)
  useEffect(() => { void load() }, [])
  const options = useMemo(() => ({
    brands: [...new Set(products.map((product) => product.brandName))],
    vendors: [...new Set(products.map((product) => product.vendorName).filter(Boolean))] as string[],
    categories: [...new Set(products.map((product) => product.category).filter(Boolean))] as string[],
  }), [products])
  const patchFilter = (key: keyof typeof filters, value: string) => setFilters((current) => ({ ...current, [key]: value }))
  const filtered = useMemo(() => products.filter((product) => {
    const text = `${product.productCode} ${product.vendorName ?? ''} ${product.brandName} ${product.productName}`.toLowerCase()
    const linkAvailable = product.wiseShopAvailable || product.sellerCheckoutAvailable || product.defaultSalesChannelType === 'supplier_link'
    return (!query || text.includes(query.toLowerCase())) && (!filters.brand || product.brandName === filters.brand)
      && (!filters.vendor || product.vendorName === filters.vendor) && (!filters.category || product.category === filters.category)
      && (filters.visible === 'all' || product.sellerPortalVisible === (filters.visible === 'yes'))
      && (!filters.status || product.sellerPortalStatus === filters.status)
      && (filters.sample === 'all' || product.sampleAvailable === (filters.sample === 'yes'))
      && (filters.link === 'all' || linkAvailable === (filters.link === 'yes'))
      && (filters.active === 'all' || product.active === (filters.active === 'yes'))
  }), [products, query, filters])
  const sorted = useMemo(() => [...filtered].sort((a, b) => {
    if (sortKey === 'updated-desc') return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    if (sortKey === 'price-asc') return getGroupBuyPrice(a) - getGroupBuyPrice(b)
    return a.brandName.localeCompare(b.brandName, 'ko')
      || a.productName.localeCompare(b.productName, 'ko')
      || new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  }), [filtered, sortKey])
  const grouped = useMemo(() => {
    const map = new Map<string, ProductMaster[]>()
    sorted.forEach((product) => map.set(product.brandName, [...(map.get(product.brandName) ?? []), product]))
    return Array.from(map, ([brandName, items]) => ({ brandName, items }))
  }, [sorted])
  const brandStats = useMemo(() => new Map([...new Set(products.map((product) => product.brandName))].map((brandName) => {
    const brandProducts = products.filter((product) => product.brandName === brandName)
    return [brandName, {
      total: brandProducts.length,
      active: brandProducts.filter((product) => product.active).length,
      visible: brandProducts.filter((product) => product.sellerPortalVisible).length,
    }]
  })), [products])
  const deactivate = async (product: ProductMaster) => {
    if (!window.confirm(`${product.productName} 상품을 비활성화할까요?`)) return
    await productService.deactivateProduct(product.id); await load()
  }
  return <section className="master-page">
    <div className="master-page__heading"><div><p className="page-eyebrow">PRODUCT DATABASE</p><h1>공동구매 물품 DB</h1><p>제품과 SKU, 공개 범위, Campaign에 전달할 기본 조건을 관리합니다.</p></div>{permission.canCreate && <button className="primary-button" onClick={() => onOpen()}>신규 제품 등록</button>}</div>
    <div className="product-filters product-filters--expanded">
      <input aria-label="제품 검색" placeholder="제품명, 브랜드, 공급처 검색" value={query} onChange={(event) => setQuery(event.target.value)} />
      <Filter label="전체 브랜드" value={filters.brand} items={options.brands} onChange={(value) => patchFilter('brand', value)} />
      <Filter label="전체 공급처" value={filters.vendor} items={options.vendors} onChange={(value) => patchFilter('vendor', value)} />
      <Filter label="전체 카테고리" value={filters.category} items={options.categories} onChange={(value) => patchFilter('category', value)} />
      <Select label="셀러 공개 전체" value={filters.visible} items={[['yes','공개'],['no','비공개']]} onChange={(value) => patchFilter('visible', value)} />
      <Select label="공구 상태 전체" value={filters.status} items={Object.entries(statusLabels)} onChange={(value) => patchFilter('status', value)} />
      <Select label="샘플 전체" value={filters.sample} items={[['yes','샘플 가능'],['no','샘플 불가/협의']]} onChange={(value) => patchFilter('sample', value)} />
      <Select label="링크 전체" value={filters.link} items={[['yes','링크 가능'],['no','링크 정책 확인']]} onChange={(value) => patchFilter('link', value)} />
      <Select label="활성 전체" value={filters.active} items={[['yes','활성'],['no','비활성']]} onChange={(value) => patchFilter('active', value)} />
    </div>
    <div className="panel"><div className="panel__header product-list-header"><div><h2>제품 목록</h2><p>총 {sorted.length}개 · 브랜드 {grouped.length}개 · 모든 개발 데이터는 [TEST]로 표시됩니다.</p></div><label className="product-sort">정렬<select aria-label="제품 목록 정렬" value={sortKey} onChange={(event) => setSortKey(event.target.value as SortKey)}><option value="brand-product">브랜드 · 제품명순</option><option value="updated-desc">최근 수정순</option><option value="price-asc">예상 공구가 낮은순</option></select></label></div>
      <div className="table-wrap product-desktop-list"><table className="product-master-table product-master-table--catalog"><thead><tr>
        {['이미지','브랜드','제품명','대표 SKU / SKU 수','카테고리','예상 공구가','공급사','기본 판매 링크','와이즈샵','셀러 결제창','샘플','셀러 공개 상태','활성 상태','수정일','관리'].map((label) => <th key={label}>{label}</th>)}
      </tr></thead><tbody>{grouped.map((group) => {
        const stats = brandStats.get(group.brandName)!
        return [<tr className="product-brand-group" key={`group-${group.brandName}`}><th colSpan={15} scope="rowgroup"><div><span className="brand-mark" aria-hidden="true">{group.brandName.slice(0, 1)}</span><strong>{group.brandName}</strong><small>전체 {stats.total} · 활성 {stats.active} · 셀러 공개 {stats.visible}</small><em>현재 표시 {group.items.length}개</em></div></th></tr>,
          ...group.items.map((product) => {
            const representativeSku = product.skus.find((sku) => sku.representative && sku.active)
            return <tr className="product-group-row" aria-label={`${product.brandName} 브랜드 ${product.productName}`} key={product.id}>
              <td><div className="product-thumb">{product.representativeImageUrl || product.imageUrl ? <img src={product.representativeImageUrl ?? product.imageUrl} alt={`${product.brandName} ${product.productName}`} /> : '이미지 없음'}</div></td>
              <td><span className="sr-only">{product.brandName}</span><span aria-hidden="true">↳</span></td>
              <td><button className="text-button" onClick={() => onOpen(product.id)}>{product.productName}</button></td>
              <td>{representativeSku?.optionName ?? '대표 SKU 미지정'}<small>SKU {product.skus.length}개</small></td>
              <td>{product.category ?? '미분류'}</td><td className="money-cell">{getPriceRange(product)}</td>
              <td>{product.vendorName ?? '공급사 미지정'}</td><td>{channelLabels[product.defaultSalesChannelType]}</td>
              <td>{product.wiseShopAvailable ? '사용 가능' : '사용 불가'}</td><td>{product.sellerCheckoutAvailable ? '사용 가능' : '사용 불가'}</td>
              <td>{product.sampleAvailable ? '가능' : '불가/협의'}</td>
              <td><span className={`status-badge ${product.sellerPortalVisible && product.sellerPortalStatus === 'available' ? 'done' : product.sellerPortalStatus === 'coming_soon' ? 'progress' : 'waiting'}`}>{product.sellerPortalVisible ? statusLabels[product.sellerPortalStatus] : '셀러 비공개'}</span></td>
              <td><span className={product.active ? 'status-badge done' : 'status-badge waiting'}>{product.active ? '활성' : '비활성'}</span></td><td>{new Date(product.updatedAt).toLocaleDateString('ko-KR')}</td>
              <td><div className="table-actions"><button onClick={() => onOpen(product.id)}>{permission.canEdit ? '상세·수정' : '상세 보기'}</button>{permission.canDeactivate && product.active && <button className="danger-text" onClick={() => void deactivate(product)}>비활성화</button>}</div></td>
            </tr>
          })]
      })}</tbody></table></div>
      <div className="product-mobile-list">{grouped.map((group) => {
        const stats = brandStats.get(group.brandName)!
        return <section className="product-mobile-group" aria-labelledby={`mobile-brand-${group.brandName}`} key={group.brandName}><header><div><h3 id={`mobile-brand-${group.brandName}`}>{group.brandName}</h3><p>전체 {stats.total} · 활성 {stats.active} · 셀러 공개 {stats.visible}</p></div><span>현재 {group.items.length}개</span></header><div>{group.items.map((product) => <article aria-label={`${product.brandName} 브랜드 ${product.productName}`} key={product.id}>
          <div className="product-thumb">{product.representativeImageUrl || product.imageUrl ? <img src={product.representativeImageUrl ?? product.imageUrl} alt="" /> : '이미지 없음'}</div><div className="product-mobile-card__main"><button className="text-button" onClick={() => onOpen(product.id)}>{product.productName}</button><span>{product.category ?? '미분류'} · SKU {product.skus.length}개</span><strong>{getPriceRange(product)}</strong><small>공급사 {product.vendorName ?? '미지정'} · {channelLabels[product.defaultSalesChannelType]}</small></div><span className={`status-badge ${product.sellerPortalVisible && product.sellerPortalStatus === 'available' ? 'done' : 'waiting'}`}>{product.sellerPortalVisible ? statusLabels[product.sellerPortalStatus] : '비공개'}</span>
        </article>)}</div></section>
      })}</div>
    </div>
  </section>
}

function Filter({ label, value, items, onChange }: { label: string; value: string; items: string[]; onChange: (value: string) => void }) {
  return <select aria-label={label} value={value} onChange={(event) => onChange(event.target.value)}><option value="">{label}</option>{items.map((item) => <option key={item}>{item}</option>)}</select>
}
function Select({ label, value, items, onChange }: { label: string; value: string; items: string[][]; onChange: (value: string) => void }) {
  return <select aria-label={label} value={value} onChange={(event) => onChange(event.target.value)}><option value={label.includes('상태') ? '' : 'all'}>{label}</option>{items.map(([key, item]) => <option value={key} key={key}>{item}</option>)}</select>
}
