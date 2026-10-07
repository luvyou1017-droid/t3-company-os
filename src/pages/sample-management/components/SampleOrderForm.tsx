import { SampleChoiceField, SAMPLE_PURPOSES } from './SampleChoiceField'
import { blankProvision, blankOperations, provisionTotal, unsettledCampaigns } from '../../../features/samples/sampleProvision'
import { SampleProvisionFields } from './SampleProvisionFields'
import { settlementService } from '../../../shared/services/settlementService'
import { appUsers } from '../../../shared/data/users'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useCompanyAuth } from '../../../features/auth/AuthGate'
import { normalizeProductIdentity, productService } from '../../../features/productMaster/services/productService'
import type { ProductMaster, ProductSku } from '../../../features/productMaster/types'
import { inputMoney, SAMPLE_PAYERS, SAMPLE_PAYER_HELP, sampleRecipientDefaults, sampleTotals, selectableSku, skuCostSnapshot, selectSampleSku, type SampleOrderDraft, type SamplePayer } from '../../../features/samples/sampleOrderModel'
import { sellerMasterService, type SellerMaster } from '../../../shared/services/sellerMasterService'
import { campaignService } from '../../../shared/services/campaignService'
import { QuickSkuRegistrationModal } from '../../master/products/QuickSkuRegistrationModal'
import { SampleOrderDialog } from './SampleOrderDialog'

const blankDraft = (): SampleOrderDraft => ({ sellerId: '', sellerName: '', campaignId: '', campaignName: '', productId: '', skuId: '', brandName: '', productName: '', optionName: '', detailOption: '',
  provision: blankProvision(), operations: blankOperations(), additionalItems: [], quantity: 1, recipient: '', phone: '', address: '', purpose: '', memo: '', deliveryMemo: '', payer: 'seller', supportType: 'full', supportAmount: null,
  costs: { sellerUnitPrice: null, companyUnitCost: null, source: 'sku', capturedAt: new Date().toISOString() } })
export const sampleMoney = (amount: number | null) => amount === null ? '확인 필요' : `${amount.toLocaleString('ko-KR', { maximumFractionDigits: 2 })}원`

export function SampleCostSummary({ draft }: { draft: SampleOrderDraft }) {
  const totals = sampleTotals(draft)
  if (draft.provision) return <div className="sample-cost-grid"><div><span>제공 방식</span><strong>{draft.provision.method}</strong></div><div><span>결제 방식</span><strong>{draft.provision.paymentMethod}</strong></div><div><span>상품 단가 · 기본 SKU</span><strong>{sampleMoney(draft.provision.unitPrice)}</strong></div><div><span>총비용 · 배송비 포함</span><strong>{['무상 제공','대여'].includes(draft.provision.method) ? '구매 정산 제외' : sampleMoney(provisionTotal(draft))}</strong></div><div><span>요청 조건</span><strong>{draft.provision.agreedTerms || '입력 조건 기준'}</strong></div></div>
  return <div className="sample-cost-grid">
    <div><span>셀러 적용 공급가 · 개당</span><strong>{sampleMoney(draft.costs.sellerUnitPrice)}</strong></div>
    <div><span>회사 실제 원가 · 개당</span><strong>{sampleMoney(draft.costs.companyUnitCost)}</strong></div>
    <div><span>회사 원가 · {draft.quantity}개</span><strong>{sampleMoney(totals.companyCost)}</strong></div>
    <div><span>셀러 차감 예정액</span><strong>{draft.payer === 'seller' ? sampleMoney(totals.sellerDeduction) : '해당 없음'}</strong></div>
    <div><span>{draft.payer === 'supplier' ? '공급사 지원액' : '차액 · 셀러 부담 시'}</span><strong>{draft.payer === 'supplier' ? sampleMoney(totals.support) : draft.payer === 'seller' ? sampleMoney(totals.difference) : '해당 없음'}</strong></div>
    {draft.payer === 'supplier' && <div><span>지원 후 회사 원가</span><strong>{sampleMoney(totals.companyBurden)}</strong></div>}
  </div>
}

