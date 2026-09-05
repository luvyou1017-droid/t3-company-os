import { useMemo, useState } from 'react'
import { productService } from '../../../features/productMaster/services/productService'
import type { ProductMaster, ProductMasterInput, ProductSku } from '../../../features/productMaster/types'
import { parseWiseProposalFile, type WiseProposalMetadata, type WiseProposalRow } from '../../../features/productMaster/utils/wiseProposalParser'

type Candidate = { key: string; fileName: string; productName: string; rows: WiseProposalRow[]; metadata: WiseProposalMetadata; state: 'ready' | 'draft' | 'duplicate' | 'error'; message?: string }
const normalize = (value: string) => value.toLowerCase().replace(/\s+/g, '').replace(/[^0-9a-z가-힣]/g, '')
const commission = (sale: number, supply: number) => sale > 0 ? ((sale - supply) / sale) * 100 : 0
const won = (value: number) => Math.floor(Number(value) || 0)
const errorMessage = (error: unknown) => {
  if (error instanceof Error) return error.message
  if (error && typeof error === 'object') {
    const value = error as Record<string, unknown>
    return [value.message, value.details, value.hint, value.code].filter(Boolean).join(' · ') || '알 수 없는 저장 오류'
  }
  return String(error || '알 수 없는 저장 오류')
}

function findExisting(products: ProductMaster[], candidate: Candidate) {
  return products.find((product) => normalize(product.brandName) === normalize(candidate.metadata.brandName) && normalize(product.productName) === normalize(candidate.productName))
}

function buildInput(candidate: Candidate, existing?: ProductMaster): ProductMasterInput {
  const now = new Date().toISOString()
  const importKey = crypto.randomUUID().slice(0, 8).toUpperCase()
  const first = candidate.rows[0]
  const skus: ProductSku[] = candidate.rows.map((row, index) => ({
    id: existing?.skus[index]?.id ?? crypto.randomUUID(),
    skuCode: existing?.skus[index]?.skuCode ?? `SKU-${importKey}-${index + 1}`,
    productId: existing?.id ?? 'new-product', productName: row['상품명'], category: row['카테고리'], optionName: row['구성명'],
    pricingType: row['가격 적용 방식'] === '수량 구간' ? 'quantity_tier' : 'fixed', minimumQuantity: row['최소 수량'] || undefined, maximumQuantity: row['최대 수량'] || undefined,
    regularPrice: won(row['정상가']), groupBuyPrice: won(row['공구판매가']), supplyPrice: won(row['총 매입가(VAT포함)']),
    totalCommissionRate: commission(row['공구판매가'], row['총 매입가(VAT포함)']), sellerCommissionRate: row['셀러 수수료율'],
    stockStatus: 'available', sellerPortalVisible: !candidate.metadata.draft, representative: index === 0, active: true,
    createdAt: existing?.skus[index]?.createdAt ?? now, updatedAt: now,
  }))
  const policyCount = new Set(candidate.rows.map((row) => `${commission(row['공구판매가'], row['총 매입가(VAT포함)']).toFixed(4)}:${row['셀러 수수료율'].toFixed(4)}`)).size
  return {
    productCode: existing?.productCode ?? `DRIVE-${importKey}`,
    vendorId: existing?.vendorId, vendorName: candidate.metadata.vendorName,
    brandId: existing?.brandId ?? `drive-${normalize(candidate.metadata.brandName)}`, brandName: candidate.metadata.brandName,
    productName: candidate.productName, category: first['카테고리'], productUrl: candidate.metadata.productUrl,
    regularPrice: won(first['정상가']), salePrice: won(first['공구판매가']), supplyPrice: won(first['총 매입가(VAT포함)']),
    shippingFee: won(candidate.metadata.shippingFee), freeShippingThreshold: candidate.metadata.freeShippingThreshold === undefined ? undefined : won(candidate.metadata.freeShippingThreshold),
    totalCommissionRate: commission(first['공구판매가'], first['총 매입가(VAT포함)']), sellerCommissionRate: first['셀러 수수료율'],
    commissionCalculationType: policyCount > 1 ? 'sku' : 'campaign_total', defaultSalesChannelType: existing?.defaultSalesChannelType ?? 'supplier_link',
    supplierLinkAvailable: true, supplierLinkPgPolicy: existing?.supplierLinkPgPolicy ?? 'manual', wiseShopAvailable: false,
    sellerCheckoutAvailable: false, brandPgSupportAvailable: false, courierName: candidate.metadata.courierName,
    sampleSupportType: candidate.metadata.sampleSupportType, sampleAvailable: !/불가|미지원/.test(candidate.metadata.sampleSupportType), skus,
    sellerPortalVisible: !candidate.metadata.draft, partnerPortalVisible: false,
    sellerPortalStatus: candidate.metadata.draft ? 'closed' : 'available', badges: existing?.badges ?? [],
    managerName: existing?.managerName ?? '김병희', campaignReferences: existing?.campaignReferences ?? [], active: true, testData: false,
    sourceFileName: candidate.fileName, sourceImportedAt: now,
  }
}

