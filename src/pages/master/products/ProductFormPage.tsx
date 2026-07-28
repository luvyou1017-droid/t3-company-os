import { useEffect, useState } from 'react'
import { productService, validateProductPolicy } from '../../../features/productMaster/services/productService'
import type { ProductMasterInput, ProductPgSupportRate } from '../../../features/productMaster/types'

type Errors = Record<string, string>
const channelLabels = { supplier_link: '공급사 링크', wise_shop_link: '와이즈샵 링크', seller_checkout: '셀러 결제창' }
const sectionFields: Record<string, string[]> = {
  basic: ['brandName', 'productName'], price: ['regularPrice', 'salePrice', 'supplyPrice', 'shippingFee'],
  commission: ['totalCommissionRate', 'sellerCommissionRate'], link: ['defaultSalesChannelType', 'wiseShopAvailable', 'sellerCheckoutAvailable'],
}
const initial: ProductMasterInput = {
  productCode: '', brandId: '', brandName: '', productName: '', category: '', imageUrl: '', memo: '',
  regularPrice: 0, salePrice: 0, supplyPrice: 0, shippingFee: 0, freeShippingThreshold: undefined,
  totalCommissionRate: 0, sellerCommissionRate: 0, companyCommissionRate: 0,
  defaultSalesChannelType: 'supplier_link', wiseShopAvailable: false, sellerCheckoutAvailable: false,
  brandPgSupportAvailable: false, courierName: '', jejuExtraFee: 0, islandExtraFee: 0,
  bundleShippingAvailable: false, orderDeadlineTime: '', sampleSupportType: '', manufactureInfo: '',
  shelfLifeInfo: '', orderMemo: '', settlementMemo: '', internalMemo: '', active: true, testData: false,
}
const money = (value: number) => `${Number(value || 0).toLocaleString('ko-KR')}원`
const number = (value: string) => value === '' ? 0 : Number(value)

export function ProductFormPage({ productId, onBack }: { productId?: string; onBack: () => void }) {
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
  return <section className="product-form-page">
    <div className="master-page__heading"><div><p className="page-eyebrow">Product Master</p><h1>{productId ? '상품 상세·수정' : '신규 상품 등록'}</h1><p>Campaign에서 사용할 상품 기본 조건을 한 페이지에서 관리합니다.</p></div><div className="button-row"><button className="secondary-button" onClick={onBack}>목록</button><button className="primary-button" onClick={() => void save()}>저장</button></div></div>
    <section className="product-form-section" id="product-basic">{sectionTitle('1. 기본 정보', 'basic')}<div className="product-form-grid">
      <label className={fieldClass('productCode')} data-field="productCode"><span>상품 코드</span><input value={form.productCode} placeholder="미입력 시 자동 생성" onChange={(e) => patch('productCode', e.target.value)} /></label>
      <div className={fieldClass('brandName')} data-field="brandName"><span>브랜드 *</span><input value={brandQuery} placeholder="브랜드 검색" onChange={(e) => { setBrandQuery(e.target.value); patch('brandId', ''); patch('brandName', e.target.value) }} />{brandQuery && !form.brandId && <div className="brand-options">{filteredBrands.map((brand) => <button key={brand.id} onClick={() => { patch('brandId', brand.id); patch('brandName', brand.name); setBrandQuery(brand.name) }}>{brand.name}</button>)}{filteredBrands.length === 0 && <p>브랜드가 없습니다. 브랜드 등록이 필요합니다.</p>}</div>}{errors.brandName && <small>{errors.brandName}</small>}</div>
      <label className={fieldClass('productName')} data-field="productName"><span>상품명 *</span><input value={form.productName} onChange={(e) => patch('productName', e.target.value)} />{errors.productName && <small>{errors.productName}</small>}</label>
      <label className="product-field"><span>카테고리</span><input value={form.category} onChange={(e) => patch('category', e.target.value)} /></label>
      <label className="product-field"><span>대표 이미지 URL</span><input type="url" value={form.imageUrl} onChange={(e) => patch('imageUrl', e.target.value)} /></label>
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
      <BooleanSelect label="와이즈샵 사용 가능 *" value={form.wiseShopAvailable} onChange={(value) => patch('wiseShopAvailable', value)} />
      <BooleanSelect label="셀러 결제창 사용 가능 *" value={form.sellerCheckoutAvailable} onChange={(value) => patch('sellerCheckoutAvailable', value)} />
      <BooleanSelect label="브랜드 PG 수수료 지원" value={form.brandPgSupportAvailable} onChange={(value) => patch('brandPgSupportAvailable', value)} />
      {form.brandPgSupportAvailable && <label className="product-field"><span>브랜드 PG 지원율 *</span><select value={form.brandPgSupportRate ?? ''} onChange={(e) => patch('brandPgSupportRate', Number(e.target.value) as ProductPgSupportRate)}><option value="">선택</option>{[1,2,3,4,5].map((rate) => <option key={rate} value={rate}>{rate}%</option>)}</select></label>}
    </div></section>
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
    <section className="product-form-section"><h2>7. 최종 확인</h2><div className="product-review">
      {[
        ['브랜드', form.brandName || '미선택'], ['상품명', form.productName || '미입력'], ['정상가', money(form.regularPrice)], ['공구가', money(form.salePrice)],
        ['공급가', money(form.supplyPrice)], ['배송비', money(form.shippingFee)], ['총 수수료율', `${form.totalCommissionRate}%`],
        ['셀러 기본 수수료율', `${form.sellerCommissionRate}%`], ['회사 수수료율', `${companyRate}%`], ['기본 판매 링크', channelLabels[form.defaultSalesChannelType]],
        ['와이즈샵', form.wiseShopAvailable ? '사용 가능' : '사용 불가'], ['셀러 결제창', form.sellerCheckoutAvailable ? '사용 가능' : '사용 불가'],
        ['브랜드 PG 지원', form.brandPgSupportAvailable ? `있음 · ${form.brandPgSupportRate ?? '미선택'}%` : '없음'],
        ['배송 정책', `${form.courierName || '택배사 미정'} · 합배송 ${form.bundleShippingAvailable ? '가능' : '불가'}`], ['샘플 지원', form.sampleSupportType || '미정'],
      ].map(([label,value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}
    </div><div className="form-footer"><button className="secondary-button" onClick={onBack}>취소</button><button className="primary-button" onClick={() => void save()}>상품 저장</button></div></section>
  </section>
}

function BooleanSelect({ label, value, onChange }: { label: string; value: boolean; onChange: (value: boolean) => void }) {
  return <label className="product-field"><span>{label}</span><select value={value ? 'yes' : 'no'} onChange={(e) => onChange(e.target.value === 'yes')}><option value="yes">사용 가능 / 있음</option><option value="no">사용 불가 / 없음</option></select></label>
}
