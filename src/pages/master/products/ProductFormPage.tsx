import { useEffect, useState } from 'react'
import { productService, validateProductPolicy } from '../../../features/productMaster/services/productService'
import type { ProductMasterInput, ProductPgSupportRate, ProductSku, SellerPortalStatus, SupplierLinkPgPolicy } from '../../../features/productMaster/types'
import type { ProductMasterPermission } from '../../../features/productMaster/permissions'

type Errors = Record<string, string>
const channelLabels = { supplier_link: '업체링크', wise_shop_link: '와이즈 스룩링크', seller_checkout: '셀러 자체 결제창' }
const sectionFields: Record<string, string[]> = {
  basic: ['brandName', 'productName'], price: ['regularPrice', 'salePrice', 'supplyPrice', 'shippingFee'],
  commission: ['totalCommissionRate', 'sellerCommissionRate'], link: ['defaultSalesChannelType', 'wiseShopAvailable', 'sellerCheckoutAvailable'],
}
const initial: ProductMasterInput = {
  productCode: '', vendorId: '', vendorName: '', brandId: '', brandName: '', productName: '', category: '', subCategory: '', imageUrl: '', representativeImageUrl: '', additionalImageUrls: [], internalDescription: '', sellerDescription: '', memo: '',
  regularPrice: 0, salePrice: 0, supplyPrice: 0, shippingFee: 0, freeShippingThreshold: undefined,
  totalCommissionRate: 0, sellerCommissionRate: 0, companyCommissionRate: 0,
  defaultSalesChannelType: 'supplier_link', supplierLinkAvailable: true, supplierLinkPgPolicy: 'supplier_bears_pg', supplierLinkPgDeductionRate: undefined,
  wiseShopAvailable: false, wiseSrookPgRate: undefined, sellerCheckoutAvailable: false,
  brandPgSupportAvailable: false, courierName: '', jejuExtraFee: 0, islandExtraFee: 0,
  bundleShippingAvailable: false, orderDeadlineTime: '', sampleSupportType: '', manufactureInfo: '',
  shelfLifeInfo: '', orderMemo: '', settlementMemo: '', internalMemo: '', skus: [], sellerPortalVisible: false,
  sellerPortalStatus: 'closed', badges: [], sampleAvailable: false, managerName: '김병희', managerContact: '',
  active: true, testData: false,
}
const money = (value: number) => `${Number(value || 0).toLocaleString('ko-KR')}원`
const number = (value: string) => value === '' ? 0 : Number(value)