export function SampleOrderForm({ initial, onClose, onSave }: { initial?: SampleOrderDraft; onClose: () => void; onSave: (draft: SampleOrderDraft) => Promise<void> }) {
  const { profile } = useCompanyAuth()
  const [draft, setDraft] = useState<SampleOrderDraft>(() => initial ? structuredClone(initial) : blankDraft())
  const [products, setProducts] = useState<ProductMaster[]>([])
  const [sellers, setSellers] = useState<SellerMaster[]>([])
  const [query, setQuery] = useState('')
  const [additionalQueries, setAdditionalQueries] = useState<string[]>([])
  const [sellerQuery, setSellerQuery] = useState('')
  const [campaignQuery, setCampaignQuery] = useState('')
  const shippingEdited = useRef(new Set<string>(initial ? ['recipient','phone','address','deliveryMemo'] : []))
  const sellerSelection = useRef(initial?.sellerId ?? '')
  const [shippingLoading,setShippingLoading] = useState(false)
  const [quickSeller, setQuickSeller] = useState(false)
  const [newSeller, setNewSeller] = useState({ name: '', instagramId: '', contact: '', managerId: profile.id })
  const [registering, setRegistering] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [quick, setQuick] = useState(false)
  const [skuNotice, setSkuNotice] = useState('')
  const campaigns = useMemo(() => campaignService.getCampaigns(), [])
  useEffect(() => {
    let active = true
    void Promise.all([productService.listProductsForImport(), sellerMasterService.loadSellers()]).then(([nextProducts, nextSellers]) => {
      if (active) { setProducts(nextProducts); setSellers(nextSellers) }
    }).catch((reason) => { if (active) setError(reason instanceof Error ? reason.message : '상품·셀러 정보를 불러오지 못했습니다. 다시 열어주세요.') })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [])
  const patch = <K extends keyof SampleOrderDraft>(key: K, value: SampleOrderDraft[K]) => setDraft((current) => ({ ...current, [key]: value }))
  const product = products.find((item) => item.id === draft.productId)
  const sku = product?.skus.find((item) => item.id === draft.skuId)
  const candidates = useMemo(() => {
    const normalized = normalizeProductIdentity(query)
    return products.filter((item) => item.skus.some((candidate) => selectableSku(item, candidate)) && (!normalized || normalizeProductIdentity(`${item.brandName} ${item.productName} ${item.skus.map((candidate) => `${candidate.optionName} ${Object.values(candidate.optionValues ?? {}).join(' ')}`).join(' ')}`).includes(normalized)))
  }, [products, query])
  const chooseSku = (nextProduct: ProductMaster, nextSku: ProductSku) => {
    setProducts((items) => [nextProduct, ...items.filter((item) => item.id !== nextProduct.id)])
    setDraft((current) => { const next = selectSampleSku(current, nextProduct, nextSku); return { ...next, provision: current.provision ? { ...current.provision, unitPrice: next.costs.companyUnitCost, method: !initial && /협의/.test(nextProduct.sampleSupportType ?? nextProduct.operatingInfo?.sampleSupportType ?? '') ? '진행 시 협의' : current.provision.method } : undefined } })
  }
  const chooseSeller = async (id: string) => {
    sellerSelection.current = id
    const cached = sellers.find(item => item.id === id)
    const apply = (seller?: SellerMaster) => setDraft(current => {
      if (sellerSelection.current !== id) return current
      const defaults = sampleRecipientDefaults(seller)
      return { ...current, targetType:'seller', targetDisplayName:seller?.name ?? '',sellerId:id,sellerName:seller?.name ?? '',
        ...Object.fromEntries(Object.entries(defaults).filter(([key])=>!shippingEdited.current.has(key))) }
    })
    apply(cached)
    if (!id) return
    setShippingLoading(true)
    try { const fresh = await sellerMasterService.loadSellerById(id); if (fresh) apply(fresh) }
    catch { if(sellerSelection.current===id) setError('셀러 배송정보를 불러오지 못했습니다. 직접 입력하거나 다시 선택해주세요.') }
    finally { if(sellerSelection.current===id) setShippingLoading(false) }
  }
  const submit = async () => { setSaving(true); setError(''); try { await onSave(draft) } catch (reason) { setError(reason instanceof Error ? reason.message : '저장하지 못했습니다. 입력값은 유지됩니다.') } finally { setSaving(false) } }
  return <SampleOrderDialog title={initial ? '샘플 요청 수정' : '새 샘플 요청'} onClose={onClose} busy={saving}>
    {quick ? <QuickSkuRegistrationModal open onClose={() => setQuick(false)} onRegistered={(p, s) => { chooseSku(p, s); setQuick(false); setSkuNotice('SKU 저장을 확인하고 자동 선택했습니다. 수량과 배송정보를 입력해주세요.') }} /> : <form onSubmit={(event) => { event.preventDefault(); void submit() }}>
      <p>요청 매니저: <strong>{profile.display_name}</strong> · 비용은 요청 시점 조건으로 저장하며 정산에는 자동 반영하지 않습니다.</p>
      {loading && <p role="status">기존 상품·셀러를 불러오는 중…</p>}
      <fieldset disabled={saving || loading}>
        <div className="sample-order-fields">
          <label>요청 대상<select value={draft.targetType ?? 'seller'} onChange={event => setDraft(current => ({ ...current, targetType: event.target.value as 'seller' | 'vendor' | 'unspecified', supplyAudience: event.target.value === 'seller' ? 'seller' : 'vendor', sellerId: '', sellerName: '', targetDisplayName: '', campaignId: '', campaignName: '' }))}><option value="seller">기존 셀러 선택</option><option value="vendor">거래처/벤더명 사용</option><option value="unspecified">셀러 미지정 · 베벤더</option></select></label>
          {draft.targetType && draft.targetType !== 'seller' && <label>요청 대상 표시명<input required={draft.targetType === 'vendor'} value={draft.targetDisplayName ?? ''} onChange={event => patch('targetDisplayName', event.target.value)} placeholder="거래처/벤더명" /></label>}
          <label>셀러 검색<input value={sellerQuery} onChange={(event) => setSellerQuery(event.target.value)} placeholder="셀러 이름" /></label>
          <label>셀러 *<select required={!draft.targetType || draft.targetType === 'seller'} value={draft.sellerId} onChange={(event) => void chooseSeller(event.target.value)}><option value="">셀러 선택</option>{sellers.filter((seller) => seller.id === draft.sellerId || `${seller.name} ${seller.instagramId ?? ''}`.toLowerCase().includes(sellerQuery.toLowerCase())).map((seller) => <option key={seller.id} value={seller.id}>{seller.name}</option>)}</select></label>
          {!sellers.some(seller => `${seller.name} ${seller.instagramId ?? ''}`.toLowerCase().includes(sellerQuery.trim().toLowerCase())) && sellerQuery.trim() && <button type="button" className="secondary-button" onClick={() => { setNewSeller(v => ({ ...v, name: sellerQuery.trim() })); setQuickSeller(true) }}>+ 신규 셀러 간편 등록</button>}
          {quickSeller && <section className="sample-span sample-order-section"><h3>신규 셀러 간편 등록</h3><div className="sample-order-fields"><label>셀러명 *<input value={newSeller.name} onChange={e => setNewSeller(v => ({ ...v, name:e.target.value }))} /></label><label>인스타그램<input value={newSeller.instagramId} onChange={e => setNewSeller(v => ({ ...v, instagramId:e.target.value }))} /></label><label>담당 매니저<select value={newSeller.managerId} onChange={e => setNewSeller(v => ({ ...v, managerId:e.target.value }))}><option value={profile.id}>{profile.display_name}</option>{appUsers.filter(u => u.id !== profile.id).map(u => <option key={u.id} value={u.id}>{u.name}</option>)}</select></label><label>연락처<input value={newSeller.contact} onChange={e => setNewSeller(v => ({ ...v, contact:e.target.value }))} /></label></div><button type="button" className="primary-button" disabled={registering || !newSeller.name.trim()} onClick={() => void (async () => { setRegistering(true); setError(''); try { const fresh = await sellerMasterService.loadSellers(); if (fresh.some(s => s.name.trim().toLowerCase() === newSeller.name.trim().toLowerCase())) throw new Error('동일 셀러명이 있습니다. 검색 후 기존 셀러를 선택해주세요.'); const saved = await sellerMasterService.saveSellerProfile({ id: crypto.randomUUID(), name: newSeller.name.trim(), instagramId:newSeller.instagramId, contact:newSeller.contact, defaultManagerId:newSeller.managerId, defaultMdId:'', active:true }); setSellers(v => [saved,...v]); setSellerQuery(saved.name); setDraft(v => ({ ...v, sellerId:saved.id, sellerName:saved.name, targetType:'seller', targetDisplayName:saved.name })); setQuickSeller(false) } catch(e) { setError(e instanceof Error ? e.message : '셀러 저장 실패') } finally { setRegistering(false) } })()}>등록 후 자동 선택</button></section>}
          <label className="sample-span">공구 검색<input value={campaignQuery} onChange={e => setCampaignQuery(e.target.value)} placeholder="셀러명·공구명·상품명" /></label>
          <div className="sample-span"><span>관련 공동구매 일정 · 선택</span><button type="button" className={`secondary-button ${!draft.campaignId ? 'sample-no-campaign-selected' : ''}`} aria-pressed={!draft.campaignId} onClick={() => setDraft(v => ({ ...v, campaignId:'',campaignName:'' }))}>일정 없이 샘플 요청</button>{!draft.campaignId && <p role="status">일정 없이 요청 선택됨 · 공구 미연결로 저장됩니다.</p>}<div className="sample-campaign-choices">{unsettledCampaigns(campaigns, settlementService.getSettlements(), draft.sellerId, draft.sellerId ? draft.sellerName : sellerQuery, campaignQuery, draft.campaignId).map(campaign => <button type="button" aria-pressed={draft.campaignId === campaign.id} className="secondary-button" key={campaign.id} disabled={draft.provision?.method === '테스트 후 진행' && draft.operations?.testStatus !== '진행 확정' && draft.campaignId !== campaign.id} onClick={() => setDraft(v => ({ ...v,campaignId:campaign.id,campaignName:campaign.campaignName }))}>{campaign.endDate.slice(0,10) < new Date().toLocaleDateString('sv-SE',{timeZone:'Asia/Seoul'}) && <mark className="sample-ended">[종료일정]</mark>} {campaign.campaignName} · {campaign.sellerName} · {campaign.productName}</button>)}</div>{draft.campaignId && <small>현재 연결: {draft.campaignName}</small>}</div>
        </div>
        <section className="sample-order-section"><h3>SKU 1 · 상품 → SKU → 세부옵션</h3><button type="button" className="secondary-button" onClick={()=>{const first=draft.additionalItems?.[0];const p=products.find(p=>p.id===first?.productId);const sku=p?.skus.find(s=>s.id===first?.skuId);if(first&&p&&sku){chooseSku(p,sku);setDraft(v=>({...v,quantity:first.quantity,additionalItems:v.additionalItems?.slice(1)}));setAdditionalQueries(v=>v.slice(1))}else {setDraft(v=>({...v,productId:'',skuId:'',productName:'',optionName:'',detailOption:''}))}}}>SKU 1 삭제</button>{skuNotice && <p role="status">{skuNotice}</p>}
          <div className="sample-search-row"><label>전체 상품·SKU 검색<input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="브랜드·상품·옵션 검색 (다른 공구 상품도 가능)" /></label><button type="button" className="secondary-button" onClick={() => setQuick(true)}>+ 빠른 SKU 등록</button></div>
          <div className="sample-order-fields">
            <label>상품 *<select required value={draft.productId} onChange={(event) => { const next = products.find((item) => item.id === event.target.value); setDraft((current) => ({ ...current, productId: next?.id ?? '', brandName: next?.brandName ?? '', productName: next?.productName ?? '', skuId: '', optionName: '', detailOption: '', costs: blankDraft().costs, provision: current.provision ? {...current.provision,unitPrice:null} : undefined })) }}><option value="">상품 선택 · {candidates.length}개</option>{products.filter((item) => item.id === draft.productId || candidates.some((candidate) => candidate.id === item.id)).map((item) => <option key={item.id} value={item.id}>[{item.brandName}] {item.productName}</option>)}</select></label>
            <label>옵션(SKU) *<select required value={draft.skuId} disabled={!product} onChange={(event) => { const next = product?.skus.find((item) => item.id === event.target.value); if (product && next) chooseSku(product, next) }}><option value="">SKU 선택</option>{product?.skus.filter((item) => selectableSku(product, item)).map((item) => <option key={item.id} value={item.id}>[{product.productName}] {item.optionName}{Object.values(item.optionValues ?? {}).length ? ` · ${Object.values(item.optionValues ?? {}).join(' / ')}` : ''}</option>)}</select></label>
            <label>세부옵션<select value={draft.detailOption} onChange={(event) => patch('detailOption', event.target.value)} disabled={!sku || !Object.keys(sku.optionValues ?? {}).length}><option value={draft.detailOption}>{draft.detailOption || '등록된 세부옵션 없음'}</option></select><small>SKU에 등록된 컬러·사이즈 구성입니다. 다른 구성은 해당 SKU를 선택해주세요.</small></label>
            <label>수량 *<input required type="number" min="1" step="1" value={draft.quantity} onChange={(event) => patch('quantity', Number(event.target.value))} /></label>
          </div>
        </section>
        <section className="sample-order-section"><h3>추가 상품/SKU</h3><button type="button" className="secondary-button" onClick={() => patch('additionalItems',[...(draft.additionalItems ?? []),{productId:'',skuId:'',productName:'',optionName:'',detailOption:'',quantity:1,unitPrice:null}])}>+ 상품/SKU 추가</button>
          {draft.additionalItems?.map((item,i) => { const itemProduct=products.find(p=>p.id===item.productId); const update=(values:Partial<typeof item>)=>patch('additionalItems',draft.additionalItems!.map((v,n)=>n===i?{...v,...values}:v)); const itemQuery=additionalQueries[i]??''; const normalized=normalizeProductIdentity(itemQuery); const matchingProducts=products.filter(p=>p.id===item.productId || (p.skus.some(s=>selectableSku(p,s)) && (!normalized || normalizeProductIdentity(`${p.brandName} ${p.productName} ${p.skus.map(s=>`${s.optionName} ${Object.values(s.optionValues??{}).join(' ')}`).join(' ')}`).includes(normalized)))); return <section className="sample-sku-row" key={i}><h4>SKU {i+2} · 상품 → SKU → 세부옵션</h4><div className="sample-search-row"><label>전체 상품·SKU 검색<input value={itemQuery} onChange={e=>setAdditionalQueries(v=>{const next=[...v];next[i]=e.target.value;return next})} placeholder="브랜드·상품·옵션 검색 (다른 공구 상품도 가능)" /></label></div><div className="sample-order-fields"><label>상품 {i+2}<select required value={item.productId} onChange={e=>{const p=products.find(p=>p.id===e.target.value);update({productId:p?.id??'',productName:p?.productName??'',skuId:'',optionName:'',detailOption:'',unitPrice:null})}}><option value="">상품 선택 · {matchingProducts.length}개</option>{matchingProducts.map(p=><option key={p.id} value={p.id}>[{p.brandName}] {p.productName}</option>)}</select></label><label>옵션(SKU) {i+2}<select required disabled={!itemProduct} value={item.skuId} onChange={e=>{const sku=itemProduct?.skus.find(s=>s.id===e.target.value);if(!sku||!itemProduct)return;update({skuId:sku.id,optionName:sku.optionName,detailOption:Object.values(sku.optionValues??{}).join(' / '),unitPrice:skuCostSnapshot(sku).companyUnitCost,supplierId:itemProduct.vendorId,supplierName:itemProduct.vendorName})}}><option value="">SKU 선택</option>{itemProduct?.skus.filter(s=>selectableSku(itemProduct,s)&&(s.id===item.skuId || (s.id!==draft.skuId&&!draft.additionalItems?.some(v=>v.skuId===s.id)))).map(s=><option key={s.id} value={s.id}>{s.optionName}</option>)}</select></label><label>세부옵션 {i+2}<input readOnly value={item.detailOption} /></label><label>수량 {i+2}<input required type="number" min="1" step="1" value={item.quantity} onChange={e=>update({quantity:Number(e.target.value)})} /></label><label>단가 {i+2}<input type="number" min="0" value={item.unitPrice??''} onChange={e=>update({unitPrice:e.target.value===''?null:Number(e.target.value)})} /></label></div><button type="button" className="secondary-button" onClick={()=>{patch('additionalItems',draft.additionalItems!.filter((_,n)=>n!==i));setAdditionalQueries(v=>v.filter((_,n)=>n!==i))}}>SKU {i+2} 삭제</button></section> })}
        </section>
        <section className="sample-order-section"><h3>수령정보</h3><details><summary>발주모아 주문자 정보 · 미입력 시 수령인 정보 사용</summary><div className="sample-order-fields"><label>주문자명<input value={draft.ordererName ?? ''} onChange={event => patch('ordererName', event.target.value)} /></label><label>주문자 연락처<input type="tel" value={draft.ordererPhone ?? ''} onChange={event => patch('ordererPhone', event.target.value)} /></label></div></details>{shippingLoading && <p role="status">셀러 배송정보 확인 중…</p>}<p>셀러 DB에 저장된 정보만 불러옵니다. 빈 정보는 입력해주세요. 수정 내용은 이번 요청에만 적용됩니다.</p>
          <div className="sample-order-fields"><label>수령인 *<input required value={draft.recipient} onChange={(event) => { shippingEdited.current.add('recipient'); patch('recipient', event.target.value) }} /></label><label>연락처 *<input required type="tel" value={draft.phone} onChange={(event) => { shippingEdited.current.add('phone'); patch('phone', event.target.value) }} /></label><label className="sample-span">주소 *<input required value={draft.address} onChange={(event) => { shippingEdited.current.add('address'); patch('address', event.target.value) }} placeholder="우편번호 · 기본주소 · 상세주소" /></label><label className="sample-span">배송메모<input value={draft.deliveryMemo} onChange={(event) => { shippingEdited.current.add('deliveryMemo'); patch('deliveryMemo', event.target.value) }} /></label></div>
        </section>
        {draft.provision ? <SampleProvisionFields draft={draft} onChange={p => patch('provision',p)} /> : <>        <section className="sample-order-section"><h3>부담주체와 비용</h3><label>부담주체<select value={draft.payer} onChange={(event) => patch('payer', event.target.value as SamplePayer)}>{Object.entries(SAMPLE_PAYERS).map(([value, text]) => <option key={value} value={value}>{text}</option>)}</select></label><p>{SAMPLE_PAYER_HELP[draft.payer]}</p>
          {draft.payer === 'supplier' && <div className="sample-order-fields"><label>지원 방식<select value={draft.supportType} onChange={(event) => patch('supportType', event.target.value as 'full' | 'partial')}><option value="full">전액 지원</option><option value="partial">일부 지원</option></select></label>{draft.supportType === 'partial' && <label>공급사 지원 총액<input type="number" min="0" value={draft.supportAmount ?? ''} onChange={(event) => patch('supportAmount', inputMoney(event.target.value))} placeholder="확인 필요" /></label>}</div>}
          <SampleCostSummary draft={draft} />
          <details><summary>금액 확인·수정 (상품 DB는 변경하지 않음)</summary><div className="sample-order-fields">{(['sellerUnitPrice', 'companyUnitCost'] as const).map((key) => <label key={key}>{key === 'sellerUnitPrice' ? '셀러 적용 공급가 · 개당' : '회사 실제 원가 · 개당'}<input type="number" min="0" step="any" placeholder="확인 필요" value={draft.costs[key] ?? ''} onChange={(event) => patch('costs', { ...draft.costs, [key]: inputMoney(event.target.value), source: 'manual', capturedAt: new Date().toISOString() })} /></label>)}</div></details>
        </section>
</>}
        <div className="sample-order-fields"><SampleChoiceField label="샘플 목적 *" required value={draft.purpose} options={SAMPLE_PURPOSES} onChange={v=>patch('purpose',v)} /><label>내부 메모<input value={draft.memo} onChange={(event) => patch('memo', event.target.value)} /></label></div>
      </fieldset>
      {error && <p role="alert" className="sample-error">{error}</p>}
      <footer><button type="button" disabled={saving} className="secondary-button" onClick={onClose}>취소</button><button type="submit" disabled={saving || loading} className="primary-button">{saving ? '저장 중…' : '요청 저장'}</button></footer>
    </form>}
  </SampleOrderDialog>
}
