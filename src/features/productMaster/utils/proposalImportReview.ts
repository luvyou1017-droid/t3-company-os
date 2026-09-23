import type { ProductMaster, ProductMasterInput, ProductSku } from '../types'
import type { WiseProposalMetadata, WiseProposalRow } from './wiseProposalParser'
export type Candidate = { settlementVendorName?: string; vendorId?: string; supplierIssue?: string; key: string; fileName: string; productName: string; rows: WiseProposalRow[]; metadata: WiseProposalMetadata; state?: 'ready' | 'draft' | 'duplicate' | 'error'; message?: string }
const normalize = (value: string) => value.toLowerCase().replace(/\s+/g, '').replace(/[^0-9a-z가-힣]/g, '')
const commission = (sale: number, supply: number) => sale > 0 ? ((sale - supply) / sale) * 100 : 0
const rate = (value: number) => Math.round(value * 1e6) / 1e6
const won = (value: number) => Math.floor(Number(value) || 0)
export function buildInput(candidate: Candidate): ProductMasterInput {
  if (candidate.settlementVendorName) candidate = { ...candidate, rows: candidate.rows.map((row) => {
    const product = row['상품명'].trim()
    const option = row['구성명'].trim()
    return { ...row, '상품명': !option || option === '본품' || product.includes(option) ? product : `${product} · ${option}` }
  }) }
  const now = new Date().toISOString()
  const importKey = crypto.randomUUID().slice(0, 8).toUpperCase()
  const first = candidate.rows[0]
  const skus: ProductSku[] = candidate.rows.map((row, index) => {
    const identity = parseProposalOptionIdentity(row)
    const terms = { regularPrice: won(row['정상가']), salePrice: won(row['공구판매가']), companySupplyPrice: won(row['총 매입가(VAT포함)']), sellerCommissionRate: rate(row['셀러 수수료율']), shippingFee: won(candidate.metadata.shippingFee), freeShippingThreshold: candidate.metadata.freeShippingThreshold, sourceFileName: candidate.fileName, capturedAt: now }
    return {
    id: crypto.randomUUID(),
    skuCode: `SKU-${importKey}-${index + 1}`,
    productId: 'new-product', productName: candidate.productName, category: row['카테고리'], optionName: identity.optionName, optionValues: identity.optionValues,
    currentTradeTerms: terms, lifecycleStatus: 'active',
    pricingType: row['가격 적용 방식'] === '수량 구간' ? 'quantity_tier' : 'fixed', minimumQuantity: row['최소 수량'] || undefined, maximumQuantity: row['최대 수량'] || undefined,
    regularPrice: won(row['정상가']), groupBuyPrice: won(row['공구판매가']), supplyPrice: won(row['총 매입가(VAT포함)']),
    totalCommissionRate: commission(row['공구판매가'], row['총 매입가(VAT포함)']), sellerCommissionRate: rate(row['셀러 수수료율']),
    stockStatus: 'available', sellerPortalVisible: !candidate.metadata.draft && !candidate.settlementVendorName, representative: index === 0, active: true,
    createdAt: now, updatedAt: now,
  }})
  const policyCount = new Set(candidate.rows.map((row) => `${commission(row['공구판매가'], row['총 매입가(VAT포함)']).toFixed(4)}:${row['셀러 수수료율'].toFixed(4)}`)).size
  return {
    supplyAudience: candidate.settlementVendorName ? 'vendor' : 'seller', settlementVendorName: candidate.settlementVendorName,
    productCode: `DRIVE-${importKey}`,
    vendorId: candidate.vendorId, vendorName: candidate.metadata.vendorName,
    brandId: `drive-${normalize(candidate.metadata.brandName)}`, brandName: candidate.metadata.brandName,
    productName: candidate.productName, category: first['카테고리'], productUrl: candidate.metadata.productUrl,
    regularPrice: won(first['정상가']), salePrice: won(first['공구판매가']), supplyPrice: won(first['총 매입가(VAT포함)']),
    shippingFee: won(candidate.metadata.shippingFee), freeShippingThreshold: candidate.metadata.freeShippingThreshold === undefined ? undefined : won(candidate.metadata.freeShippingThreshold),
    totalCommissionRate: commission(first['공구판매가'], first['총 매입가(VAT포함)']), sellerCommissionRate: rate(first['셀러 수수료율']),
    commissionCalculationType: policyCount > 1 ? 'sku' : 'campaign_total', defaultSalesChannelType: 'supplier_link',
    supplierLinkAvailable: true, supplierLinkPgPolicy: 'manual', wiseShopAvailable: false,
    sellerCheckoutAvailable: false, brandPgSupportAvailable: false, courierName: candidate.metadata.courierName,
    lifecycleStatus: 'active',
    currentTradeTerms: { regularPrice: won(first['정상가']), salePrice: won(first['공구판매가']), companySupplyPrice: won(first['총 매입가(VAT포함)']), sellerCommissionRate: rate(first['셀러 수수료율']), shippingFee: won(candidate.metadata.shippingFee), freeShippingThreshold: candidate.metadata.freeShippingThreshold, sourceFileName: candidate.fileName, capturedAt: now },
    operatingInfo: {
      courierName: candidate.metadata.courierName, baseShippingFee: won(candidate.metadata.shippingFee), freeShippingThreshold: candidate.metadata.freeShippingThreshold,
      jejuExtraFee: candidate.metadata.jejuExtraFee, islandExtraFee: candidate.metadata.islandExtraFee, returnShippingFee: candidate.metadata.returnShippingFee,
      exchangeShippingFee: candidate.metadata.exchangeShippingFee, bundleShippingAvailable: candidate.metadata.bundleShippingAvailable,
      orderDeadlineTime: candidate.metadata.orderDeadlineTime, stockInfo: candidate.metadata.stockInfo, manufactureInfo: candidate.metadata.manufactureInfo,
      shelfLifeInfo: candidate.metadata.shelfLifeInfo, linkProvided: candidate.metadata.linkProvided, sampleSupportType: candidate.metadata.sampleSupportType,
    },
    proposalSupplierInfo: {
      vendorName: candidate.metadata.vendorName, businessRegistrationNumber: candidate.metadata.businessRegistrationNumber,
      address: candidate.metadata.vendorAddress, account: candidate.metadata.vendorAccount, taxInvoiceEmail: candidate.metadata.taxInvoiceEmail,
      orderContact: candidate.metadata.orderContact, orderEmail: candidate.metadata.orderEmail, csContact: candidate.metadata.csContact,
      csEmail: candidate.metadata.csEmail, settlementContact: candidate.metadata.settlementContact, settlementEmail: candidate.metadata.settlementEmail,
      mainBusinessEmail: candidate.metadata.mainBusinessEmail, businessHours: candidate.metadata.businessHours, salesHurdle: candidate.metadata.salesHurdle,
    },
    sampleSupportType: candidate.metadata.sampleSupportType, sampleAvailable: !/불가|미지원/.test(candidate.metadata.sampleSupportType), skus,
    sellerPortalVisible: !candidate.metadata.draft && !candidate.settlementVendorName, partnerPortalVisible: false,
    sellerPortalStatus: candidate.metadata.draft ? 'closed' : 'available', badges: [],
    managerName: '김병희', campaignReferences: [], active: true, testData: false,
    sourceFileName: candidate.fileName, sourceImportedAt: now,
  }
}


