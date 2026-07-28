import { useEffect, useMemo, useState } from 'react'
import { productService } from '../../../features/productMaster/services/productService'
import type { ProductMaster, SellerPortalStatus } from '../../../features/productMaster/types'
import type { ProductMasterPermission } from '../../../features/productMaster/permissions'

const money = (value: number) => `${value.toLocaleString('ko-KR')}원`
const channelLabels = { supplier_link: '공급사 링크', wise_shop_link: '와이즈샵', seller_checkout: '셀러 결제창' }
const statusLabels: Record<SellerPortalStatus, string> = { available: '공구 가능', coming_soon: '곧 진행 가능', paused: '일시 중단', sold_out: '품절', closed: '진행 종료' }

export function ProductListPage({ onOpen, permission }: { onOpen: (id?: string) => void; permission: ProductMasterPermission }) {
  const [products, setProducts] = useState<ProductMaster[]>([])
  const [query, setQuery] = useState('')
  const [filters, setFilters] = useState({ brand: '', vendor: '', category: '', visible: 'all', status: '', sample: 'all', link: 'all', active: 'all' })
  const load = () => productService.listProducts().then(setProducts)
  useEffect(() => { void load() }, [])
  const options = useMemo(() => ({
    brands: [...new Set(products.map((product) => product.brandName))],
    vendors: [...new Set(products.map((product) => product.vendorName).filter(Boolean))] as string[],
    categories: [...new Set(products.map((product) => product.category).filter(Boolean))] as string[],
  }), [products])
  const patchFilter = (key: keyof typeof filters, value: string) => setFilters((current) => ({ ...current, [key]: value }))
  const filtered = products.filter((product) => {
    const text = `${product.productCode} ${product.vendorName ?? ''} ${product.brandName} ${product.productName}`.toLowerCase()
    const linkAvailable = product.wiseShopAvailable || product.sellerCheckoutAvailable || product.defaultSalesChannelType === 'supplier_link'
    return (!query || text.includes(query.toLowerCase())) && (!filters.brand || product.brandName === filters.brand)
      && (!filters.vendor || product.vendorName === filters.vendor) && (!filters.category || product.category === filters.category)
      && (filters.visible === 'all' || product.sellerPortalVisible === (filters.visible === 'yes'))
      && (!filters.status || product.sellerPortalStatus === filters.status)
      && (filters.sample === 'all' || product.sampleAvailable === (filters.sample === 'yes'))
      && (filters.link === 'all' || linkAvailable === (filters.link === 'yes'))
      && (filters.active === 'all' || product.active === (filters.active === 'yes'))
  })
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
    <div className="panel"><div className="panel__header"><div><h2>제품 목록</h2><p>총 {filtered.length}개 · 모든 개발 데이터는 [TEST]로 표시됩니다.</p></div></div><div className="table-wrap"><table className="product-master-table product-master-table--catalog"><thead><tr>
      {['이미지','공급처 / 브랜드','제품명 / 카테고리','SKU','예상 공구가','셀러 공개','공개 상태','판매 링크','지원 조건','활성','최종 수정','관리'].map((label) => <th key={label}>{label}</th>)}
    </tr></thead><tbody>{filtered.map((product) => {
      const prices = product.skus.filter((sku) => sku.active).map((sku) => sku.groupBuyPrice)
      const range = prices.length ? `${money(Math.min(...prices))}${Math.min(...prices) !== Math.max(...prices) ? ` ~ ${money(Math.max(...prices))}` : ''}` : money(product.salePrice)
      return <tr key={product.id}>
        <td><div className="product-thumb">{product.representativeImageUrl || product.imageUrl ? <img src={product.representativeImageUrl ?? product.imageUrl} alt="" /> : '이미지 없음'}</div></td>
        <td><strong>{product.vendorName ?? '공급처 미지정'}</strong><small>{product.brandName}</small></td>
        <td><button className="text-button" onClick={() => onOpen(product.id)}>{product.productName}</button><small>{product.category ?? '미분류'}</small></td>
        <td>{product.skus.length}개</td><td className="money-cell">{range}</td>
        <td><span className={product.sellerPortalVisible ? 'status-badge done' : 'status-badge waiting'}>{product.sellerPortalVisible ? '공개' : '비공개'}</span></td>
        <td><span className={`status-badge ${product.sellerPortalStatus === 'available' ? 'done' : product.sellerPortalStatus === 'coming_soon' ? 'progress' : 'waiting'}`}>{statusLabels[product.sellerPortalStatus]}</span></td>
        <td>{channelLabels[product.defaultSalesChannelType]}<small>와이즈샵 {product.wiseShopAvailable ? '가능' : '불가'} · 결제창 {product.sellerCheckoutAvailable ? '가능' : '불가'}</small></td>
        <td>샘플 {product.sampleAvailable ? '가능' : '불가/협의'}<small>PG {product.brandPgSupportAvailable ? `지원 ${product.brandPgSupportRate}%` : '미지원'}</small></td>
        <td>{product.active ? '활성' : '비활성'}</td><td>{new Date(product.updatedAt).toLocaleDateString('ko-KR')}</td>
        <td><div className="table-actions"><button onClick={() => onOpen(product.id)}>{permission.canEdit ? '상세·수정' : '상세 보기'}</button>{permission.canDeactivate && product.active && <button className="danger-text" onClick={() => void deactivate(product)}>비활성화</button>}</div></td>
      </tr>
    })}</tbody></table></div></div>
  </section>
}

function Filter({ label, value, items, onChange }: { label: string; value: string; items: string[]; onChange: (value: string) => void }) {
  return <select aria-label={label} value={value} onChange={(event) => onChange(event.target.value)}><option value="">{label}</option>{items.map((item) => <option key={item}>{item}</option>)}</select>
}
function Select({ label, value, items, onChange }: { label: string; value: string; items: string[][]; onChange: (value: string) => void }) {
  return <select aria-label={label} value={value} onChange={(event) => onChange(event.target.value)}><option value={label.includes('상태') ? '' : 'all'}>{label}</option>{items.map(([key, item]) => <option value={key} key={key}>{item}</option>)}</select>
}
