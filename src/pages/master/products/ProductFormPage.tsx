import { useEffect, useState } from 'react'
import * as XLSX from 'xlsx'
import { productService, validateProductPolicy } from '../../../features/productMaster/services/productService'
import type { ProductCampaignReference, ProductMasterInput, ProductPgSupportRate, ProductSku, SellerPortalStatus, SupplierLinkPgPolicy } from '../../../features/productMaster/types'
import type { ProductMasterPermission } from '../../../features/productMaster/permissions'
import { parseWiseProposalFile } from '../../../features/productMaster/utils/wiseProposalParser'

type Errors = Record<string, string>
const channelLabels = { supplier_link: '업체링크', wise_shop_link: '와이즈 스룩링크', seller_checkout: '셀러 자체 결제창' }
const sectionFields: Record<string, string[]> = {
  basic: ['brandName', 'productName'], price: ['regularPrice', 'salePrice', 'supplyPrice', 'shippingFee'],
  commission: ['totalCommissionRate', 'sellerCommissionRate'], link: ['defaultSalesChannelType', 'wiseShopAvailable', 'sellerCheckoutAvailable'],
}
const initial: ProductMasterInput = {
  productCode: '', vendorId: '', vendorName: '', brandId: '', brandName: '', productName: '', category: '', subCategory: '', imageUrl: '', representativeImageUrl: '', productUrl: '', additionalImageUrls: [], internalDescription: '', sellerDescription: '', memo: '',
  regularPrice: 0, salePrice: 0, supplyPrice: 0, shippingFee: 0, freeShippingThreshold: undefined,
  totalCommissionRate: 0, sellerCommissionRate: 0, companyCommissionRate: 0,
  commissionCalculationType: 'sku',
  defaultSalesChannelType: 'supplier_link', supplierLinkAvailable: true, supplierLinkPgPolicy: 'supplier_bears_pg', supplierLinkPgDeductionRate: undefined,
  wiseShopAvailable: false, wiseSrookPgRate: undefined, sellerCheckoutAvailable: false,
  brandPgSupportAvailable: false, courierName: '', jejuExtraFee: 0, islandExtraFee: 0,
  bundleShippingAvailable: false, orderDeadlineTime: '', sampleSupportType: '', manufactureInfo: '',
  shelfLifeInfo: '', orderMemo: '', settlementMemo: '', internalMemo: '', skus: [], sellerPortalVisible: false,
  sellerPortalStatus: 'closed', badges: [], sampleAvailable: false, managerName: '김병희', managerContact: '',
  campaignReferences: [], active: true, testData: false,
}
const money = (value: number) => `${Number(value || 0).toLocaleString('ko-KR')}원`
const number = (value: string) => value === '' ? 0 : Number(value)
const rateText = (value: number) => `${Number(value.toFixed(1))}%`
const isProductPageUrl = (value?: string) => /(^|\.)smartstore\.naver\.com$/i.test((() => { try { return new URL(value ?? '').hostname } catch { return '' } })()) || /\/products\/\d+/i.test(value ?? '')
const isHttpUrl = (value?: string) => { try { return ['http:', 'https:'].includes(new URL(value ?? '').protocol) } catch { return false } }
const skuMetrics = (sku: Pick<ProductSku, 'regularPrice' | 'groupBuyPrice' | 'supplyPrice' | 'sellerCommissionRate'>, fallbackSellerRate = 0) => {
  const sale = sku.groupBuyPrice || 0
  const sellerRate = sku.sellerCommissionRate ?? fallbackSellerRate
  const totalCommissionRate = sale > 0 ? ((sale - sku.supplyPrice) / sale) * 100 : 0
  const sellerCommissionAmount = Math.round(sale * sellerRate / 100)
  const companyMargin = sale - sku.supplyPrice - sellerCommissionAmount
  return {
    discountRate: sku.regularPrice > 0 ? ((sku.regularPrice - sale) / sku.regularPrice) * 100 : 0,
    totalCommissionRate,
    sellerRate,
    sellerCommissionAmount,
    companyMargin,
    companyMarginRate: sale > 0 ? (companyMargin / sale) * 100 : 0,
  }
}

