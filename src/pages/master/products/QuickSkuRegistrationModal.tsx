import { useEffect, useMemo, useState } from 'react'
import { normalizeProductIdentity, productService } from '../../../features/productMaster/services/productService'
import type { ProductMaster, ProductSku } from '../../../features/productMaster/types'

type Props = {
  open: boolean
  onClose: () => void
  onRegistered?: (product: ProductMaster, sku: ProductSku) => void
}

const initial = { brandName: '', productName: '', optionName: '', detailOption: '', vendorName: '', companySupplyPrice: '', sellerSupplyPrice: '' }

export function QuickSkuRegistrationModal({ open, onClose, onRegistered }: Props) {
  const [form, setForm] = useState(initial)
  const [products, setProducts] = useState<ProductMaster[]>([])
  const [searched, setSearched] = useState(false)
  const [selectedProductId, setSelectedProductId] = useState('')
  const [message, setMessage] = useState('')
  const [saving, setSaving] = useState(false)
  const [sampleOnly, setSampleOnly] = useState(false)
  useEffect(() => { if (open) void productService.listProductsForImport().then(setProducts).catch(error => setMessage(error instanceof Error ? error.message : '상품을 불러오지 못했습니다.')) }, [open])
  const candidates = useMemo(() => searched ? productService.findProductIdentityCandidates(products, form.brandName, form.productName) : [], [form.brandName, form.productName, products, searched])
  if (!open) return null
  const patch = (key: keyof typeof initial, value: string) => { setForm((current) => ({ ...current, [key]: value })); if (key === 'brandName' || key === 'productName' || key === 'optionName' || key === 'detailOption') { setSearched(false); setSelectedProductId('') } setMessage('') }
  const search = () => {
    if (!form.brandName.trim() || !form.productName.trim()) { setMessage('브랜드와 상품명을 먼저 입력해주세요.'); return }
    const found = productService.findProductIdentityCandidates(products, form.brandName, form.productName)
    setSearched(true)
    const exact = found.filter((product) => normalizeProductIdentity(product.productName) === normalizeProductIdentity(form.productName))
    setSelectedProductId(exact.length === 1 ? exact[0].id : '')
    setMessage(found.length ? `유사 상품 ${found.length}개를 찾았습니다. 연결할 상품을 확인해주세요.` : '유사 상품이 없습니다. 샘플 전용을 선택하면 등록된 브랜드 아래 비판매 상품으로 생성할 수 있습니다.')
  }
  const save = async () => {
    if (!searched) { setMessage('등록 전에 유사 SKU 검색을 실행해주세요.'); return }
    if (!selectedProductId && !(sampleOnly && !candidates.length)) { setMessage('연결할 기존 상품을 선택해주세요. 자동 통합하지 않습니다.'); return }
    if (!form.optionName.trim() || !form.vendorName.trim()) { setMessage('옵션과 거래처를 입력해주세요.'); return }
    if (!form.companySupplyPrice.trim() || (!sampleOnly && !form.sellerSupplyPrice.trim())) { setMessage('회사 실제 공급가와 셀러 적용 공급가를 확인해주세요. 빈 값을 0원으로 등록하지 않습니다.'); return }
    setSaving(true)
    try {
      const result = await productService.registerQuickSku({ ...form, sampleOnly, productId: selectedProductId || undefined, companySupplyPrice: Number(form.companySupplyPrice), sellerSupplyPrice: form.sellerSupplyPrice.trim() ? Number(form.sellerSupplyPrice) : undefined })
      setMessage(result.created ? '신규 SKU를 등록했습니다.' : '동일한 SKU가 이미 있어 기존 SKU를 선택했습니다.')
      onRegistered?.(result.product, result.sku)
      if (!onRegistered) window.setTimeout(onClose, 500)
    } catch (error) { setMessage(error instanceof Error ? error.message : 'SKU를 등록하지 못했습니다.') }
    finally { setSaving(false) }
  }
  return <div className="bulk-import-backdrop"><section className="quick-sku-panel" role="dialog" aria-modal="true" aria-labelledby="quick-sku-title">
    <header><div><p className="page-eyebrow">QUICK SKU</p><h2 id="quick-sku-title">+ 빠른 SKU 등록</h2><p>먼저 기존 유사 상품·SKU를 확인하고, 선택한 기존 상품에 신규 SKU만 추가합니다.</p></div><button type="button" className="secondary-button" onClick={onClose}>닫기</button></header>
    <label><input type="checkbox" checked={sampleOnly} onChange={event => setSampleOnly(event.target.checked)} />샘플 전용 · 일반 공구 카탈로그에서 숨김</label><div className="quick-sku-grid">
      <label>브랜드<input value={form.brandName} onChange={(event) => patch('brandName', event.target.value)} /></label>
      <label>상품명<input value={form.productName} onChange={(event) => patch('productName', event.target.value)} /></label>
      <label>옵션(SKU)<input placeholder="예: 2단" value={form.optionName} onChange={(event) => patch('optionName', event.target.value)} /></label>
      <label>세부옵션<input placeholder="예: 베이지 / 화이트" value={form.detailOption} onChange={(event) => patch('detailOption', event.target.value)} /></label>
      <label>거래처<input value={form.vendorName} onChange={(event) => patch('vendorName', event.target.value)} /></label>
      <label>회사 실제 공급가<input min="0" type="number" value={form.companySupplyPrice} onChange={(event) => patch('companySupplyPrice', event.target.value)} /></label>
      <label>셀러 적용 공급가{sampleOnly ? " · 선택" : ""}<input min="0" type="number" value={form.sellerSupplyPrice} onChange={(event) => patch('sellerSupplyPrice', event.target.value)} /></label>
    </div>
    <button className="secondary-button quick-sku-search" type="button" onClick={search}>기존 유사 상품·SKU 검색</button>
    {searched && <div className="quick-sku-candidates">{candidates.map((product) => { const optionQuery = normalizeProductIdentity(`${form.optionName} ${form.detailOption}`); const skuCandidates = product.skus.filter((sku) => { const identity = normalizeProductIdentity(`${sku.optionName} ${Object.values(sku.optionValues ?? {}).join(' ')}`); return optionQuery && (identity.includes(optionQuery) || optionQuery.includes(identity)) }); return <label key={product.id}><input checked={selectedProductId === product.id} name="quick-product" type="radio" onChange={() => setSelectedProductId(product.id)} /><span><strong>{product.brandName} · {product.productName}</strong><small>{product.skus.length}개 SKU · {product.lifecycleStatus === 'archived' ? '삭제 보관' : product.active ? '사용' : '미사용'}</small>{skuCandidates.length > 0 && <small>유사 SKU: {skuCandidates.map((sku) => `${sku.optionName}${Object.values(sku.optionValues ?? {}).length ? ` (${Object.values(sku.optionValues ?? {}).join('/')})` : ''}`).join(', ')}</small>}</span></label> })}{!candidates.length && <p>{sampleOnly ? '기존 등록 브랜드 아래 샘플 전용으로만 신규 생성합니다.' : '일반 판매상품은 상품 등록 화면에서 등록해주세요.'}</p>}</div>}
    <footer><p role="status">{message || '필수값 입력 후 유사 상품 검색을 먼저 실행해주세요.'}</p><button className="primary-button" disabled={saving || !searched || (!selectedProductId && !(sampleOnly && !candidates.length))} type="button" onClick={() => void save()}>{saving ? '등록 중…' : sampleOnly && !selectedProductId ? '샘플 전용 상품·SKU 등록' : '선택 상품에 SKU 등록'}</button></footer>
  </section></div>
}