export type ReviewState = '기존' | '신규' | '조건변경' | '확인필요'
export type Difference = { label: string; before: string | number; after: string | number }
export type ReviewRow = { key: string; index: number; state: ReviewState; selected: boolean; skuId?: string; candidateSkuIds?: string[]; differences: Difference[]; comparisons: Difference[]; reason?: string }
export type ReviewCandidate = Candidate & { existingId?: string; candidateProductIds?: string[]; baseline?: string; items: ReviewRow[]; error?: string; saved?: boolean }

const knownColors = ['베이지', '화이트', '아이보리', '민트', '스카이', '오렌지', '핑크', '블랙', '그레이', '브라운', '네이비', '레드', '블루', '그린', '옐로우', '퍼플', '실버', '골드']
export function parseProposalOptionIdentity(row: WiseProposalRow) {
  const raw = (row['구성명'] || row['상품명']).trim().replace(/\s+/g, ' ')
  const optionValues: Record<string, string> = {}
  const color = knownColors.filter((value) => normalize(raw).includes(normalize(value))).join(' / ')
  if (color) optionValues.컬러 = color
  const labeledSize = raw.match(/(?:사이즈|size)\s*[:：]?\s*([0-9a-z가-힣×x*+-]+)/i)?.[1]
  if (labeledSize) optionValues.사이즈 = labeledSize
  let optionName = raw
  for (const value of color.split(' / ').filter(Boolean)) optionName = optionName.replace(new RegExp(value, 'gi'), ' ')
  if (labeledSize) optionName = optionName.replace(/(?:사이즈|size)\s*[:：]?\s*[0-9a-z가-힣×x*+-]+/i, ' ')
  optionName = optionName.replace(/[|,/·]+/g, ' ').replace(/\s+/g, ' ').trim()
  if (!optionName) optionName = '기본 구성'
  else if (normalize(optionName) === normalize(row['상품명'])) optionName = row['구성명'] && normalize(row['구성명']) !== normalize(row['상품명']) ? row['구성명'].trim() : '기본 구성'
  return { optionName, optionValues: Object.keys(optionValues).length ? optionValues : undefined }
}