export function ProductBulkImportPanel({ existingProducts, onClose, onDone }: { existingProducts: ProductMaster[]; onClose: () => void; onDone: () => Promise<void> }) {
  const [candidates, setCandidates] = useState<Candidate[]>([])
  const [reading, setReading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const summary = useMemo(() => ({
    ready: candidates.filter((item) => item.state === 'ready').length,
    draft: candidates.filter((item) => item.state === 'draft').length,
    duplicate: candidates.filter((item) => item.state === 'duplicate').length,
    error: candidates.filter((item) => item.state === 'error').length,
  }), [candidates])

  const readFiles = async (files?: FileList | null) => {
    if (!files?.length) return
    setReading(true); setMessage('')
    const next: Candidate[] = []
    for (const file of Array.from(files).slice(0, 100)) {
      try {
        const parsed = await parseWiseProposalFile(file)
        const grouped = new Map<string, WiseProposalRow[]>()
        parsed.rows.forEach((row) => grouped.set(row['상품명'], [...(grouped.get(row['상품명']) ?? []), row]))
        grouped.forEach((rows, productName) => {
          const base: Candidate = { key: `${file.name}:${productName}`, fileName: file.name, productName, rows, metadata: parsed.metadata, state: parsed.metadata.draft ? 'draft' : 'ready' }
          const existing = findExisting(existingProducts, base)
          next.push({ ...base, state: parsed.metadata.draft ? 'draft' : existing ? 'duplicate' : 'ready', message: existing ? '기존 상품을 최신 내용으로 갱신' : undefined })
        })
      } catch (error) {
        next.push({ key: file.name, fileName: file.name, productName: '-', rows: [], metadata: { brandName: '-', vendorName: '-', productUrl: '', shippingFee: 0, courierName: '', sampleSupportType: '', draft: file.name.startsWith('수정중') }, state: 'error', message: error instanceof Error ? error.message : '파일을 읽지 못했습니다.' })
      }
    }
    setCandidates(next); setReading(false)
  }

  const save = async () => {
    setSaving(true); setMessage('')
    let saved = 0
    const failures: Array<{ key: string; message: string }> = []
    for (const candidate of candidates.filter((item) => item.state !== 'error')) {
      try {
        const existing = findExisting(existingProducts, candidate)
        const input = buildInput(candidate, existing)
        if (existing) await productService.updateProduct(existing.id, input)
        else await productService.createProduct(input)
        saved += 1
      } catch (error) {
        failures.push({ key: candidate.key, message: errorMessage(error) })
      }
    }
    if (failures.length) {
      const failureMap = new Map(failures.map((failure) => [failure.key, failure.message]))
      setCandidates((current) => current.map((item) => failureMap.has(item.key) ? { ...item, state: 'error', message: failureMap.get(item.key) } : item))
      setMessage(`${saved}개 저장 완료 · ${failures.length}개 확인 필요. 오류 항목만 수정한 뒤 다시 선택해주세요.`)
    } else {
      setMessage(`${saved}개 상품을 저장했습니다. 수정중 제안서는 카탈로그에서 숨겼습니다.`)
    }
    await onDone()
    setSaving(false)
  }

  const saveable = candidates.filter((item) => item.state !== 'error').length
  return <div className="bulk-import-backdrop"><section className="bulk-import-panel" role="dialog" aria-modal="true" aria-labelledby="bulk-import-title">
    <header><div><p className="page-eyebrow">PROPOSAL BULK IMPORT</p><h2 id="bulk-import-title">셀러 제안서 일괄 등록</h2><p>드라이브의 제안서 폴더를 내려받은 뒤 여러 파일을 한 번에 선택하세요.</p></div><button className="secondary-button" onClick={onClose}>닫기</button></header>
    <label className="bulk-import-drop"><strong>{reading ? '제안서를 분석하고 있습니다…' : '와이즈 제안서 여러 개 선택'}</strong><span>xlsx · xls 파일을 최대 100개까지 한 번에 처리합니다.</span><input type="file" accept=".xlsx,.xls" multiple disabled={reading || saving} onChange={(event) => void readFiles(event.target.files)} /></label>
    {!!candidates.length && <><div className="bulk-import-summary"><span>신규 <b>{summary.ready}</b></span><span>초안 <b>{summary.draft}</b></span><span>갱신 <b>{summary.duplicate}</b></span><span>확인 필요 <b>{summary.error}</b></span></div><div className="bulk-import-table"><table><thead><tr><th>상태</th><th>브랜드</th><th>상품</th><th>구성</th><th>파일</th><th>처리</th></tr></thead><tbody>{candidates.map((item) => <tr key={item.key}><td><span className={`import-state is-${item.state}`}>{item.state === 'ready' ? '신규' : item.state === 'draft' ? '초안' : item.state === 'duplicate' ? '갱신' : '오류'}</span></td><td>{item.metadata.brandName}</td><td><strong>{item.productName}</strong></td><td>{item.rows.length}개</td><td>{item.fileName}</td><td>{item.message ?? (item.state === 'draft' ? 'DB 저장 · 카탈로그 숨김' : 'DB 저장 · 셀러 공개')}</td></tr>)}</tbody></table></div></>}
    <footer><p>{message || '저장 전 신규·초안·갱신 항목을 확인해주세요.'}</p><button className="primary-button" disabled={!saveable || saving} onClick={() => void save()}>{saving ? '상품 저장 중…' : `${saveable}개 상품 등록`}</button></footer>
  </section></div>
}