export function ProductFormPage({ productId, onBack, permission }: { productId?: string; onBack: () => void; permission: ProductMasterPermission }) {
  const [form, setForm] = useState<ProductMasterInput>(initial)
  const [errors, setErrors] = useState<Errors>({})
  const [loading, setLoading] = useState(Boolean(productId))
  const [brandQuery, setBrandQuery] = useState('')
  const [brandOptions, setBrandOptions] = useState<{ id: string; name: string }[]>([])
  const [skuPaste, setSkuPaste] = useState('')
  const [skuMessage, setSkuMessage] = useState('')
  const [skuUploadMode, setSkuUploadMode] = useState<'names_only' | 'replace'>('names_only')
  const [saveMessage, setSaveMessage] = useState('')
  const [thumbnailMessage, setThumbnailMessage] = useState('')
  const [thumbnailLoading, setThumbnailLoading] = useState(false)
  const [thumbnailPreviewFailed, setThumbnailPreviewFailed] = useState(false)
  useEffect(() => {
    productService.listProducts().then((products) => {
      setBrandOptions(Array.from(new Map(products.map((product) => [product.brandId, { id: product.brandId, name: product.brandName }])).values()))
    })
    if (productId) productService.getProductById(productId).then((product) => {
      if (product) {
        setForm(product)
      }
      setBrandQuery(product?.brandName ?? '')
      setLoading(false)
    })
  }, [productId])
  const patch = <K extends keyof ProductMasterInput>(key: K, value: ProductMasterInput[K]) => {
    setForm((current) => ({ ...current, [key]: value }))
    setErrors((current) => { const next = { ...current }; delete next[String(key)]; return next })
  }
  const representativeSku = form.skus.find((sku) => sku.representative && sku.active) ?? form.skus.find((sku) => sku.active)
  const baseRegularPrice = representativeSku?.regularPrice ?? form.regularPrice
  const baseSalePrice = representativeSku?.groupBuyPrice ?? form.salePrice
  const baseSupplyPrice = representativeSku?.supplyPrice ?? form.supplyPrice
  const baseSellerRate = representativeSku?.sellerCommissionRate ?? form.sellerCommissionRate
  const calculatedTotalCommissionRate = baseSalePrice > 0 ? ((baseSalePrice - baseSupplyPrice) / baseSalePrice) * 100 : 0
  const companyRate = calculatedTotalCommissionRate - baseSellerRate
  const filteredBrands = brandOptions.filter((brand) => brand.name.toLowerCase().includes(brandQuery.toLowerCase()))
  const registerBrand = () => {
    const name = brandQuery.trim()
    if (!name) return
    const existing = brandOptions.find((brand) => brand.name.toLowerCase() === name.toLowerCase())
    const brand = existing ?? { id: `brand-${crypto.randomUUID()}`, name }
    if (!existing) setBrandOptions((current) => [...current, brand])
    patch('brandId', brand.id)
    patch('brandName', brand.name)
    setBrandQuery(brand.name)
  }
  const loadThumbnailFromProductUrl = async () => {
    const productUrl = form.productUrl?.trim()
    if (!productUrl) { setThumbnailMessage('상품 링크를 먼저 입력해주세요.'); return }
    setThumbnailLoading(true)
    setThumbnailMessage('')
    setThumbnailPreviewFailed(false)
    try {
      const extractors = [
        async () => {
          const response = await fetch(`https://api.microlink.io?url=${encodeURIComponent(productUrl)}&data.image.selector=${encodeURIComponent('meta[property="og:image"]')}&data.image.type=attr&data.image.attr=content`)
          const result = await response.json() as { data?: { image?: { url?: string } | string } }
          return typeof result.data?.image === 'string' ? result.data.image : result.data?.image?.url
        },
        async () => {
          const response = await fetch(`https://api.microlink.io?url=${encodeURIComponent(productUrl)}`)
          const result = await response.json() as { data?: { image?: { url?: string } } }
          return result.data?.image?.url
        },
        async () => {
          const response = await fetch(`https://jsonlink.io/api/extract?url=${encodeURIComponent(productUrl)}`)
          const result = await response.json() as { image?: string; images?: string[] }
          return result.image || result.images?.[0]
        },
      ]
      let imageUrl = ''
      for (const extract of extractors) {
        try { imageUrl = (await extract())?.trim() ?? '' } catch { imageUrl = '' }
        if (isHttpUrl(imageUrl) && !isProductPageUrl(imageUrl)) break
      }
      if (!isHttpUrl(imageUrl) || isProductPageUrl(imageUrl)) throw new Error('대표 이미지를 찾지 못했습니다.')
      patch('representativeImageUrl', imageUrl)
      patch('imageUrl', imageUrl)
      setThumbnailMessage('상품 링크의 대표 이미지를 불러왔습니다.')
    } catch {
      setThumbnailMessage('스마트스토어가 외부 조회를 막아 자동 불러오지 못했습니다. 상품 페이지에서 대표 사진을 우클릭 → “이미지 주소 복사” 후 아래 칸에 붙여넣어 주세요.')
    } finally { setThumbnailLoading(false) }
  }
  const sectionCount = (section: string) => sectionFields[section]?.filter((field) => errors[field]).length ?? 0
  const updateSku = (id: string, patchValue: Partial<ProductSku>) => patch('skus', form.skus.map((sku) => sku.id === id ? { ...sku, ...patchValue, updatedAt: new Date().toISOString() } : sku))
  const addSku = () => {
    const now = new Date().toISOString()
    const id = crypto.randomUUID()
    patch('skus', [...form.skus, { id, skuCode: `SKU-${Date.now().toString().slice(-6)}`, productId: productId ?? 'new-product', optionName: `옵션 ${form.skus.length + 1}`, pricingType: 'fixed', regularPrice: form.regularPrice, groupBuyPrice: form.salePrice, supplyPrice: form.supplyPrice, stockStatus: 'available', sellerPortalVisible: true, representative: form.skus.length === 0, active: true, createdAt: now, updatedAt: now }])
  }
  const cloneSku = (source: ProductSku) => {
    const now = new Date().toISOString()
    patch('skus', [...form.skus, { ...source, id: crypto.randomUUID(), skuCode: `${source.skuCode}-COPY`, optionName: `${source.optionName} 복사본`, representative: false, createdAt: now, updatedAt: now }])
  }
  const addReference = () => patch('campaignReferences', [...(form.campaignReferences ?? []), { id: crypto.randomUUID(), sellerName: '', campaignDate: '', salesAmount: 0, note: '', linkUrl: '' }])
  const updateReference = (id: string, value: Partial<ProductCampaignReference>) => patch('campaignReferences', (form.campaignReferences ?? []).map((item) => item.id === id ? { ...item, ...value } : item))
  const removeReference = (id: string) => patch('campaignReferences', (form.campaignReferences ?? []).filter((item) => item.id !== id))
  const rowsToSkus = (rows: Array<Record<string, unknown>>, mode: 'append' | 'names_only' | 'replace' = 'append') => {
    const now = new Date().toISOString()
    const cleanNumber = (value: unknown, fallback = 0) => {
      const parsed = Number(String(value ?? '').replace(/[^0-9.-]/g, ''))
      return Number.isFinite(parsed) ? parsed : fallback
    }
    const usableRows = rows.filter((row) => {
      const productName = String(row['상품명'] ?? '').trim()
      const optionName = String(row['구성명'] ?? row['옵션명'] ?? '').trim()
      if (!optionName) return false
      const repeatedPlaceholder = productName && optionName === productName && [row['정상가'], row['공구판매가'], row['총 매입가(VAT포함)']].every((value) => String(value ?? '').trim() === productName)
      return !repeatedPlaceholder
    })
    const firstProductName = String(usableRows.find((row) => row['상품명'])?.['상품명'] ?? '').trim()
    const firstCategory = String(usableRows.find((row) => row['카테고리'])?.['카테고리'] ?? '').trim()
    if (firstProductName) patch('productName', firstProductName)
    if (firstCategory) patch('category', firstCategory)
    if (mode === 'names_only') {
      patch('skus', form.skus.map((sku, index) => ({
        ...sku,
        productName: String(usableRows[index]?.['상품명'] ?? sku.productName ?? form.productName).trim(),
        category: String(usableRows[index]?.['카테고리'] ?? sku.category ?? form.category).trim(),
        updatedAt: now,
      })))
      setSkuMessage(`${Math.min(form.skus.length, usableRows.length)}개 구성에 상품명을 반영했습니다. 기존에 수정한 가격은 유지됩니다.`)
      return
    }
    const next = usableRows.map((row, index): ProductSku => {
      const groupBuyPrice = cleanNumber(row['공구판매가'] ?? row['공구가'], form.salePrice)
      const supplyPrice = cleanNumber(row['총 매입가(VAT포함)'] ?? row['총매입가'] ?? row['총 매입가'] ?? row['공급가'], form.supplyPrice)
      return {
        id: crypto.randomUUID(),
        skuCode: String(row['SKU코드'] ?? row['SKU 코드'] ?? '').trim() || `SKU-${Date.now().toString().slice(-6)}-${index + 1}`,
        productId: productId ?? 'new-product',
        productName: String(row['상품명'] ?? '').trim() || firstProductName,
        category: String(row['카테고리'] ?? '').trim() || firstCategory,
        optionName: String(row['구성명'] ?? row['옵션명'] ?? '').trim(),
        pricingType: String(row['가격 적용 방식'] ?? '').includes('수량') ? 'quantity_tier' : 'fixed',
        minimumQuantity: cleanNumber(row['최소 수량']),
        maximumQuantity: cleanNumber(row['최대 수량']),
        regularPrice: cleanNumber(row['정상가'], form.regularPrice),
        groupBuyPrice,
        supplyPrice,
        totalCommissionRate: groupBuyPrice > 0 ? ((groupBuyPrice - supplyPrice) / groupBuyPrice) * 100 : 0,
        sellerCommissionRate: cleanNumber(row['셀러 수수료율'] ?? row['셀러수수료'] ?? row['셀러 수수료'], form.sellerCommissionRate),
        stockStatus: String(row['상태'] ?? '').includes('한정') ? 'limited' : String(row['상태'] ?? '').includes('품절') ? 'out_of_stock' : String(row['상태'] ?? '').includes('단종') ? 'discontinued' : 'available',
        sellerPortalVisible: true, representative: form.skus.length === 0 && index === 0, active: true, createdAt: now, updatedAt: now,
      }
    })
    if (!next.length) { setSkuMessage('구성명이 있는 행을 찾지 못했습니다. 양식의 열 제목을 확인해주세요.'); return }
    const resultingSkus = mode === 'replace' ? next : [...form.skus, ...next]
    const commissionPolicies = new Set(resultingSkus.filter((sku) => sku.active).map((sku) => `${Number((sku.totalCommissionRate ?? 0).toFixed(4))}:${Number((sku.sellerCommissionRate ?? 0).toFixed(4))}`))
    patch('commissionCalculationType', commissionPolicies.size === 1 ? 'campaign_total' : 'sku')
    patch('skus', resultingSkus)
    setSkuMessage(`${next.length}개 구성을 표에 추가했습니다. 저장 전 가격을 확인해주세요.`)
  }
  const pasteSkus = () => {
    const lines = skuPaste.trim().split(/\r?\n/).filter(Boolean)
    if (!lines.length) return
    const cells = lines.map((line) => line.split('\t'))
    const knownHeaders = ['NO', '카테고리', '상품명', '구성명', '옵션명', '가격 적용 방식', '최소 수량', '최대 수량', '정상가', '공구판매가', '공구가', '총 매입가(VAT포함)', '총매입가', '공급가', '셀러 수수료율', '셀러수수료', '상태']
    const hasHeader = cells[0].some((cell) => knownHeaders.includes(cell.trim()))
    const headers = hasHeader ? cells.shift()!.map((cell) => cell.trim()) : ['NO', '카테고리', '상품명', '구성명', '정상가', '공구판매가', '총 매입가(VAT포함)', '셀러 수수료율', '상태']
    rowsToSkus(cells.map((row) => Object.fromEntries(headers.map((header, index) => [header, row[index] ?? '']))))
    setSkuPaste('')
  }
  const uploadSkuFile = async (file?: File) => {
    if (!file) return
    try {
      const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array' })
      const sheet = workbook.Sheets[workbook.SheetNames[0]]
      rowsToSkus(XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' }), form.skus.length ? skuUploadMode : 'replace')
    } catch { setSkuMessage('파일을 읽지 못했습니다. xlsx 또는 xls 파일인지 확인해주세요.') }
  }
  const uploadWiseProposal = async (file?: File) => {
    if (!file) return
    try {
      const parsed = await parseWiseProposalFile(file)
      rowsToSkus(parsed.rows, 'replace')
      setSkuMessage(`와이즈 제안서의 ${parsed.sheetName} 시트 ${parsed.headerRow}행을 인식해 ${parsed.rows.length}개 구성을 불러왔습니다. 상품별 셀러 수수료도 함께 반영했습니다.`)
    } catch (error) {
      setSkuMessage(error instanceof Error ? error.message : '와이즈 제안서를 읽지 못했습니다.')
    }
  }
  const downloadSkuTemplate = () => {
    const headers = ['NO', '카테고리', '상품명', '구성명', '정상가', '공구판매가', '총 매입가(VAT포함)', '셀러 수수료율', '상태', '할인율(자동)', '총 수수료율(자동)', '셀러 수수료액(자동)', '회사 마진(자동)', '회사 마진율(자동)']
    const rows = Array.from({ length: 30 }, (_, index) => index === 0 ? [1, form.category || '생활', form.productName || '애니블리', '본품 + 추가리필(3롤)', 68000, 63900, 54315, 11, '판매 가능'] : [index + 1, form.category || '', form.productName || '', '', '', '', '', '', '판매 가능'])
    const sheet = XLSX.utils.aoa_to_sheet([headers, ...rows])
    for (let row = 2; row <= 31; row += 1) {
      sheet[`J${row}`] = { t: 'n', f: `IFERROR((E${row}-F${row})/E${row},0)`, z: '0.0%' }
      sheet[`K${row}`] = { t: 'n', f: `IFERROR((F${row}-G${row})/F${row},0)`, z: '0.0%' }
      sheet[`L${row}`] = { t: 'n', f: `IFERROR(F${row}*H${row}/100,0)`, z: '#,##0' }
      sheet[`M${row}`] = { t: 'n', f: `IFERROR(F${row}-G${row}-L${row},0)`, z: '#,##0' }
      sheet[`N${row}`] = { t: 'n', f: `IFERROR(M${row}/F${row},0)`, z: '0.0%' }
    }
    sheet['!cols'] = [{ wch: 7 }, { wch: 13 }, { wch: 24 }, { wch: 28 }, { wch: 13 }, { wch: 15 }, { wch: 21 }, { wch: 17 }, { wch: 13 }, { wch: 15 }, { wch: 19 }, { wch: 22 }, { wch: 17 }, { wch: 18 }]
    sheet['!autofilter'] = { ref: 'A1:N31' }
    const workbook = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(workbook, sheet, 'SKU 입력')
    XLSX.writeFile(workbook, 'SKU_일괄등록_양식.xlsx')
  }
  const validate = () => {
    const next: Errors = {}
    if (!form.brandId) next.brandName = '브랜드를 검색해 선택해주세요.'
    if (!form.productName.trim()) next.productName = '상품명을 입력해주세요.'
    if (!form.skus.length) next.skus = '상품 구성을 한 개 이상 등록해주세요.'
    if (form.skus.some((sku) => sku.active && (sku.groupBuyPrice <= 0 || sku.supplyPrice <= 0))) next.skus = '활성 구성의 공구판매가·총 매입가를 확인해주세요. 정상가는 없어도 저장할 수 있습니다.'
    if (form.shippingFee < 0 || Number.isNaN(form.shippingFee)) next.shippingFee = '배송비를 입력해주세요.'
    if (form.skus.some((sku) => sku.active && (sku.sellerCommissionRate ?? form.sellerCommissionRate) <= 0)) next.skus = '활성 구성의 셀러 수수료율을 입력해주세요.'
    if (form.skus.some((sku) => sku.active && sku.pricingType === 'quantity_tier' && (!sku.minimumQuantity || sku.minimumQuantity < 1 || Boolean(sku.maximumQuantity && sku.maximumQuantity < sku.minimumQuantity)))) next.skus = '수량 구간의 최소·최대 수량을 확인해주세요.'
    if (form.skus.some((sku) => sku.active && (sku.totalCommissionRate ?? (sku.groupBuyPrice > 0 ? (sku.groupBuyPrice - sku.supplyPrice) / sku.groupBuyPrice * 100 : 0)) + 0.01 < (sku.sellerCommissionRate ?? form.sellerCommissionRate))) next.skus = '총수수료율이 셀러 수수료율보다 낮은 구성이 있습니다. 공구가·총 매입가·셀러 수수료율을 확인해주세요.'
    if (!form.defaultSalesChannelType) next.defaultSalesChannelType = '기본 판매 링크를 선택해주세요.'
    const policyError = validateProductPolicy({ ...form, brandPgSupportRate: form.brandPgSupportRate })
    if (policyError) next.defaultSalesChannelType = policyError
    return next
  }
  const save = async () => {
    if (productId ? !permission.canEdit : !permission.canCreate) return
    setSaveMessage('')
    const next = validate()
    setErrors(next)
    if (Object.keys(next).length) {
      document.querySelector(`[data-field="${Object.keys(next)[0]}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      return
    }
    const safeImageUrl = isHttpUrl(form.representativeImageUrl) && !isProductPageUrl(form.representativeImageUrl) ? form.representativeImageUrl : ''
    const input = { ...form, imageUrl: safeImageUrl, representativeImageUrl: safeImageUrl, regularPrice: baseRegularPrice, salePrice: baseSalePrice, supplyPrice: baseSupplyPrice, sellerCommissionRate: baseSellerRate, totalCommissionRate: calculatedTotalCommissionRate, companyCommissionRate: companyRate, productCode: form.productCode || `PRD-${Date.now().toString().slice(-8)}` }
    try {
      if (productId) await productService.updateProduct(productId, input)
      else await productService.createProduct(input)
      onBack()
    } catch (error) {
      const detail = error instanceof Error ? error.message : typeof error === 'object' && error && 'message' in error ? String(error.message) : ''
      setSaveMessage(detail ? `저장하지 못했습니다: ${detail}` : '저장하지 못했습니다. 데이터베이스 연결을 확인해주세요.')
      window.scrollTo({ top: 0, behavior: 'smooth' })
    }
  }
  if (loading) return <div className="master-empty">상품 정보를 불러오는 중입니다.</div>
  const fieldClass = (key: string) => errors[key] ? 'product-field is-error' : 'product-field'
  const sectionTitle = (title: string, key: string) => <h2>{title}{sectionCount(key) > 0 && <span className="section-error-count">누락 {sectionCount(key)}</span>}</h2>
  const readOnly = productId ? !permission.canEdit : !permission.canCreate
  return <section className="product-form-page">
    <div className="master-page__heading"><div><p className="page-eyebrow">Product Master</p><h1>{productId ? (readOnly ? '상품 상세 보기' : '상품 상세·수정') : '신규 상품 등록'}</h1><p>Campaign에서 사용할 상품 기본 조건을 한 페이지에서 관리합니다.</p></div><div className="button-row"><button className="secondary-button" onClick={onBack}>목록</button>{!readOnly && <button className="primary-button" onClick={() => void save()}>저장</button>}</div></div>
    {saveMessage && <p className="product-save-error" role="alert">{saveMessage}</p>}
    <fieldset className="product-form-fieldset" disabled={readOnly}>
    <section className="product-form-section" id="product-basic">{sectionTitle('1. 기본 정보', 'basic')}<div className="product-form-grid">
      <label className={fieldClass('productCode')} data-field="productCode"><span>상품 코드</span><input value={form.productCode} placeholder="미입력 시 자동 생성" onChange={(e) => patch('productCode', e.target.value)} /></label>
      <label className="product-field"><span>공급처</span><input value={form.vendorName} placeholder="공급처 DB 연결 준비" onChange={(e) => { patch('vendorName', e.target.value); patch('vendorId', e.target.value ? `vendor-${e.target.value}` : '') }} /></label>
      <div className={fieldClass('brandName')} data-field="brandName"><span>브랜드 *</span><input value={brandQuery} placeholder="브랜드 검색 또는 새 브랜드명 입력" onChange={(e) => { setBrandQuery(e.target.value); patch('brandId', ''); patch('brandName', e.target.value) }} />{brandQuery && !form.brandId && <div className="brand-options">{filteredBrands.map((brand) => <button type="button" key={brand.id} onClick={() => { patch('brandId', brand.id); patch('brandName', brand.name); setBrandQuery(brand.name) }}>{brand.name}</button>)}{filteredBrands.length === 0 && <button type="button" className="brand-create-button" onClick={registerBrand}>‘{brandQuery.trim()}’ 새 브랜드로 등록</button>}</div>}<small className="brand-field-help">목록에 없으면 브랜드명을 입력한 뒤 바로 등록할 수 있습니다.</small>{errors.brandName && <small>{errors.brandName}</small>}</div>
      <label className={fieldClass('productName')} data-field="productName"><span>상품명 *</span><input value={form.productName} onChange={(e) => patch('productName', e.target.value)} />{errors.productName && <small>{errors.productName}</small>}</label>
      <label className="product-field"><span>카테고리</span><input value={form.category} onChange={(e) => patch('category', e.target.value)} /></label>
      <div className="product-field product-span-2"><span>상품 링크</span><div className="product-link-input"><input type="url" placeholder="스마트스토어 상품 링크를 붙여넣으세요" value={form.productUrl ?? ''} onChange={(e) => patch('productUrl', e.target.value)} onBlur={() => { if (form.productUrl?.trim() && !form.representativeImageUrl && !thumbnailLoading) void loadThumbnailFromProductUrl() }} /><button type="button" className="secondary-button" disabled={thumbnailLoading || !form.productUrl?.trim()} onClick={() => void loadThumbnailFromProductUrl()}>{thumbnailLoading ? '불러오는 중…' : '썸네일 다시 불러오기'}</button></div><small>링크를 붙여넣고 입력 칸을 벗어나면 대표 이미지가 자동으로 표시됩니다.</small>{thumbnailMessage && <small className={thumbnailMessage.includes('실패') ? 'is-error-text' : ''}>{thumbnailMessage}</small>}</div>
      <label className="product-field"><span>대표 이미지 URL</span><input type="url" placeholder="상품 링크가 아닌 이미지 주소를 붙여넣으세요" value={form.representativeImageUrl} onChange={(e) => { const value = e.target.value; patch('representativeImageUrl', value); patch('imageUrl', value); setThumbnailPreviewFailed(false); if (isProductPageUrl(value)) setThumbnailMessage('이 칸에는 상품 페이지 주소가 아니라 이미지 주소가 필요합니다.') }} />{isProductPageUrl(form.representativeImageUrl) && <small className="is-error-text">상품 링크와 이미지 주소는 다릅니다. 이 값은 이미지로 저장되지 않습니다.</small>}</label>
      <div className="product-field product-image-preview"><span>썸네일 미리보기</span>{form.representativeImageUrl && !isProductPageUrl(form.representativeImageUrl) && !thumbnailPreviewFailed ? <img src={form.representativeImageUrl} alt="상품 썸네일 미리보기" onError={() => setThumbnailPreviewFailed(true)} /> : <div>{thumbnailPreviewFailed ? '이미지를 열 수 없습니다. 이미지 주소를 다시 확인해주세요.' : '등록된 이미지 없음'}</div>}</div>
      <label className="product-field product-check"><input type="checkbox" checked={form.active} onChange={(e) => patch('active', e.target.checked)} /><span>활성 상품</span></label>
      <label className="product-field product-span-2"><span>메모</span><textarea value={form.memo} onChange={(e) => patch('memo', e.target.value)} /></label>
    </div></section>
    <section className="product-form-section">{sectionTitle('3. 판매 링크 정책', 'link')}<div className="product-form-grid">
      <label className={fieldClass('defaultSalesChannelType')} data-field="defaultSalesChannelType"><span>기본 판매 링크 *</span><select value={form.defaultSalesChannelType} onChange={(e) => patch('defaultSalesChannelType', e.target.value as ProductMasterInput['defaultSalesChannelType'])}>{Object.entries(channelLabels).map(([value,label]) => <option key={value} value={value}>{label}</option>)}</select>{errors.defaultSalesChannelType && <small>{errors.defaultSalesChannelType}</small>}</label>
      <BooleanSelect label="업체링크 사용 가능 *" value={form.supplierLinkAvailable ?? true} onChange={(value) => patch('supplierLinkAvailable', value)} />
      {form.supplierLinkAvailable && <label className="product-field"><span>업체링크 PG 비용 처리</span><select value={form.supplierLinkPgPolicy ?? 'manual'} onChange={(e) => patch('supplierLinkPgPolicy', e.target.value as SupplierLinkPgPolicy)}><option value="supplier_bears_pg">업체가 전액 부담</option><option value="deduct_from_commission_rate">총 수수료율에서 차감</option><option value="manual">기타/수기</option></select></label>}
      {form.supplierLinkAvailable && form.supplierLinkPgPolicy === 'deduct_from_commission_rate' && <label className="product-field"><span>총 수수료율 차감 (%p)</span><input min="0" max="100" step="0.1" type="number" value={form.supplierLinkPgDeductionRate ?? ''} onChange={(e) => patch('supplierLinkPgDeductionRate', number(e.target.value))} /><small>{rateText(calculatedTotalCommissionRate)} - {form.supplierLinkPgDeductionRate ?? 0}%p = {rateText(Math.max(calculatedTotalCommissionRate - (form.supplierLinkPgDeductionRate ?? 0), 0))}</small></label>}
      <BooleanSelect label="와이즈 스룩링크 사용 가능 *" value={form.wiseShopAvailable} onChange={(value) => patch('wiseShopAvailable', value)} />
      {form.wiseShopAvailable && <label className="product-field"><span>기본 스룩페이 PG 수수료율 (%)</span><input min="0" step="0.1" type="number" value={form.wiseSrookPgRate ?? ''} onChange={(e) => patch('wiseSrookPgRate', number(e.target.value))} /></label>}
      <BooleanSelect label="셀러 결제창 사용 가능 *" value={form.sellerCheckoutAvailable} onChange={(value) => patch('sellerCheckoutAvailable', value)} />
      <BooleanSelect label="브랜드 PG 수수료 지원" value={form.brandPgSupportAvailable} yesLabel="PG 수수료 지원 가능 / 있음" noLabel="PG 수수료 지원 불가 / 없음" onChange={(value) => patch('brandPgSupportAvailable', value)} />
      {form.brandPgSupportAvailable && <label className="product-field"><span>브랜드 PG 지원율 *</span><select value={form.brandPgSupportRate ?? ''} onChange={(e) => patch('brandPgSupportRate', Number(e.target.value) as ProductPgSupportRate)}><option value="">선택</option>{[1,2,3,4,5].map((rate) => <option key={rate} value={rate}>{rate}%</option>)}</select></label>}
    </div><p className="policy-note">{form.supplierLinkAvailable && form.supplierLinkPgPolicy === 'supplier_bears_pg' ? '업체링크 추천 · PG 비용을 업체가 전액 부담합니다.' : form.supplierLinkAvailable && (form.supplierLinkPgDeductionRate ?? 0) <= 5 ? '업체링크 우선 검토 · 차감은 총 수수료율 기준 %p입니다.' : form.wiseShopAvailable ? '와이즈 스룩링크 사용 가능' : 'Campaign 생성 시 실제 링크를 확인해주세요.'}</p></section>
    <section className="product-form-section"><h2>4. 배송 정책</h2><div className="product-form-grid">
      <label className="product-field"><span>택배사</span><input value={form.courierName} onChange={(e) => patch('courierName', e.target.value)} /></label>
      <label className="product-field"><span>기본 배송비 *</span><input min="0" type="number" value={form.shippingFee} onChange={(e) => patch('shippingFee', number(e.target.value))} /></label>
      <label className="product-field"><span>무료배송 기준</span><input min="0" type="number" value={form.freeShippingThreshold ?? ''} onChange={(e) => patch('freeShippingThreshold', number(e.target.value))} /></label>
      {([['jejuExtraFee','제주 추가 배송비'],['islandExtraFee','도서산간 추가 배송비']] as const).map(([key,label]) => <label className="product-field" key={key}><span>{label}</span><input type="number" min="0" value={form[key] ?? 0} onChange={(e) => patch(key, number(e.target.value))} /></label>)}
      <BooleanSelect label="합배송 가능 여부" value={Boolean(form.bundleShippingAvailable)} onChange={(value) => patch('bundleShippingAvailable', value)} />
      <label className="product-field"><span>발주 마감 시간</span><input type="time" value={form.orderDeadlineTime} onChange={(e) => patch('orderDeadlineTime', e.target.value)} /></label>
    </div></section>
    <section className="product-form-section"><h2>5. 운영 참고 정보</h2><div className="product-form-grid">
      <label className="product-field"><span>샘플 지원 여부</span><select value={form.sampleSupportType} onChange={(e) => patch('sampleSupportType', e.target.value)}><option value="">선택</option><option>지원 가능</option><option>지원 불가</option><option>협의 필요</option></select></label>
      {([['manufactureInfo','제조일자 정보'],['shelfLifeInfo','유통기한 정보'],['orderMemo','발주 참고사항'],['settlementMemo','정산 참고 메모'],['internalMemo','담당자 메모']] as const).map(([key,label]) => <label className="product-field" key={key}><span>{label}</span><textarea value={form[key]} onChange={(e) => patch(key, e.target.value)} /></label>)}
    </div></section>
    <section className="product-form-section"><h2>6. 셀러 공개 정보</h2><p className="policy-note">이 영역만 셀러 카탈로그의 공개 전용 데이터로 변환됩니다. 매입가·회사 마진·PG·내부 메모는 전달되지 않습니다.</p><div className="product-form-grid">
      <BooleanSelect label="셀러 카탈로그 공개" value={form.sellerPortalVisible} onChange={(value) => patch('sellerPortalVisible', value)} />
      <label className="product-field"><span>공구 가능 상태</span><select value={form.sellerPortalStatus} onChange={(e) => patch('sellerPortalStatus', e.target.value as SellerPortalStatus)}><option value="available">공구 가능</option><option value="coming_soon">곧 진행 가능</option><option value="paused">일시 중단</option><option value="sold_out">품절</option><option value="closed">진행 종료</option></select></label>
      <BooleanSelect label="샘플 가능 여부" value={form.sampleAvailable} onChange={(value) => patch('sampleAvailable', value)} />
      <label className="product-field product-span-2"><span>셀러용 설명</span><textarea value={form.sellerDescription} onChange={(e) => patch('sellerDescription', e.target.value)} /></label>
      <div className="product-field product-span-2"><span>공개 Badge</span><div className="badge-checks">{([['new','NEW'],['popular','인기'],['recommended','추천'],['recently_successful','최근 진행 성과']] as const).map(([value,label]) => <label key={value}><input type="checkbox" checked={form.badges?.includes(value)} onChange={(e) => patch('badges', e.target.checked ? [...(form.badges ?? []), value] : (form.badges ?? []).filter((badge) => badge !== value))} />{label}</label>)}</div></div>
    </div><div className="reference-heading"><div><h3>진행 레퍼런스</h3><p>이 상품을 진행한 셀러와 성과를 여러 건 등록할 수 있습니다.</p></div>{!readOnly && <button type="button" className="secondary-button" onClick={addReference}>레퍼런스 추가</button>}</div><div className="reference-list">{(form.campaignReferences ?? []).map((reference) => <div className="reference-row" key={reference.id}><label>셀러명<input value={reference.sellerName} onChange={(event) => updateReference(reference.id, { sellerName: event.target.value })} /></label><label>진행일<input type="date" value={reference.campaignDate ?? ''} onChange={(event) => updateReference(reference.id, { campaignDate: event.target.value })} /></label><label>매출<input min="0" type="number" value={reference.salesAmount ?? 0} onChange={(event) => updateReference(reference.id, { salesAmount: number(event.target.value) })} /></label><label>링크<input type="url" placeholder="https://" value={reference.linkUrl ?? ''} onChange={(event) => updateReference(reference.id, { linkUrl: event.target.value })} /></label><label>비고<input value={reference.note ?? ''} onChange={(event) => updateReference(reference.id, { note: event.target.value })} /></label>{!readOnly && <button type="button" className="danger-text" onClick={() => removeReference(reference.id)}>삭제</button>}</div>)}{!(form.campaignReferences ?? []).length && <p className="reference-empty">등록된 진행 레퍼런스가 없습니다.</p>}</div></section>
    <section className="product-form-section" data-field="skus"><div className="sku-heading"><div><h2>2. 상품 구성표</h2><p>엑셀의 여러 행을 그대로 붙여넣거나 양식 파일을 올리면 한 번에 표로 등록됩니다.</p></div>{!readOnly && <button type="button" className="secondary-button" onClick={addSku}>한 줄 추가</button>}</div>
      <div className="sku-commission-policy"><label><span>수수료 적용 기준</span><select value={form.commissionCalculationType ?? 'sku'} onChange={(event) => patch('commissionCalculationType', event.target.value as NonNullable<ProductMasterInput['commissionCalculationType']>)}><option value="campaign_total">공구 총매출에 공통 수수료 적용</option><option value="sku">SKU별 수수료율 적용 후 합산</option></select></label><p>{form.commissionCalculationType === 'campaign_total' ? '색상·사이즈·수량 할인은 매출만 결정합니다. SKU 이름이 달라도 공구에 확정된 공통 수수료율로 정산합니다.' : '치즈처럼 구성마다 수수료율이 다를 때 사용합니다. 판매행을 SKU와 연결한 뒤 각각 계산합니다.'}</p></div>
      {errors.skus && <p className="sku-import-message is-error">{errors.skus}</p>}
      {!readOnly && <div className="sku-bulk-tools"><div className="sku-bulk-copy"><h3>엑셀에서 복사 · 붙여넣기</h3><p>입력 열: NO · 카테고리 · 상품명 · 구성명 · 정상가 · 공구판매가 · 총 매입가 · 셀러 수수료율 · 상태</p><textarea value={skuPaste} onChange={(event) => setSkuPaste(event.target.value)} placeholder={'엑셀에서 여러 행을 복사한 뒤 여기에 붙여넣으세요.\n1\t생활\t애니블리\t본품 + 추가리필(3롤)\t68000\t63900\t54315\t11\t판매 가능'} /><button type="button" className="primary-button" disabled={!skuPaste.trim()} onClick={pasteSkus}>붙여넣은 내용 표에 추가</button></div><div className="sku-bulk-file"><h3>엑셀 파일로 일괄 등록</h3><p>와이즈 제안서는 표 위치와 병합 셀을 자동 인식하고, 상품별 수수료까지 불러옵니다.</p><label className="sku-file-button sku-file-button--primary">와이즈 제안서 업로드<input type="file" accept=".xlsx,.xls" onChange={(event) => void uploadWiseProposal(event.target.files?.[0])} /></label><button type="button" className="secondary-button" onClick={downloadSkuTemplate}>자동계산 엑셀 양식 다운로드</button>{form.skus.length > 0 && <label className="sku-upload-mode"><span>일반 양식 업로드 방식</span><select value={skuUploadMode} onChange={(event) => setSkuUploadMode(event.target.value as 'names_only' | 'replace')}><option value="names_only">상품명만 반영 · 현재 가격 유지</option><option value="replace">구성표 전체 교체</option></select></label>}<label className="sku-file-button">일반 SKU 양식 업로드<input type="file" accept=".xlsx,.xls" onChange={(event) => void uploadSkuFile(event.target.files?.[0])} /></label></div></div>}
      {skuMessage && <p className="sku-import-message" role="status">{skuMessage}</p>}
      <div className="sku-table-wrap"><table className="sku-edit-table sku-edit-table--margin"><thead><tr><th>대표</th><th>SKU 코드</th><th>상품명</th><th>구성명</th><th>가격 기준</th><th>정상가</th><th>공구판매가</th><th>할인율</th><th>총 매입가<br />(VAT포함)</th><th>총 수수료율<br />(자동)</th><th>셀러 수수료율</th><th>셀러 지급액<br />(자동)</th><th>회사 마진<br />(자동)</th><th>회사 마진율<br />(자동)</th><th>상태</th><th>관리</th></tr></thead><tbody>{form.skus.map((sku) => {
        const metrics = skuMetrics(sku, form.sellerCommissionRate)
        return <tr className={!sku.active ? 'is-inactive' : metrics.companyMargin < 0 ? 'has-negative-margin' : ''} key={sku.id}><td><input aria-label={`${sku.optionName} 대표 구성`} type="radio" name="representative-sku" checked={Boolean(sku.representative)} onChange={() => patch('skus', form.skus.map((item) => ({ ...item, representative: item.id === sku.id })))} /></td><td><input value={sku.skuCode} onChange={(event) => updateSku(sku.id, { skuCode: event.target.value })} /></td><td><input value={sku.productName ?? form.productName} onChange={(event) => updateSku(sku.id, { productName: event.target.value })} /></td><td><input value={sku.optionName} onChange={(event) => updateSku(sku.id, { optionName: event.target.value })} /></td><td><div className="sku-price-rule"><select value={sku.pricingType ?? 'fixed'} onChange={(event) => updateSku(sku.id, event.target.value === 'quantity_tier' ? { pricingType: 'quantity_tier', minimumQuantity: sku.minimumQuantity || 1 } : { pricingType: 'fixed', minimumQuantity: undefined, maximumQuantity: undefined })}><option value="fixed">고정가</option><option value="quantity_tier">수량 구간</option></select>{sku.pricingType === 'quantity_tier' && <div><input aria-label={`${sku.optionName} 최소 수량`} min="1" type="number" value={sku.minimumQuantity ?? 1} onChange={(event) => updateSku(sku.id, { minimumQuantity: number(event.target.value) })} /><span>~</span><input aria-label={`${sku.optionName} 최대 수량`} min="0" placeholder="이상" type="number" value={sku.maximumQuantity || ''} onChange={(event) => updateSku(sku.id, { maximumQuantity: number(event.target.value) || undefined })} /></div>}</div></td><td><input type="number" value={sku.regularPrice} onChange={(event) => updateSku(sku.id, { regularPrice: number(event.target.value) })} /></td><td><input type="number" value={sku.groupBuyPrice} onChange={(event) => updateSku(sku.id, { groupBuyPrice: number(event.target.value) })} /></td><td className="sku-auto discount">{rateText(metrics.discountRate)}</td><td><input type="number" value={sku.supplyPrice} onChange={(event) => updateSku(sku.id, { supplyPrice: number(event.target.value) })} /></td><td className="sku-auto total-rate">{rateText(metrics.totalCommissionRate)}</td><td><input type="number" step="0.1" value={metrics.sellerRate} onChange={(event) => updateSku(sku.id, { sellerCommissionRate: number(event.target.value) })} /></td><td className="sku-auto">{money(metrics.sellerCommissionAmount)}</td><td className={`sku-auto company-margin ${metrics.companyMargin < 0 ? 'is-negative' : ''}`}>{money(metrics.companyMargin)}</td><td className={`sku-auto company-rate ${metrics.companyMarginRate < 0 ? 'is-negative' : ''}`}>{rateText(metrics.companyMarginRate)}</td><td><select value={sku.stockStatus} onChange={(event) => updateSku(sku.id, { stockStatus: event.target.value as ProductSku['stockStatus'] })}><option value="available">판매 가능</option><option value="limited">재고 한정</option><option value="out_of_stock">품절</option><option value="discontinued">단종</option></select></td><td>{!readOnly && <div className="sku-row-actions"><button type="button" onClick={() => cloneSku(sku)}>복제</button><button type="button" onClick={() => updateSku(sku.id, { active: !sku.active })}>{sku.active ? '끄기' : '켜기'}</button></div>}</td></tr>
      })}{form.skus.length === 0 && <tr><td className="sku-empty-cell" colSpan={16}>아직 등록된 구성이 없습니다. 엑셀에서 붙여넣거나 한 줄을 추가해주세요.</td></tr>}</tbody></table></div>
      {form.skus.length > 0 && <p className="sku-table-help">총 {form.skus.length}개 구성 · 표 안에서 가격과 구성명을 바로 수정할 수 있습니다.</p>}
    </section>
    <section className="product-form-section"><h2>7. 최종 확인</h2><div className="product-review">
      {[
        ['브랜드', form.brandName || '미선택'], ['상품명', form.productName || '미입력'], ['등록 구성', `${form.skus.length}개`], ['대표 공구가', money(baseSalePrice)],
        ['대표 총 매입가', money(baseSupplyPrice)], ['배송비', money(form.shippingFee)], ['대표 총 수수료율', rateText(calculatedTotalCommissionRate)],
        ['수수료 적용 기준', form.commissionCalculationType === 'campaign_total' ? '공구 총매출 공통' : 'SKU별 상이'],
        ['대표 셀러 수수료율', rateText(baseSellerRate)], ['대표 회사 수수료율', rateText(companyRate)], ['기본 판매 링크', channelLabels[form.defaultSalesChannelType]],
        ['와이즈샵', form.wiseShopAvailable ? '사용 가능' : '사용 불가'], ['셀러 결제창', form.sellerCheckoutAvailable ? '사용 가능' : '사용 불가'],
        ['브랜드 PG 지원', form.brandPgSupportAvailable ? `있음 · ${form.brandPgSupportRate ?? '미선택'}%` : '없음'],
        ['배송 정책', `${form.courierName || '택배사 미정'} · 합배송 ${form.bundleShippingAvailable ? '가능' : '불가'}`], ['샘플 지원', form.sampleSupportType || '미정'],
      ].map(([label,value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}
    </div></section>
    </fieldset>
    <div className="form-footer"><button className="secondary-button" onClick={onBack}>{readOnly ? '목록' : '취소'}</button>{!readOnly && <button className="primary-button" onClick={() => void save()}>상품 저장</button>}</div>
  </section>
}

function BooleanSelect({ label, value, onChange, yesLabel = '사용 가능 / 있음', noLabel = '사용 불가 / 없음' }: { label: string; value: boolean; onChange: (value: boolean) => void; yesLabel?: string; noLabel?: string }) {
  return <label className="product-field"><span>{label}</span><select value={value ? 'yes' : 'no'} onChange={(e) => onChange(e.target.value === 'yes')}><option value="yes">{yesLabel}</option><option value="no">{noLabel}</option></select></label>
}