// Include composition/channel/quantity in new identities. Legacy aliases are accepted only uniquely.
export function sourceOption(row: WiseProposalRow) {
  const name = row['상품명'].trim()
  const identity = parseProposalOptionIdentity(row)
  const detail = Object.values(identity.optionValues ?? {}).join(' / ')
  return `[${name}] ${identity.optionName}${detail ? ` · ${detail}` : ''}`
}
const scopeProducts = (products: ProductMaster[], candidate: Candidate) => products.filter(product => candidate.settlementVendorName
  ? product.supplyAudience === 'vendor' && product.settlementVendorName === candidate.settlementVendorName
  : product.supplyAudience !== 'vendor')
const fingerprint = (product: ProductMaster) => JSON.stringify(product)
const skuIdentity = (sku: ProductSku) => normalize(`${sku.optionName} ${Object.values(sku.optionValues ?? {}).join(' ')}`)
const similar = (a: string, b: string) => {
  a = normalize(a); b = normalize(b)
  if (!a || !b) return false
  if (a.includes(b) || b.includes(a)) return true
  const previous = Array.from({ length: b.length + 1 }, (_, i) => i)
  for (let i = 1; i <= a.length; i++) {
    let diagonal = previous[0]; previous[0] = i
    for (let j = 1; j <= b.length; j++) {
      const old = previous[j]
      previous[j] = Math.min(previous[j] + 1, previous[j - 1] + 1, diagonal + Number(a[i - 1] !== b[j - 1]))
      diagonal = old
    }
  }
  return previous[b.length] <= Math.max(1, Math.floor(Math.max(a.length, b.length) * .2))
}
export function findExisting(products: ProductMaster[], candidate: Candidate) {
  const matches = scopeProducts(products, candidate).filter(product => normalize(product.brandName) === normalize(candidate.metadata.brandName) && normalize(product.productName) === normalize(candidate.productName))
  return matches.length === 1 ? matches[0] : undefined
}
export function reviewCandidate(candidate: Candidate, products: ProductMaster[]): ReviewCandidate {
  const scoped = scopeProducts(products, candidate)
  const exact = scoped.filter(product => normalize(product.brandName) === normalize(candidate.metadata.brandName) && normalize(product.productName) === normalize(candidate.productName))
  const existing = exact.length === 1 ? exact[0] : undefined
  const productCandidates = scoped.filter(product => normalize(product.brandName) === normalize(candidate.metadata.brandName) && similar(product.productName, candidate.productName))
  let issue = exact.length > 1 ? '동일 브랜드·상품 후보가 여러 개입니다.' : undefined
  if (!existing && (productCandidates.length || scoped.some(product => product.sourceFileName === candidate.fileName))) issue = `기존 상품 후보 ${productCandidates.length || 1}개가 있습니다. 자동 통합하지 않으니 상품을 확인해주세요.`
  if (candidate.supplierIssue) issue = candidate.supplierIssue
  if (!candidate.productName.trim() || !candidate.metadata.brandName.trim() || /확인 필요/.test(candidate.productName + candidate.metadata.brandName)) issue = '브랜드·상품명을 확인해주세요.'
  if (existing && !existing.active) issue = '미사용 상품입니다. 자동 재활성화하지 않습니다.'
  if (candidate.metadata.shippingFeeKnown === false) issue = '배송비가 없거나 해석할 수 없습니다. 원본에 배송비를 명시해주세요.'
  const names = candidate.rows.map(row => normalize(sourceOption(row)))
  const items = candidate.rows.map((row, index): ReviewRow => {
    let reason = issue
    const identity = parseProposalOptionIdentity(row)
    const option = identity.optionName
    const detailedOption = normalize(`${option} ${Object.values(identity.optionValues ?? {}).join(' ')}`)
    if (names.filter(name => name === names[index]).length > 1) reason = '파일 안에 동일한 SKU가 중복되어 있습니다.'
    if (![row['공구판매가'], row['총 매입가(VAT포함)'], row['셀러 수수료율'], candidate.metadata.shippingFee].every(Number.isFinite) || row['공구판매가'] <= 0 || row['총 매입가(VAT포함)'] <= 0 || row['셀러 수수료율'] < 0 || row['셀러 수수료율'] > 100 || candidate.metadata.shippingFee < 0) reason = '가격·수수료·배송비를 확인해주세요.'
    const aliases = [option, sourceOption(row), row['구성명'], row['상품명']].filter(Boolean).map(normalize)
    const exactOptions = existing?.skus.filter(sku => skuIdentity(sku) === detailedOption) ?? []
    const legacyAliases = existing?.skus.filter(sku => !sku.optionValues && aliases.includes(normalize(sku.optionName))) ?? []
    const matches = exactOptions.length ? exactOptions : legacyAliases
    // A legacy product-name-only option cannot distinguish two source compositions.
    const sku = matches.length === 1 ? matches[0] : undefined
    if (matches.length > 1) reason = '동일 옵션 후보가 여러 개입니다.'
    if (sku && !exactOptions.length && normalize(sku.optionName) === normalize(row['상품명']) && normalize(option) !== normalize(row['상품명'])) reason = '기존 SKU에 구성 정보가 없어 같은 옵션인지 확인할 수 없습니다.'
    if (sku && candidate.rows.filter(other => {
      const otherIdentity = parseProposalOptionIdentity(other)
      const precise = existing?.skus.filter(value => skuIdentity(value) === normalize(`${otherIdentity.optionName} ${Object.values(otherIdentity.optionValues ?? {}).join(' ')}`)) ?? []
      return precise.length ? precise.some(value => value.id === sku.id) : [other['구성명'], other['상품명']].filter(Boolean).map(normalize).includes(normalize(sku.optionName))
    }).length > 1) reason = '여러 행이 같은 기존 SKU를 가리킵니다.'
    if (sku && !sku.active) reason = '미사용 SKU입니다. 자동 재활성화하지 않습니다.'
    if (!sku && existing?.skus.some(item => similar(`${item.optionName} ${Object.values(item.optionValues ?? {}).join(' ')}`, `${option} ${Object.values(identity.optionValues ?? {}).join(' ')}`))) reason = '옵션명 변경인지 신규 SKU인지 확인해주세요.'
    const differences: Difference[] = []
    const comparisons: Difference[] = []
    if (sku && existing) {
      const pairs: Difference[] = [
        { label: '상품명', before: sku.productName ?? existing.productName, after: candidate.productName },
        // Preserve uniquely matched legacy option names; do not silently rename identities.
        { label: '옵션명', before: sku.optionName, after: sku.optionName },
        { label: '판매가', before: sku.policyOverrides?.groupBuyPrice ?? sku.groupBuyPrice, after: won(row['공구판매가']) },
        { label: '공급가', before: sku.policyOverrides?.supplyPrice ?? sku.supplyPrice, after: won(row['총 매입가(VAT포함)']) },
        { label: '셀러 수수료', before: rate(sku.policyOverrides?.sellerCommissionRate ?? sku.sellerCommissionRate ?? existing.sellerCommissionRate), after: rate(row['셀러 수수료율']) },
        { label: '배송비', before: sku.policyOverrides?.shippingFee ?? sku.shippingFee ?? existing.defaultPolicy?.shippingFee ?? existing.shippingFee, after: won(candidate.metadata.shippingFee) },
        { label: '최소 수량', before: sku.minimumQuantity ?? 0, after: row['최소 수량'] || 0 },
        { label: '최대 수량', before: sku.maximumQuantity ?? 0, after: row['최대 수량'] || 0 },
        { label: '가격 적용 방식', before: sku.pricingType === 'quantity_tier' ? '수량 구간' : '고정가', after: row['가격 적용 방식'] || '고정가' },
        { label: '정상가', before: sku.policyOverrides?.regularPrice ?? sku.regularPrice, after: row['정상가'] > 0 ? won(row['정상가']) : sku.policyOverrides?.regularPrice ?? sku.regularPrice },
      ]
      comparisons.push(...pairs)
      differences.push(...pairs.filter(pair => pair.before !== pair.after))
    }
    return { key: `${candidate.key}:${index}`, index, skuId: sku?.id, candidateSkuIds: matches.map(item => item.id), state: reason ? '확인필요' : !sku ? '신규' : differences.length ? '조건변경' : '기존', selected: false, differences, comparisons, reason }
  })
  return { ...candidate, existingId: existing?.id, candidateProductIds: productCandidates.map(product => product.id), baseline: existing && fingerprint(existing), items }
}
export function reviewBatch(candidates: Candidate[], products: ProductMaster[]) {
  const reviewed = candidates.map(candidate => reviewCandidate(candidate, products))
  for (const candidate of reviewed) {
    const overlapping = reviewed.some(other => other !== candidate && (candidate.existingId ? other.existingId === candidate.existingId : normalize(other.metadata.brandName) === normalize(candidate.metadata.brandName) && normalize(other.productName) === normalize(candidate.productName)))
    if (overlapping) candidate.items = candidate.items.map(item => ({ ...item, state: '확인필요', selected: false, reason: '여러 파일이 같은 상품을 가리킵니다. 한 파일씩 확인해주세요.' }))
  }
  return reviewed
}
export function applyReviewed(candidate: ReviewCandidate, products: ProductMaster[]): ProductMasterInput | null {
  const selected = candidate.items.filter(item => item.selected && item.state !== '확인필요' && item.state !== '기존')
  if (!selected.length) return null
  const fresh = reviewCandidate(candidate, products)
  if (fresh.existingId !== candidate.existingId || fresh.baseline !== candidate.baseline) throw new Error('검토 이후 상품이 변경되었습니다. 파일을 다시 선택해 비교해주세요.')
  for (const item of selected) {
    const checked = fresh.items[item.index]
    if (!checked || checked.state !== item.state || checked.skuId !== item.skuId || JSON.stringify(checked.differences) !== JSON.stringify(item.differences)) throw new Error('비교 결과가 달라졌습니다. 다시 확인해주세요.')
  }
  const existing = products.find(product => product.id === candidate.existingId)
  if (!existing) return buildInput({ ...candidate, rows: selected.map(item => candidate.rows[item.index]) })
  const skus = existing.skus.map(sku => structuredClone(sku))
  const now = new Date().toISOString()
  for (const item of selected) {
    const row = candidate.rows[item.index]
    const index = skus.findIndex(sku => sku.id === item.skuId)
    if (index < 0) {
      const added = buildInput({ ...candidate, rows: [row] }).skus[0]
      skus.push({ ...added, productId: existing.id, representative: false, shippingFee: won(candidate.metadata.shippingFee) })
    } else {
      const sku = skus[index]
      const pricing = { groupBuyPrice: won(row['공구판매가']), supplyPrice: won(row['총 매입가(VAT포함)']), sellerCommissionRate: rate(row['셀러 수수료율']), shippingFee: won(candidate.metadata.shippingFee), regularPrice: row['정상가'] > 0 ? won(row['정상가']) : sku.policyOverrides?.regularPrice ?? sku.regularPrice, totalCommissionRate: commission(row['공구판매가'], row['총 매입가(VAT포함)']) }
      skus[index] = { ...sku, ...pricing, currentTradeTerms: { ...sku.currentTradeTerms, regularPrice: pricing.regularPrice, salePrice: pricing.groupBuyPrice, companySupplyPrice: pricing.supplyPrice, sellerCommissionRate: pricing.sellerCommissionRate, shippingFee: pricing.shippingFee, freeShippingThreshold: candidate.metadata.freeShippingThreshold, sourceFileName: candidate.fileName, capturedAt: now }, minimumQuantity: row['최소 수량'] || undefined, maximumQuantity: row['최대 수량'] || undefined, pricingType: row['가격 적용 방식'] === '수량 구간' ? 'quantity_tier' : 'fixed', productName: candidate.productName, policyOverrides: { ...sku.policyOverrides, ...pricing }, updatedAt: now }
    }
  }
  // Only the explicitly selected import updates current operating/supplier metadata.
  // Campaign/proposal snapshots and unrelated SKU identities remain untouched.
  return {
    ...existing,
    vendorId: candidate.vendorId ?? existing.vendorId,
    vendorName: candidate.metadata.vendorName || existing.vendorName,
    operatingInfo: {
      ...existing.operatingInfo,
      courierName: candidate.metadata.courierName || existing.operatingInfo?.courierName,
      baseShippingFee: candidate.metadata.shippingFee,
      freeShippingThreshold: candidate.metadata.freeShippingThreshold,
      jejuExtraFee: candidate.metadata.jejuExtraFee,
      islandExtraFee: candidate.metadata.islandExtraFee,
      returnShippingFee: candidate.metadata.returnShippingFee,
      exchangeShippingFee: candidate.metadata.exchangeShippingFee,
      bundleShippingAvailable: candidate.metadata.bundleShippingAvailable,
      orderDeadlineTime: candidate.metadata.orderDeadlineTime,
      stockInfo: candidate.metadata.stockInfo,
      manufactureInfo: candidate.metadata.manufactureInfo,
      shelfLifeInfo: candidate.metadata.shelfLifeInfo,
      linkProvided: candidate.metadata.linkProvided,
      sampleSupportType: candidate.metadata.sampleSupportType,
    },
    proposalSupplierInfo: {
      ...existing.proposalSupplierInfo,
      vendorName: candidate.metadata.vendorName,
      businessRegistrationNumber: candidate.metadata.businessRegistrationNumber,
      address: candidate.metadata.vendorAddress,
      account: candidate.metadata.vendorAccount,
      taxInvoiceEmail: candidate.metadata.taxInvoiceEmail,
      orderContact: candidate.metadata.orderContact,
      orderEmail: candidate.metadata.orderEmail,
      csContact: candidate.metadata.csContact,
      csEmail: candidate.metadata.csEmail,
      settlementContact: candidate.metadata.settlementContact,
      settlementEmail: candidate.metadata.settlementEmail,
      mainBusinessEmail: candidate.metadata.mainBusinessEmail,
      businessHours: candidate.metadata.businessHours,
      salesHurdle: candidate.metadata.salesHurdle,
    },
    skus,
  }
}
