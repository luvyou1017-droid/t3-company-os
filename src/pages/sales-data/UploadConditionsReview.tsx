import { matchFlavorPack, parseFlavorPack } from '../../shared/utils/flavorPackMatching'
import { skuDetailDisplay } from './skuDetailDisplay'
import { useUploadDraft } from '../../shared/utils/useUploadDraft'
import { useEffect, useMemo, useState } from 'react'
import type { SalesDataRow } from '../../shared/types/salesData'
import type { SettlementSkuCondition } from '../../shared/types/settlementTerms'
import { calculateSalesRow, formatCurrency } from '../../shared/utils/salesData'
import { productService } from '../../features/productMaster/services/productService'
import type { ProductMaster, ProductMasterInput, ProductSku } from '../../features/productMaster/types'

export function UploadConditionsReview({ rows, conditions, preferredProductIds = [], supplyAudience = 'seller', sellerCheckout = false, vendorName, refreshing = false, onRefresh, busy, error, onApply, onCancel, draftKey }: {
  sellerCheckout?: boolean; supplyAudience?: 'seller' | 'vendor'; vendorName?: string; refreshing?: boolean; onRefresh?: () => void;
  draftKey: string; rows: SalesDataRow[]; conditions: SettlementSkuCondition[]; preferredProductIds?: string[]; busy: boolean; error?: string
  onApply: (rows: SalesDataRow[]) => void; onCancel: () => void
}) {
  const [draft, setDraft, restored] = useUploadDraft<SalesDataRow[]>(`sku-review:${draftKey}`, rows)
  const [detailProducts, setDetailProducts] = useState<ProductMaster[]>([])
  const [detailError, setDetailError] = useState('')
  useEffect(() => {
    let active = true
    void productService.listProductsForImport().then(items => { if (active) { setDetailProducts(items); setDetailError('') } }).catch(() => { if (active) setDetailError('등록 SKU 상세를 불러오지 못했습니다. 기존 정산 조건은 유지됩니다.') })
    return () => { active = false }
  }, [draftKey, refreshing, conditions.length])
  const [productQuery, setProductQuery] = useState('')
  const [recentProductIds, setRecentProductIds] = useState<string[]>([])
  const [createdConditions, setCreatedConditions] = useState<SettlementSkuCondition[]>([])
  const [creatingRowId, setCreatingRowId] = useState('')
  const [creationError, setCreationError] = useState('')
  const allConditions = useMemo(() => [...createdConditions, ...conditions.filter((item) => !createdConditions.some((created) => created.skuId === item.skuId))], [conditions, createdConditions])
  const availableProductIds = new Set([...preferredProductIds, ...recentProductIds, ...draft.map((row) => row.productId).filter(Boolean)])
  const vendorChoices = allConditions.filter((item) => vendorName && item.supplyLabel === `${vendorName} 공급`)
  const feeLabel = supplyAudience === 'vendor' ? '벤더 수수료율' : '셀러 수수료율'
  const rateValue = (rate?: number) => rate === undefined ? '' : Number(rate.toFixed(2))
  const conditionLabel = (item: SettlementSkuCondition) => {
    if (item.skuOptionName?.trim()) return `${item.skuOptionName} | ${item.sellerCommissionRate === undefined ? '수수료 확인 필요' : `${rateValue(item.sellerCommissionRate)}%`}`
    const productName = item.productName.replace(/^\[[^\]]+\]\s*/, '').trim()
    const optionName = item.optionName.trim()
    // Vendor proposal rows already include the actual product and configuration.
    // Keep the proposal bundle title out of the selectable item name.
    const proposalBundle = item.supplyLabel !== '셀러공급' && /\(\d{8}\)$/.test(productName)
    const name = proposalBundle || optionName.includes(productName)
      ? optionName || productName
      : !optionName || productName === optionName ? productName : `${productName} · ${optionName}`
    return `[${item.supplyLabel || '공급 구분 불러오는 중'}] ${name} | ${item.sellerCommissionRate === undefined ? '수수료 확인 필요' : `${rateValue(item.sellerCommissionRate)}%`}`
  }
  const productLabel = (item: SettlementSkuCondition) => item.productName.match(/^\[([^\]]+)\]/)?.[1] ?? item.productName.replace(/\s*·.*$/, '').trim()
  useEffect(() => {
    if (!restored) return
    const normalize = (text: string) => text.toLowerCase().replace(/\d+(?:\.\d+)?%/g, '').replace(/옵션선택|추가옵션|옵션|선택|추가/g, '').replace(/[^a-z0-9가-힣]/g, '')
    let changed = false
    const next = draft.map((row) => {
      if (row.skuId) return row
      const name = normalize(row.optionName)
      const matches = allConditions.filter((item) => preferredProductIds.includes(item.productId)).filter((item) => {
        const text = normalize(item.productName + item.optionName)
        const named = ['입문', '가성비', '더블'].find((word) => name.includes(word))
        if (named) return text.includes(named)
        if (/리필팩|리필박스|리필팍/.test(name) && !/핸들|세트/.test(name)) return /리필박스|리필팩/.test(text) && !/핸들|세트/.test(text)
        return normalize(item.optionName) === name || normalize(item.productName) === name
      })
      if (matches.length !== 1) return row
      const match = matches[0]; changed = true
      return calculateSalesRow({ ...row, skuId: match.skuId, productId: match.productId, productName: match.productName, skuOptionName: match.optionName, detailOption: matchFlavorPack(row.optionName, match.optionName, '', match.productName)?.detailOption ?? row.detailOption,
        sellerSupplyPrice: match.sellerSupplyPrice, agreedUnitPrice: match.groupBuyPrice, unitPrice: row.priceSource === 'file' || row.priceSource === 'manual' ? row.unitPrice : match.groupBuyPrice,
        totalCommissionRate: match.totalCommissionRate, sellerCommissionRate: match.sellerCommissionRate })
    })
    if (changed) setDraft(next)
  }, [allConditions, preferredProductIds, draft, restored])
  const change = (id: string, patch: Partial<SalesDataRow>) => setDraft((items) => items.map((row) => row.id === id ? calculateSalesRow({ ...row, ...patch }) : row))
  const normalizedProductQuery = productQuery.trim().toLocaleLowerCase('ko-KR').replace(/\s+/g, '')
  const searchedProducts = normalizedProductQuery ? Array.from(new Map(allConditions.filter((item) => `${item.productName} ${item.optionName} ${item.supplyLabel}`.toLocaleLowerCase('ko-KR').replace(/\s+/g, '').includes(normalizedProductQuery)).map((item) => [item.productId, item])).values()) : []
  const addProductToAllRows = (productId: string) => {
    setRecentProductIds((current) => current.includes(productId) ? current : [...current, productId])
    setProductQuery('')
  }
  const optionKey = (text: string) => text.toLocaleLowerCase('ko-KR').replace(/\d+(?:\.\d+)?%/g, '').replace(/옵션선택|선택옵션/g, '옵션').replace(/[^a-z0-9가-힣]/g, '')
  const optionGroups = useMemo(() => {
    const groups = new Map<string, SalesDataRow[]>()
    draft.forEach((row) => {
      const key = optionKey(row.optionName) || row.id
      groups.set(key, [...(groups.get(key) ?? []), row])
    })
    return [...groups.values()]
  }, [draft])
  const applyCondition = (targetRows: SalesDataRow[], selected: SettlementSkuCondition) => {
    const ids = new Set(targetRows.map((row) => row.id))
    setRecentProductIds((current) => current.includes(selected.productId) ? current : [...current, selected.productId])
    setDraft((items) => items.map((row) => ids.has(row.id) ? calculateSalesRow({ ...row, skuId: selected.skuId, productId: selected.productId, productName: selected.productName, skuOptionName: selected.optionName, detailOption: matchFlavorPack(row.optionName, selected.optionName, '', selected.productName)?.detailOption ?? row.detailOption,
      sellerSupplyPrice: selected.sellerSupplyPrice, agreedUnitPrice: selected.groupBuyPrice > 0 ? selected.groupBuyPrice : row.unitPrice, unitPrice: row.priceSource === 'sku' ? selected.groupBuyPrice : row.unitPrice,
      totalCommissionRate: selected.totalCommissionRate, sellerCommissionRate: selected.sellerCommissionRate }) : row))
  }
  const createSkuForRows = async (targetRows: SalesDataRow[]) => {
    const row = targetRows[0]
    if (parseFlavorPack(row.optionName)) { setCreationError('맛 구성은 세부옵션으로 보존합니다. 기존 개수별 SKU를 선택해주세요.'); return }
    const source = allConditions.find((item) => item.skuId === row.skuId)
    if (!source) return
    setCreatingRowId(row.id); setCreationError('')
    try {
      const products = await productService.listProducts()
      const product = products.find((item) => item.id === source.productId)
      const template = product?.skus.find((item) => item.id === source.skuId)
      if (!product || !template) throw new Error('기준 SKU를 찾지 못했습니다. 상품 목록을 새로고침해주세요.')
      const normalize = (text: string) => text.toLowerCase().replace(/[^a-z0-9가-힣]/g, '')
      const existing = product.skus.find((item) => normalize(item.optionName) === normalize(row.optionName))
      if (existing) {
        const found = allConditions.find((item) => item.skuId === existing.id)
        if (found) applyCondition(targetRows, found)
        return
      }
      const groupBuyPrice = source.groupBuyPrice || template.groupBuyPrice
      const totalCommissionRate = row.totalCommissionRate ?? source.totalCommissionRate
      const sellerCommissionRate = row.sellerCommissionRate ?? source.sellerCommissionRate
      if (totalCommissionRate === undefined || !Number.isFinite(totalCommissionRate) || totalCommissionRate <= 0 || totalCommissionRate > 100) throw new Error('기준 SKU의 총수수료율을 먼저 확인해주세요.')
      if (sellerCommissionRate === undefined || !Number.isFinite(sellerCommissionRate) || sellerCommissionRate < 0 || sellerCommissionRate > totalCommissionRate) throw new Error('기준 SKU의 셀러 수수료율을 먼저 확인해주세요.')
      const now = new Date().toISOString()
      const nextSku: ProductSku = { ...template, id: crypto.randomUUID(), skuCode: `${template.skuCode || product.productCode}-AUTO-${product.skus.length + 1}`, productId: product.id, productName: row.optionName, optionName: row.optionName, groupBuyPrice, supplyPrice: Math.round(groupBuyPrice * (1 - totalCommissionRate / 100)), totalCommissionRate, sellerCommissionRate, representative: false, createdAt: now, updatedAt: now }
      const persistedKeys = new Set(['id', 'createdAt', 'updatedAt', 'version', 'companyCommissionRate'])
      const input = Object.fromEntries(Object.entries(product).filter(([key]) => !persistedKeys.has(key))) as ProductMasterInput
      await productService.updateProduct(product.id, { ...input, skus: [...product.skus, nextSku] })
      const created: SettlementSkuCondition = { ...source, skuId: nextSku.id, productId: product.id, productName: `[${product.productName}] ${row.optionName}`, optionName: row.optionName, groupBuyPrice, totalCommissionRate, sellerCommissionRate, conditionOrigin: '이번 파일에서 새 SKU 등록' }
      setCreatedConditions((current) => [created, ...current])
      setRecentProductIds((current) => current.includes(product.id) ? current : [...current, product.id])
      applyCondition(targetRows, created)
      onRefresh?.()
    } catch (caught) { setCreationError(caught instanceof Error ? caught.message : '새 SKU를 등록하지 못했습니다.') }
    finally { setCreatingRowId('') }
  }
  return <section className="sales-ai-card upload-conditions-review">
    <h3>SKU 검색·가격 비교·조건 확인</h3><p className="sku-supply-context"><strong>{supplyAudience === 'vendor' ? `벤더 공급 · ${vendorName || '벤더 지정 필요'}` : '셀러 직공급'}</strong> — {feeLabel}을 확인해주세요.</p>
    <div className="sales-supply-notice">
      {supplyAudience === 'vendor' && <strong>{refreshing ? '최신 벤더 SKU 확인 중…' : `${vendorName || '벤더'} 공급 조건 ${vendorChoices.length}개`}</strong>}
      {supplyAudience === 'vendor' && !refreshing && vendorChoices.length === 0 && <p role="status">현재 선택 목록에 {vendorName || '해당 벤더'} 공급 조건이 없습니다. 상품 DB에서 벤더 전용 제안서를 등록하고, 공구의 벤더명이 일치하는지 확인해주세요. 공구를 벤더 공급으로 바꾸는 것만으로 전용 상품이 등록되지는 않습니다.</p>}
      <div className="action-row"><button type="button" className="secondary-button" disabled={busy || refreshing} onClick={onRefresh}>{refreshing ? '불러오는 중…' : '상품 목록 새로고침'}</button><a className="secondary-button" href="/master/products" target="_blank" rel="noopener noreferrer">상품 DB에서 벤더 제안서 등록</a></div>
    </div>
    <p>현재 공구의 상품을 우선 표시합니다. 다른 상품은 검색해서 선택하세요. 연결된 SKU의 판매가·수수료를 적용했습니다. 과거 공구에 저장된 SKU 조건을 우선 사용하며, 없는 경우 등록 상품 조건을 제시합니다. 이번 공구 조건과 같은지 확인해주세요.</p>
    <p>파일에 실제 판매금액이 있으면 유지합니다. 저장한 조건은 이후 상품 DB 변경으로 자동 덮어쓰지 않습니다.</p>
    <div className="sku-shared-search"><label><strong>상품 검색 · 모든 행에 공통 적용</strong><input type="search" aria-label="전체 행 상품·SKU 검색" placeholder="상품명을 한 번만 검색하세요" disabled={busy} value={productQuery} onChange={(event) => setProductQuery(event.target.value)} /><small>검색 결과의 상품을 한 번 추가하면 해당 상품의 전체 SKU가 모든 행 드롭다운에 계속 표시됩니다.</small></label>{normalizedProductQuery && <div className="sku-shared-search__results">{searchedProducts.length ? <><button className="primary-button sku-shared-search__add-all" type="button" onClick={() => { setRecentProductIds((current) => [...new Set([...current, ...searchedProducts.map((item) => item.productId)])]); setProductQuery('') }}>검색된 상품 {searchedProducts.length}개 · 전체 SKU 한 번에 표시</button>{searchedProducts.slice(0, 20).map((item) => <button className="secondary-button" key={item.productId} type="button" onClick={() => addProductToAllRows(item.productId)}><strong>{productLabel(item)}</strong><span>전체 SKU {allConditions.filter((condition) => condition.productId === item.productId).length}개 표시</span></button>)}</> : <p>일치하는 등록 상품이 없습니다.</p>}</div>} {recentProductIds.length > 0 && <div className="sku-shared-search__selected"><strong>공통 표시 중</strong>{recentProductIds.map((id) => { const item = allConditions.find((condition) => condition.productId === id); return <span key={id}>{item ? productLabel(item) : '선택 상품'} · SKU {allConditions.filter((condition) => condition.productId === id).length}개</span> })}</div>}</div>
    {detailError && <p role="status">{detailError}</p>}
    <p>미매칭 옵션을 검색하고 가격·조건을 비교한 뒤 아래에서 한 번만 저장하세요. 같은 원본 옵션은 SKU 선택 시 함께 연결됩니다.</p>
    <div className="comparison-table-wrap"><table className="comparison-table"><thead><tr><th>파일 옵션</th><th>파일 판매가</th><th>연결 SKU</th><th>상품·옵션·세부옵션</th><th>등록 공급가 (현재 DB · 참고)</th><th>적용 판매가</th><th>등록 가격</th><th>{sellerCheckout && supplyAudience !== 'vendor' ? '셀러 적용 공급가' : '이번 정산 공급가'}</th><th>가격 차이</th><th>총 수수료율</th><th>{feeLabel}</th></tr></thead><tbody>{draft.map((row) => <tr key={row.id} style={allConditions.find(item => item.skuId === row.skuId)?.supplyLabel === '이전 연결' ? { background: '#fff9df' } : undefined}>
      <td>{row.optionName}{allConditions.find(item => item.skuId === row.skuId)?.supplyLabel === '이전 연결' && <small title="기존 정산의 연결입니다. 현재 활성 SKU와 다를 수 있으며 연결은 그대로 보존됩니다.">이전연결 · 확인 필요</small>}</td><td>{rows.find((original) => original.id === row.id)?.priceSource === 'file' ? formatCurrency(rows.find((original) => original.id === row.id)!.unitPrice) : '파일 가격 없음'}</td>
      <td>{row.skuId && <strong className="sku-match-meta">{allConditions.find((item) => item.skuId === row.skuId) ? conditionLabel(allConditions.find((item) => item.skuId === row.skuId)!) : '연결 SKU 조건 확인 필요'}</strong>}{row.skuId && <small>{allConditions.find((item) => item.skuId === row.skuId)?.conditionOrigin}</small>}<select aria-label={`${row.optionName} SKU`} disabled={busy || creatingRowId === row.id} value={row.skuId ?? ''} onChange={(event) => {
        const selected = allConditions.find((item) => item.skuId === event.target.value)
        if (!selected) return
        applyCondition(optionGroups.find(group => group.some(item => item.id === row.id)) ?? [row], selected)
      }}><option value="">SKU를 선택하세요</option>{allConditions.filter((item) => item.skuId === row.skuId || (normalizedProductQuery ? (item.productName + ' ' + item.optionName + ' ' + item.supplyLabel).toLocaleLowerCase('ko-KR').replace(/\s+/g, '').includes(normalizedProductQuery) : (availableProductIds.has(item.productId) || (supplyAudience === 'vendor' && item.supplyLabel?.includes(vendorName || '\0'))))).sort((a, b) => Number(b.supplyLabel === `${vendorName} 공급`) - Number(a.supplyLabel === `${vendorName} 공급`)).map((item) => <option key={item.skuId} value={item.skuId}>{conditionLabel(item)}</option>)}</select>{row.skuId && !parseFlavorPack(row.optionName) && allConditions.find((item) => item.skuId === row.skuId)?.optionName.trim() !== row.optionName.trim() && <button className="secondary-button sku-create-from-file" disabled={busy || Boolean(creatingRowId)} onClick={() => void createSkuForRows([row])} type="button">{creatingRowId === row.id ? '새 SKU 등록 중…' : `“${row.optionName}” 새 SKU로 등록`}</button>}</td>
      <td>{(() => { const detail = skuDetailDisplay(detailProducts, row.productId, row.skuId); return detail ? <><strong>[{detail.brandName}] {detail.productName}</strong><small>옵션: {detail.optionName}</small><small>세부옵션: {row.detailOption || detail.detail}</small>{detail.inactive && <small style={{ background: '#fff9df' }} title="현재 미사용·삭제 보관된 SKU입니다. 과거 연결과 정산 조건은 유지됩니다.">이전연결</small>}</> : <small>{row.skuId ? '상세 확인 필요 · 기존 연결 유지' : 'SKU 선택 필요'}</small> })()}</td>
      <td>{(() => { const detail = skuDetailDisplay(detailProducts, row.productId, row.skuId); return <><small>회사 원가: {detail?.companySupplyPrice === undefined ? '확인 필요' : formatCurrency(detail.companySupplyPrice)}</small><small>셀러 적용: {detail?.sellerSupplyPrice === undefined ? '확인 필요' : formatCurrency(detail.sellerSupplyPrice)}</small><small>조회 전용 · 정산에 자동 반영하지 않음</small></> })()}</td>
      <td><input aria-label={`${row.optionName} 판매가`} disabled={busy} type="number" min="1" value={row.unitPrice || ''} onChange={(event) => change(row.id, { unitPrice: Number(event.target.value), agreedUnitPrice: Number(event.target.value), priceSource: 'manual' })} /><small>{row.priceSource === 'sku' ? 'SKU 조건 적용' : row.priceSource === 'manual' ? '직접 수정' : '파일 판매금액 기준'}{row.agreedUnitPrice ? ` · 등록/확정가 ${formatCurrency(row.agreedUnitPrice)}` : ''}</small></td>
      <td>{row.skuId ? formatCurrency(allConditions.find((item) => item.skuId === row.skuId)?.groupBuyPrice ?? 0) : 'SKU 선택 필요'}</td>
      <td>{sellerCheckout && supplyAudience !== 'vendor' ? <input aria-label={`${row.optionName} 셀러 적용 공급가`} disabled={busy} type="number" min="0" placeholder="셀러 공급가 확인 필요" value={row.sellerSupplyPrice ?? ''} onChange={(event) => change(row.id, { sellerSupplyPrice: event.target.value === '' ? undefined : Number(event.target.value) })} /> : row.settlementSupplyPrice === undefined ? '확인 필요' : formatCurrency(row.settlementSupplyPrice)}</td>
      <td>{row.skuId && row.unitPrice > 0 ? formatCurrency((allConditions.find((item) => item.skuId === row.skuId)?.groupBuyPrice ?? 0) - row.unitPrice) : '비교 전'}</td>
      <td><input aria-label={`${row.optionName} 총 수수료율`} disabled={busy} type="number" min="0" max="100" step="any" placeholder="확인 필요" value={rateValue(row.totalCommissionRate)} onChange={(event) => change(row.id, { totalCommissionRate: event.target.value === '' ? undefined : Number(event.target.value) })} /></td>
      <td><input aria-label={`${row.optionName} ${feeLabel}`} disabled={busy} type="number" min="0" max="100" step="any" placeholder="확인 필요" value={rateValue(row.sellerCommissionRate)} onChange={(event) => change(row.id, { sellerCommissionRate: event.target.value === '' ? undefined : Number(event.target.value) })} /></td>
    </tr>)}</tbody></table></div>
    {(error || creationError) && <div className="inline-notice settlement-warning upload-conditions-review__error" role="alert"><strong>반영할 수 없습니다</strong><span>{creationError || error}</span></div>}
    <div className="action-row"><button className="primary-button" disabled={busy} type="button" onClick={() => onApply(draft)}>{busy ? '반영 중…' : '조건 확인 후 반영'}</button><button className="secondary-button" disabled={busy} type="button" onClick={onCancel}>취소</button></div>
  </section>
}
