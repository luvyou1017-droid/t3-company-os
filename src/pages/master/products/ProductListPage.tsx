import { useEffect, useMemo, useState } from 'react'
import { productService } from '../../../features/productMaster/services/productService'
import type { ProductMaster } from '../../../features/productMaster/types'

const money = (value: number) => new Intl.NumberFormat('ko-KR', { style: 'currency', currency: 'KRW', maximumFractionDigits: 0 }).format(value)
const channelLabels = { supplier_link: '공급사 링크', wise_shop_link: '와이즈샵 링크', seller_checkout: '셀러 결제창' }

export function ProductListPage({ onOpen }: { onOpen: (id?: string) => void }) {
  const [products, setProducts] = useState<ProductMaster[]>([])
  const [query, setQuery] = useState('')
  const [brand, setBrand] = useState('')
  const [active, setActive] = useState('all')
  const [channel, setChannel] = useState('')
  const [wise, setWise] = useState('all')
  const [checkout, setCheckout] = useState('all')
  const load = () => productService.listProducts().then(setProducts)
  useEffect(() => { void load() }, [])
  const brands = useMemo(() => Array.from(new Set(products.map((product) => product.brandName))), [products])
  const filtered = products.filter((product) => {
    const text = `${product.productCode} ${product.brandName} ${product.productName}`.toLowerCase()
    return (!query || text.includes(query.toLowerCase())) && (!brand || product.brandName === brand)
      && (active === 'all' || product.active === (active === 'active')) && (!channel || product.defaultSalesChannelType === channel)
      && (wise === 'all' || product.wiseShopAvailable === (wise === 'yes'))
      && (checkout === 'all' || product.sellerCheckoutAvailable === (checkout === 'yes'))
  })
  const deactivate = async (product: ProductMaster) => {
    if (!window.confirm(`${product.productName} 상품을 비활성화할까요?`)) return
    await productService.deactivateProduct(product.id)
    await load()
  }
  return <section className="master-page">
    <div className="master-page__heading"><div><p className="page-eyebrow">Master Management</p><h1>상품 관리</h1><p>Campaign에 연결할 가격·수수료·판매 링크·배송 기본 조건을 관리합니다.</p></div><button className="primary-button" onClick={() => onOpen()}>신규 상품 등록</button></div>
    <div className="product-filters">
      <input aria-label="상품 검색" placeholder="상품 코드, 브랜드, 상품명 검색" value={query} onChange={(event) => setQuery(event.target.value)} />
      <select aria-label="브랜드 필터" value={brand} onChange={(event) => setBrand(event.target.value)}><option value="">전체 브랜드</option>{brands.map((name) => <option key={name}>{name}</option>)}</select>
      <select aria-label="활성 상태 필터" value={active} onChange={(event) => setActive(event.target.value)}><option value="all">전체 상태</option><option value="active">활성</option><option value="inactive">비활성</option></select>
      <select aria-label="기본 판매 링크 필터" value={channel} onChange={(event) => setChannel(event.target.value)}><option value="">전체 기본 링크</option>{Object.entries(channelLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select>
      <select aria-label="와이즈샵 필터" value={wise} onChange={(event) => setWise(event.target.value)}><option value="all">와이즈샵 전체</option><option value="yes">사용 가능</option><option value="no">사용 불가</option></select>
      <select aria-label="셀러 결제창 필터" value={checkout} onChange={(event) => setCheckout(event.target.value)}><option value="all">셀러 결제창 전체</option><option value="yes">사용 가능</option><option value="no">사용 불가</option></select>
    </div>
    <div className="panel"><div className="panel__header"><div><h2>상품 목록</h2><p>총 {filtered.length}개 · 개발 예시 데이터는 [TEST]로 표시됩니다.</p></div></div><div className="table-wrap"><table className="product-master-table"><thead><tr>
      {['상품 코드','브랜드','상품명','정상가','공구가','총 수수료율','셀러 수수료율','기본 판매 링크','와이즈샵','셀러 결제창','브랜드 PG','상태','수정일','관리'].map((label) => <th key={label}>{label}</th>)}
    </tr></thead><tbody>{filtered.map((product) => <tr key={product.id}>
      <td>{product.productCode}</td><td>{product.brandName}</td><td><button className="text-button" onClick={() => onOpen(product.id)}>{product.productName}</button></td>
      <td>{money(product.regularPrice)}</td><td>{money(product.salePrice)}</td><td>{product.totalCommissionRate}%</td><td>{product.sellerCommissionRate}%</td>
      <td>{channelLabels[product.defaultSalesChannelType]}</td><td>{product.wiseShopAvailable ? '가능' : '불가'}</td><td>{product.sellerCheckoutAvailable ? '가능' : '불가'}</td>
      <td>{product.brandPgSupportAvailable ? `지원 ${product.brandPgSupportRate}%` : '없음'}</td><td><span className={product.active ? 'status-badge' : 'status-badge is-inactive'}>{product.active ? '활성' : '비활성'}</span></td>
      <td>{new Date(product.updatedAt).toLocaleDateString('ko-KR')}</td><td><div className="table-actions"><button onClick={() => onOpen(product.id)}>상세·수정</button>{product.active && <button className="danger-text" onClick={() => void deactivate(product)}>비활성화</button>}</div></td>
    </tr>)}</tbody></table></div></div>
  </section>
}