export function ProductFormPage({ productId, onBack, permission }: { productId?: string; onBack: () => void; permission: ProductMasterPermission }) {
  const [form, setForm] = useState<ProductMasterInput>(initial)
  const [errors, setErrors] = useState<Errors>({})
  const [loading, setLoading] = useState(Boolean(productId))
  const [brandQuery, setBrandQuery] = useState('')
  const [brandOptions, setBrandOptions] = useState<{ id: string; name: string }[]>([])
  const [commissionConflict, setCommissionConflict] = useState(false)
  useEffect(() => {
    productService.listProducts().then((products) => {
      setBrandOptions(Array.from(new Map(products.map((product) => [product.brandId, { id: product.brandId, name: product.brandName }])).values()))
    })
    if (productId) productService.getProductById(productId).then((product) => {
      if (product) {
        setForm(product)
        setCommissionConflict(product.companyCommissionRate !== product.totalCommissionRate - product.sellerCommissionRate)
      }
      setBrandQuery(product?.brandName ?? '')
      setLoading(false)
    })
  }, [productId])
  const patch = <K extends keyof ProductMasterInput>(key: K, value: ProductMasterInput[K]) => {
    setForm((current) => ({ ...current, [key]: value }))
    setErrors((current) => { const next = { ...current }; delete next[String(key)]; return next })
  }
  const companyRate = form.totalCommissionRate - form.sellerCommissionRate
  const discountRate = form.regularPrice > 0 ? Math.round((1 - form.salePrice / form.regularPrice) * 1000) / 10 : 0
  const filteredBrands = brandOptions.filter((brand) => brand.name.toLowerCase().includes(brandQuery.toLowerCase()))
  const sectionCount = (section: string) => sectionFields[section]?.filter((field) => errors[field]).length ?? 0
  const updateSku = (id: string, patchValue: Partial<ProductSku>) => patch('skus', form.skus.map((sku) => sku.id === id ? { ...sku, ...patchValue, updatedAt: new Date().toISOString() } : sku))
  const addSku = () => {
    const now = new Date().toISOString()
    const id = crypto.randomUUID()
    patch('skus', [...form.skus, { id, skuCode: `SKU-${Date.now().toString().slice(-6)}`, productId: productId ?? 'new-product', optionName: `옵션 ${form.skus.length + 1}`, regularPrice: form.regularPrice, groupBuyPrice: form.salePrice, supplyPrice: form.supplyPrice, stockStatus: 'available', sellerPortalVisible: true, representative: form.skus.length === 0, active: true, createdAt: now, updatedAt: now }])
  }
  const cloneSku = (source: ProductSku) => {
    const now = new Date().toISOString()
    patch('skus', [...form.skus, { ...source, id: crypto.randomUUID(), skuCode: `${source.skuCode}-COPY`, optionName: `${source.optionName} 복사본`, representative: false, createdAt: now, updatedAt: now }])
  }
  const validate = () => {
    const next: Errors = {}
    if (!form.brandId) next.brandName = '브랜드를 검색해 선택해주세요.'
    if (!form.productName.trim()) next.productName = '상품명을 입력해주세요.'
    if (form.regularPrice <= 0) next.regularPrice = '정상가를 입력해주세요.'
    if (form.salePrice <= 0) next.salePrice = '공구가를 입력해주세요.'
    if (form.supplyPrice <= 0) next.supplyPrice = '공급가를 입력해주세요.'
    if (form.shippingFee < 0 || Number.isNaN(form.shippingFee)) next.shippingFee = '배송비를 입력해주세요.'
    if (form.totalCommissionRate <= 0) next.totalCommissionRate = '총 수수료율을 입력해주세요.'
    if (form.sellerCommissionRate <= 0) next.sellerCommissionRate = '셀러 기본 수수료율을 입력해주세요.'
    if (!form.defaultSalesChannelType) next.defaultSalesChannelType = '기본 판매 링크를 선택해주세요.'
    const policyError = validateProductPolicy({ ...form, brandPgSupportRate: form.brandPgSupportRate })
    if (policyError) next.defaultSalesChannelType = policyError
    return next
  }
  const save = async () => {
    if (productId ? !permission.canEdit : !permission.canCreate) return
    const next = validate()
    setErrors(next)
    if (Object.keys(next).length) {
      document.querySelector(`[data-field="${Object.keys(next)[0]}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      return
    }
    const input = { ...form, companyCommissionRate: companyRate, productCode: form.productCode || `PRD-${Date.now().toString().slice(-8)}` }
    if (productId) await productService.updateProduct(productId, input)
    else await productService.createProduct(input)
    onBack()
  }
  if (loading) return <div className="master-empty">상품 정보를 불러오는 중입니다.</div>
  const fieldClass = (key: string) => errors[key] ? 'product-field is-error' : 'product-field'
  const sectionTitle = (title: string, key: string) => <h2>{title}{sectionCount(key) > 0 && <span className="section-error-count">누락 {sectionCount(key)}</span>}</h2>
  const readOnly = productId ? !permission.canEdit : !permission.canCreate
  return <section className="product-form-page">
    <div className="master-page__heading"><div><p className="page-eyebrow">Product Master</p><h1>{productId ? (readOnly ? '상품 상세 보기' : '상품 상세·수정') : '신규 상품 등록'}</h1><p>Campaign에서 사용할 상품 기본 조건을 한 페이지에서 관리합니다.</p></div><div className="button-row"><button className="secondary-button" onClick={onBack}>목록</button>{!readOnly && <button className="primary-button" onClick={() => void save()}>저장</button>}</div></div>
    <fieldset className="product-form-fieldset" disabled={readOnly}>
    <section className="product-form-section" id="product-basic">{sectionTitle('1. 기본 정보', 'basic')}<div className="product-form-grid">
      <label className={fieldClass('productCode')} data-field="productCode"><span>상품 코드</span><input value={form.productCode} placeholder="미입력 시 자동 생성" onChange={(e) => patch('productCode', e.target.value)} /></label>
      <label className="product-field"><span>공급처</span><input value={form.vendorName} placeholder="공급처 DB 연결 준비" onChange={(e) => { patch('vendorName', e.target.value); patch('vendorId', e.target.value ? `vendor-${e.target.value}` : '') }} /></label>
      <div className={fieldClass('brandName')} data-field="brandName"><span>브랜드 *</span><input value={brandQuery} placeholder="브랜드 검색" onChange={(e) => { setBrandQuery(e.target.value); patch('brandId', ''); patch('brandName', e.target.value) }} />{brandQuery && !form.brandId && <div className="brand-options">{filteredBrands.map((brand) => <button key={brand.id} onClick={() => { patch('brandId', brand.id); patch('brandName', brand.name); setBrandQuery(brand.name) }}>{brand.name}</button>)}{filteredBrands.length === 0 && <p>브랜드가 없습니다. 브랜드 등록이 필요합니다.</p>}</div>}{errors.brandName && <small>{errors.brandName}</small>}</div>
      <label className={fieldClass('productName')} data-field="productName"><span>상품명 *</span><input value={form.productName} onChange={(e) => patch('productName', e.target.value)} />{errors.productName && <small>{errors.productName}</small>}</label>
      <label className="product-field"><span>카테고리</span><input value={form.category} onChange={(e) => patch('category', e.target.value)} /></label>
      <label className="product-field"><span>대표 이미지 URL</span><input type="url" value={form.representativeImageUrl} onChange={(e) => { patch('representativeImageUrl', e.target.value); patch('imageUrl', e.target.value) }} /></label>
      <label className="product-field product-check"><input type="checkbox" checked={form.active} onChange={(e) => patch('active', e.target.checked)} /><span>활성 상품</span></label>
      <label className="product-field product-span-2"><span>메모</span><textarea value={form.memo} onChange={(e) => patch('memo', e.target.value)} /></label>
    </div></section>
    <section className="product-form-section">{sectionTitle('2. 가격 정보', 'price')}<div className="product-form-grid">
      {([['regularPrice','정상가'],['salePrice','공구가'],['supplyPrice','공급가'],['shippingFee','배송비 *'],['freeShippingThreshold','무료배송 기준']] as const).map(([key,label]) => <label className={fieldClass(key)} data-field={key} key={key}><span>{label}{key !== 'freeShippingThreshold' && key !== 'shippingFee' ? ' *' : ''}</span><input min="0" type="number" value={form[key] ?? ''} onChange={(e) => patch(key, number(e.target.value))} />{errors[key] && <small>{errors[key]}</small>}</label>)}
      <div className="calculated-card"><span>할인율</span><strong>{discountRate}%</strong></div><div className="calculated-card"><span>공구가 - 공급가</span><strong>{money(form.salePrice - form.supplyPrice)}</strong></div>
    </div><p className="policy-note">배송비에는 수수료를 적용하지 않습니다. 배송 정책의 기본 배송비와 동일한 기준 필드입니다.</p></section>
    <section className="product-form-section">{sectionTitle('3. 수수료 정책', 'commission')}<div className="product-form-grid">
      <label className={fieldClass('totalCommissionRate')} data-field="totalCommissionRate"><span>총 수수료율 * (%)</span><input type="number" step="0.1" value={form.totalCommissionRate} onChange={(e) => patch('totalCommissionRate', number(e.target.value))} />{errors.totalCommissionRate && <small>{errors.totalCommissionRate}</small>}</label>
      <label className={fieldClass('sellerCommissionRate')} data-field="sellerCommissionRate"><span>셀러 기본 수수료율 * (%)</span><input type="number" step="0.1" value={form.sellerCommissionRate} onChange={(e) => patch('sellerCommissionRate', number(e.target.value))} />{errors.sellerCommissionRate && <small>{errors.sellerCommissionRate}</small>}</label>
      <div className={fieldClass('companyCommissionRate')} data-field="companyCommissionRate"><span>회사 수수료율 (자동)</span><strong className="calculated-value">{companyRate}%</strong>{errors.companyCommissionRate && <small>{errors.companyCommissionRate}</small>}</div>
    </div>{commissionConflict && <p className="policy-note policy-note--warning">저장된 직접 입력값이 계산값과 달라 현재 계산값으로 정정됩니다.</p>}<p className="policy-note">회사 수수료율 = 총 수수료율 - 셀러 기본 수수료율. 브랜드 PG 지원율은 Campaign의 실제 셀러 추가 지급률과 별도입니다.</p></section>
    <section className="product-form-section">{sectionTitle('4. 판매 링크 정책', 'link')}<div className="product-form-grid">
      <label className={fieldClass('defaultSalesChannelType')} data-field="defaultSalesChannelType"><span>기본 판매 링크 *</span><select value={form.defaultSalesChannelType} onChange={(e) => patch('defaultSalesChannelType', e.target.value as ProductMasterInput['defaultSalesChannelType'])}>{Object.entries(channelLabels).map(([value,label]) => <option key={value} value={value}>{label}</option>)}</select>{errors.defaultSalesChannelType && <small>{errors.defaultSalesChannelType}</small>}</label>
      <BooleanSelect label="업체링크 사용 가능 *" value={form.supplierLinkAvailable ?? true} onChange={(value) => patch('supplierLinkAvailable', value)} />
      {form.supplierLinkAvailable && <label className="product-field"><span>업체링크 PG 비용 처리</span><select value={form.supplierLinkPgPolicy ?? 'manual'} onChange={(e) => patch('supplierLinkPgPolicy', e.target.value as SupplierLinkPgPolicy)}><option value="supplier_bears_pg">업체가 전액 부담</option><option value="deduct_from_commission_rate">총 수수료율에서 차감</option><option value="manual">기타/수기</option></select></label>}
      {form.supplierLinkAvailable && form.supplierLinkPgPolicy === 'deduct_from_commission_rate' && <label className="product-field"><span>총 수수료율 차감 (%p)</span><input min="0" max="100" step="0.1" type="number" value={form.supplierLinkPgDeductionRate ?? ''} onChange={(e) => patch('supplierLinkPgDeductionRate', number(e.target.value))} /><small>{form.totalCommissionRate}% - {form.supplierLinkPgDeductionRate ?? 0}%p = {Math.max(form.totalCommissionRate - (form.supplierLinkPgDeductionRate ?? 0), 0)}%</small></label>}
      <BooleanSelect label="와이즈 스룩링크 사용 가능 *" value={form.wiseShopAvailable} onChange={(value) => patch('wiseShopAvailable', value)} />
      {form.wiseShopAvailable && <label className="product-field"><span>기본 스룩페이 PG 수수료율 (%)</span><input min="0" step="0.1" type="number" value={form.wiseSrookPgRate ?? ''} onChange={(e) => patch('wiseSrookPgRate', number(e.target.value))} /></label>}
      <BooleanSelect label="셀러 결제창 사용 가능 *" value={form.sellerCheckoutAvailable} onChange={(value) => patch('sellerCheckoutAvailable', value)} />
      <BooleanSelect label="브랜드 PG 수수료 지원" value={form.brandPgSupportAvailable} onChange={(value) => patch('brandPgSupportAvailable', value)} />
      {form.brandPgSupportAvailable && <label className="product-field"><span>브랜드 PG 지원율 *</span><select value={form.brandPgSupportRate ?? ''} onChange={(e) => patch('brandPgSupportRate', Number(e.target.value) as ProductPgSupportRate)}><option value="">선택</option>{[1,2,3,4,5].map((rate) => <option key={rate} value={rate}>{rate}%</option>)}</select></label>}
    </div><p className="policy-note">{form.supplierLinkAvailable && form.supplierLinkPgPolicy === 'supplier_bears_pg' ? '업체링크 추천 · PG 비용을 업체가 전액 부담합니다.' : form.supplierLinkAvailable && (form.supplierLinkPgDeductionRate ?? 0) <= 5 ? '업체링크 우선 검토 · 차감은 총 수수료율 기준 %p입니다.' : form.wiseShopAvailable ? '와이즈 스룩링크 사용 가능' : 'Campaign 생성 시 실제 링크를 확인해주세요.'}</p></section>
    <section className="product-form-section"><h2>5. 배송 정책</h2><div className="product-form-grid">
      <label className="product-field"><span>택배사</span><input value={form.courierName} onChange={(e) => patch('courierName', e.target.value)} /></label>
      <div className="calculated-card"><span>기본 배송비 (가격 정보 기준)</span><strong>{money(form.shippingFee)}</strong></div>
      <div className="calculated-card"><span>무료배송 기준</span><strong>{form.freeShippingThreshold ? money(form.freeShippingThreshold) : '없음'}</strong></div>
      {([['jejuExtraFee','제주 추가 배송비'],['islandExtraFee','도서산간 추가 배송비']] as const).map(([key,label]) => <label className="product-field" key={key}><span>{label}</span><input type="number" min="0" value={form[key] ?? 0} onChange={(e) => patch(key, number(e.target.value))} /></label>)}
      <BooleanSelect label="합배송 가능 여부" value={Boolean(form.bundleShippingAvailable)} onChange={(value) => patch('bundleShippingAvailable', value)} />
      <label className="product-field"><span>발주 마감 시간</span><input type="time" value={form.orderDeadlineTime} onChange={(e) => patch('orderDeadlineTime', e.target.value)} /></label>
    </div></section>
    <section className="product-form-section"><h2>6. 운영 참고 정보</h2><div className="product-form-grid">
      <label className="product-field"><span>샘플 지원 여부</span><select value={form.sampleSupportType} onChange={(e) => patch('sampleSupportType', e.target.value)}><option value="">선택</option><option>지원 가능</option><option>지원 불가</option><option>협의 필요</option></select></label>
      {([['manufactureInfo','제조일자 정보'],['shelfLifeInfo','유통기한 정보'],['orderMemo','발주 참고사항'],['settlementMemo','정산 참고 메모'],['internalMemo','담당자 메모']] as const).map(([key,label]) => <label className="product-field" key={key}><span>{label}</span><textarea value={form[key]} onChange={(e) => patch(key, e.target.value)} /></label>)}
    </div></section>
    <section className="product-form-section"><h2>7. 셀러 공개 정보</h2><p className="policy-note">이 영역만 셀러 카탈로그의 공개 전용 데이터로 변환됩니다. 공급가·수수료·PG·내부 메모는 전달되지 않습니다.</p><div className="product-form-grid">
      <BooleanSelect label="셀러 카탈로그 공개" value={form.sellerPortalVisible} onChange={(value) => patch('sellerPortalVisible', value)} />
      <label className="product-field"><span>공구 가능 상태</span><select value={form.sellerPortalStatus} onChange={(e) => patch('sellerPortalStatus', e.target.value as SellerPortalStatus)}><option value="available">공구 가능</option><option value="coming_soon">곧 진행 가능</option><option value="paused">일시 중단</option><option value="sold_out">품절</option><option value="closed">진행 종료</option></select></label>
      <BooleanSelect label="샘플 가능 여부" value={form.sampleAvailable} onChange={(value) => patch('sampleAvailable', value)} />
      <label className="product-field"><span>담당 매니저</span><input value={form.managerName} onChange={(e) => patch('managerName', e.target.value)} /></label>
      <label className="product-field product-span-2"><span>셀러용 설명</span><textarea value={form.sellerDescription} onChange={(e) => patch('sellerDescription', e.target.value)} /></label>
      <div className="product-field product-span-2"><span>공개 Badge</span><div className="badge-checks">{([['new','NEW'],['popular','인기'],['recommended','추천'],['recently_successful','최근 진행 성과']] as const).map(([value,label]) => <label key={value}><input type="checkbox" checked={form.badges?.includes(value)} onChange={(e) => patch('badges', e.target.checked ? [...(form.badges ?? []), value] : (form.badges ?? []).filter((badge) => badge !== value))} />{label}</label>)}</div></div>
    </div></section>
    <section className="product-form-section"><div className="sku-heading"><div><h2>8. SKU 관리</h2><p>SKU별 가격과 판매 가능 상태를 관리하고 제품 기본값을 예외 덮어쓸 수 있습니다.</p></div>{!readOnly && <button type="button" className="secondary-button" onClick={addSku}>SKU 추가</button>}</div>
      {form.skus.length === 0 ? <div className="master-empty">등록된 SKU가 없습니다. SKU를 추가해주세요.</div> : <div className="sku-list">{form.skus.map((sku) => <article className={!sku.active ? 'sku-card is-inactive' : 'sku-card'} key={sku.id}>
        <div className="sku-card__title"><label><input type="radio" name="representative-sku" checked={Boolean(sku.representative)} onChange={() => patch('skus', form.skus.map((item) => ({ ...item, representative: item.id === sku.id })))} /> 대표 SKU</label><strong>{sku.skuCode}</strong><span className={`status-badge ${sku.stockStatus === 'available' ? 'done' : 'waiting'}`}>{sku.stockStatus === 'available' ? '판매 가능' : sku.stockStatus === 'limited' ? '재고 한정' : '판매 불가'}</span></div>
        <div className="sku-grid"><label>옵션명<input value={sku.optionName} onChange={(e) => updateSku(sku.id, { optionName: e.target.value })} /></label><label>정상가<input type="number" value={sku.regularPrice} onChange={(e) => updateSku(sku.id, { regularPrice: number(e.target.value) })} /></label><label>공구가<input type="number" value={sku.groupBuyPrice} onChange={(e) => updateSku(sku.id, { groupBuyPrice: number(e.target.value) })} /></label><label>공급가<input type="number" value={sku.supplyPrice} onChange={(e) => updateSku(sku.id, { supplyPrice: number(e.target.value) })} /></label><label>재고 상태<select value={sku.stockStatus} onChange={(e) => updateSku(sku.id, { stockStatus: e.target.value as ProductSku['stockStatus'] })}><option value="available">판매 가능</option><option value="limited">재고 한정</option><option value="out_of_stock">품절</option><option value="discontinued">단종</option></select></label></div>
        <div className="sku-policy-source"><span>배송비 {money(sku.policyOverrides?.shippingFee ?? form.shippingFee)}</span><small>출처: {sku.policyOverrides?.shippingFee !== undefined ? 'SKU 예외 설정' : '제품 기본값'}</small><span>기본 링크 {channelLabels[sku.policyOverrides?.defaultSalesChannelType ?? form.defaultSalesChannelType]}</span><small>출처: {sku.policyOverrides?.defaultSalesChannelType ? 'SKU 예외 설정' : '제품 기본값'}</small></div>
        {!readOnly && <div className="table-actions"><button type="button" onClick={() => cloneSku(sku)}>SKU 복제</button><button type="button" onClick={() => updateSku(sku.id, { active: !sku.active })}>{sku.active ? 'SKU 비활성화' : 'SKU 활성화'}</button></div>}
      </article>)}</div>}
      {form.skus.length > 1 && <div className="sku-price-compare"><h3>가격 비교</h3>{form.skus.map((sku) => <div key={sku.id}><span>{sku.optionName}</span><span>정상가 {money(sku.regularPrice)}</span><strong>공구가 {money(sku.groupBuyPrice)}</strong><span>차액 {money(sku.groupBuyPrice - sku.supplyPrice)}</span></div>)}</div>}
    </section>
    <section className="product-form-section"><h2>9. 최종 확인</h2><div className="product-review">
      {[
        ['브랜드', form.brandName || '미선택'], ['상품명', form.productName || '미입력'], ['정상가', money(form.regularPrice)], ['공구가', money(form.salePrice)],
        ['공급가', money(form.supplyPrice)], ['배송비', money(form.shippingFee)], ['총 수수료율', `${form.totalCommissionRate}%`],
        ['셀러 기본 수수료율', `${form.sellerCommissionRate}%`], ['회사 수수료율', `${companyRate}%`], ['기본 판매 링크', channelLabels[form.defaultSalesChannelType]],
        ['와이즈샵', form.wiseShopAvailable ? '사용 가능' : '사용 불가'], ['셀러 결제창', form.sellerCheckoutAvailable ? '사용 가능' : '사용 불가'],
        ['브랜드 PG 지원', form.brandPgSupportAvailable ? `있음 · ${form.brandPgSupportRate ?? '미선택'}%` : '없음'],
        ['배송 정책', `${form.courierName || '택배사 미정'} · 합배송 ${form.bundleShippingAvailable ? '가능' : '불가'}`], ['샘플 지원', form.sampleSupportType || '미정'],
      ].map(([label,value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}
    </div></section>
    </fieldset>
    <div className="form-footer"><button className="secondary-button" onClick={onBack}>{readOnly ? '목록' : '취소'}</button>{!readOnly && <button className="primary-button" onClick={() => void save()}>상품 저장</button>}</div>
  </section>
}

function BooleanSelect({ label, value, onChange }: { label: string; value: boolean; onChange: (value: boolean) => void }) {
  return <label className="product-field"><span>{label}</span><select value={value ? 'yes' : 'no'} onChange={(e) => onChange(e.target.value === 'yes')}><option value="yes">사용 가능 / 있음</option><option value="no">사용 불가 / 없음</option></select></label>
}
