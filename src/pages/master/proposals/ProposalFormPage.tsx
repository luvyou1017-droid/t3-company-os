import { useEffect, useMemo, useRef, useState } from 'react'
import { appUsers } from '../../../shared/data/users'
import { formatDateWithWeekday } from '../../../shared/services/campaignCreationService'
import type { ProductMaster } from '../../../features/productMaster/types'
import { createProposalProductSnapshot, proposalService, toSharedProposalView } from '../../../features/proposalMaster/services/proposalService'
import { ProposalPreviewDocument } from '../../../features/proposalMaster/components/ProposalPreviewDocument'
import type { ProposalMasterInput, ProposalProductItem, ProposalSaveState, ProposalStatus } from '../../../features/proposalMaster/types'
import type { ReturnTypeOfProposalPermission } from './types'

const today = () => new Date().toISOString().slice(0, 10)
const money = (value: number) => `${value.toLocaleString('ko-KR')}원`
const statusLabels: Record<ProposalStatus, string> = { draft: '작성 중', reviewing: '검수 중', shareable: '공유 가능', archived: '보관' }

function createInitial(): ProposalMasterInput {
  return {
    id: crypto.randomUUID(), proposalName: '', title: '', subtitle: '', category: '', vendorId: '', vendorName: '',
    brandIds: [], brandNames: [], representativeImageUrl: '', referenceDate: today(), status: 'draft',
    authorName: '유시철', mdName: '유시철', managerName: '김병희', managerContact: '',
    spreadsheetUrl: '', previewImageUrls: [], sharedImageUrls: [], internalMemo: '', sellingPoints: [],
    shippingGuide: { courierName: '', shippingFee: 0, freeShippingThreshold: undefined, jejuExtraFee: 0, islandExtraFee: 0, bundleShippingAvailable: false, shippingSchedule: '', orderDeadlineTime: '', sampleAvailable: false, sampleConditions: '', exchangeReturnNotes: '', operationNotes: '' },
    productItems: [], campaignCreationReady: true, testData: false,
  }
}

export function ProposalFormPage({ proposalId, permission, onBack, onPreview }: { proposalId?: string; permission: ReturnTypeOfProposalPermission; onBack: () => void; onPreview: (id: string) => void }) {
  const [form, setForm] = useState<ProposalMasterInput>(() => createInitial())
  const [products, setProducts] = useState<ProductMaster[]>([])
  const [productQuery, setProductQuery] = useState('')
  const [vendorFilter, setVendorFilter] = useState('')
  const [brandFilter, setBrandFilter] = useState('')
  const [skuSelections, setSkuSelections] = useState<Record<string, string[]>>({})
  const [saveState, setSaveState] = useState<ProposalSaveState>('idle')
  const [lastSavedAt, setLastSavedAt] = useState<string>()
  const [dirty, setDirty] = useState(false)
  const [mobileTab, setMobileTab] = useState<'edit' | 'preview'>('edit')
  const hydrated = useRef(false)

  useEffect(() => {
    void proposalService.listProductMasters().then(setProducts)
    if (!proposalId) { hydrated.current = true; return }
    void proposalService.getById(proposalId).then((proposal) => {
      if (proposal) setForm(proposal)
      hydrated.current = true
    })
  }, [proposalId])
  useEffect(() => {
    const guard = (event: BeforeUnloadEvent) => { if (dirty) { event.preventDefault(); event.returnValue = '' } }
    window.addEventListener('beforeunload', guard)
    return () => window.removeEventListener('beforeunload', guard)
  }, [dirty])
  const patch = <K extends keyof ProposalMasterInput>(key: K, value: ProposalMasterInput[K]) => {
    setForm((current) => ({ ...current, [key]: value })); setDirty(true)
  }
  const patchGuide = (key: keyof ProposalMasterInput['shippingGuide'], value: string | number | boolean | undefined) => patch('shippingGuide', { ...form.shippingGuide, [key]: value })
  const save = async (automatic = false) => {
    if (!permission.canEdit && !permission.canCreate) return undefined
    if (!automatic && (!form.proposalName.trim() || !form.title.trim())) {
      window.alert('제안서명과 제안서 제목을 입력해주세요.'); return undefined
    }
    setSaveState('saving')
    try {
      const saved = await proposalService.save(form)
      setForm(saved); setDirty(false); setSaveState('saved'); setLastSavedAt(saved.updatedAt)
      return saved
    } catch { setSaveState('failed'); return undefined }
  }
  useEffect(() => {
    if (!dirty || !hydrated.current) return
    const timer = window.setTimeout(() => void save(true), 1200)
    return () => window.clearTimeout(timer)
  // save is intentionally driven by the latest form snapshot.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form, dirty])
  const availableProducts = useMemo(() => products.filter((product) => product.active && (!vendorFilter || product.vendorName === vendorFilter) && (!brandFilter || product.brandName === brandFilter) && (!productQuery || `${product.brandName} ${product.productName} ${product.skus.map((sku) => sku.optionName).join(' ')}`.toLowerCase().includes(productQuery.toLowerCase()))), [products, vendorFilter, brandFilter, productQuery])
  const vendors = [...new Set(products.map((product) => product.vendorName).filter(Boolean))] as string[]
  const brands = [...new Set(products.filter((product) => !vendorFilter || product.vendorName === vendorFilter).map((product) => product.brandName))]
  const addProduct = (product: ProductMaster) => {
    if (form.productItems.some((item) => item.productId === product.id)) return
    const selected = skuSelections[product.id] ?? product.skus.filter((sku) => sku.active).map((sku) => sku.id)
    const item = { ...createProposalProductSnapshot(product, selected), displayOrder: form.productItems.length, representative: form.productItems.length === 0 }
    const nextItems = [...form.productItems, item]
    const brandNames = [...new Set(nextItems.map((candidate) => candidate.brandName))]
    const proposalName = form.proposalName || `와이즈 제안서 · ${form.category || product.category || '카테고리'} · ${product.vendorName || '공급처'} · ${brandNames[0]} · ${form.referenceDate}`
    setForm((current) => ({ ...current, productItems: nextItems, brandIds: [...new Set(nextItems.map((candidate) => candidate.brandId))], brandNames, vendorId: current.vendorId || product.vendorId, vendorName: current.vendorName || product.vendorName, representativeImageUrl: current.representativeImageUrl || item.imageUrl, proposalName }))
    setDirty(true)
  }
  const updateItem = (id: string, values: Partial<ProposalProductItem>) => patch('productItems', form.productItems.map((item) => item.id === id ? { ...item, ...values } : item))
  const move = (id: string, direction: -1 | 1) => {
    const ordered = [...form.productItems].sort((a,b) => a.displayOrder - b.displayOrder)
    const index = ordered.findIndex((item) => item.id === id)
    const target = index + direction
    if (target < 0 || target >= ordered.length) return
    ;[ordered[index], ordered[target]] = [ordered[target], ordered[index]]
    patch('productItems', ordered.map((item, displayOrder) => ({ ...item, displayOrder })))
  }
  const duplicateItem = (item: ProposalProductItem) => patch('productItems', [...form.productItems, { ...structuredClone(item), id: crypto.randomUUID(), displayOrder: form.productItems.length, representative: false }])
  const removeItem = (id: string) => patch('productItems', form.productItems.filter((item) => item.id !== id).map((item, displayOrder) => ({ ...item, displayOrder, representative: item.representative || (displayOrder === 0 && !form.productItems.some((candidate) => candidate.id !== id && candidate.representative)) })))
  const sharedView = toSharedProposalView({ ...form, createdAt: lastSavedAt ?? new Date().toISOString(), updatedAt: lastSavedAt ?? new Date().toISOString(), version: 1 })
  const readOnly = proposalId ? !permission.canEdit : !permission.canCreate

  return <section className="proposal-editor-page">
    <div className="master-page__heading proposal-editor-heading"><div><p className="page-eyebrow">WEB PROPOSAL EDITOR</p><h1>{proposalId ? '제안서 상세·수정' : '신규 제안서 만들기'}</h1><p>상품 마스터 snapshot을 편집하고 셀러 공유 화면을 실시간으로 확인합니다.</p></div><div className="button-row"><button className="secondary-button" onClick={onBack}>목록</button><button className="secondary-button" disabled title="Campaign 연결 UI 준비 중" type="button">제안서에서 공구 일정 만들기</button><button className="secondary-button" onClick={() => void save().then((saved) => { if (saved) onPreview(saved.id) })}>공유용 미리보기</button>{!readOnly && <button className="primary-button" onClick={() => void save()}>제안서 저장</button>}</div></div>
    <div className="proposal-save-strip"><span className={`status-badge ${saveState === 'failed' ? 'error' : saveState === 'saving' ? 'progress' : 'done'}`}>{saveState === 'saving' ? '저장 중' : saveState === 'failed' ? '저장 실패' : saveState === 'saved' ? '저장 완료' : '자동 저장 준비'}</span><span>{lastSavedAt ? `마지막 저장 ${new Date(lastSavedAt).toLocaleTimeString('ko-KR')}` : '아직 저장되지 않았습니다.'}</span></div>
    <div className="proposal-mobile-tabs"><button className={mobileTab === 'edit' ? 'is-active' : ''} onClick={() => setMobileTab('edit')}>정보·상품 편집</button><button className={mobileTab === 'preview' ? 'is-active' : ''} onClick={() => setMobileTab('preview')}>실시간 미리보기</button></div>
    <div className={`proposal-editor-layout tab-${mobileTab}`}>
      <fieldset className="proposal-editor-fields" disabled={readOnly}>
        <EditorSection title="1. 제안서 기본정보"><div className="proposal-field-grid">
          <Field label="제안서명 *" span><input value={form.proposalName} onChange={(e) => patch('proposalName', e.target.value)} /></Field>
          <Field label="제안서 제목 *"><input value={form.title} onChange={(e) => patch('title', e.target.value)} /></Field><Field label="부제목"><input value={form.subtitle} onChange={(e) => patch('subtitle', e.target.value)} /></Field>
          <Field label="카테고리"><input value={form.category} onChange={(e) => patch('category', e.target.value)} /></Field><Field label="공급처"><input value={form.vendorName} onChange={(e) => patch('vendorName', e.target.value)} /></Field>
          <Field label="대표 이미지 URL" span><input type="url" value={form.representativeImageUrl} onChange={(e) => patch('representativeImageUrl', e.target.value)} /></Field>
          <Field label="제안 기준일"><input type="date" value={form.referenceDate} onChange={(e) => patch('referenceDate', e.target.value)} /><small>{formatDateWithWeekday(form.referenceDate)}</small></Field>
          <Field label="상태"><select value={form.status} onChange={(e) => patch('status', e.target.value as ProposalStatus)}>{Object.entries(statusLabels).map(([value,label]) => <option value={value} key={value}>{label}</option>)}</select></Field>
          <Field label="작성자"><select value={form.authorName} onChange={(e) => patch('authorName', e.target.value)}>{appUsers.map((user) => <option key={user.id}>{user.name}</option>)}</select></Field>
        </div></EditorSection>
        <EditorSection title="2. 브랜드와 상품 선택"><div className="proposal-product-search"><select value={vendorFilter} onChange={(e) => { setVendorFilter(e.target.value); setBrandFilter('') }}><option value="">전체 공급처</option>{vendors.map((vendor) => <option key={vendor}>{vendor}</option>)}</select><select value={brandFilter} onChange={(e) => setBrandFilter(e.target.value)}><option value="">전체 브랜드</option>{brands.map((brand) => <option key={brand}>{brand}</option>)}</select><input placeholder="제품 또는 SKU 옵션 검색" value={productQuery} onChange={(e) => setProductQuery(e.target.value)} /></div><div className="proposal-product-picker">{availableProducts.map((product) => <article key={product.id}><div><strong>{product.brandName}</strong><span>{product.productName}</span></div><div className="proposal-sku-checks">{product.skus.filter((sku) => sku.active).map((sku) => <label key={sku.id}><input type="checkbox" checked={(skuSelections[product.id] ?? product.skus.filter((item) => item.active).map((item) => item.id)).includes(sku.id)} onChange={(e) => setSkuSelections((current) => ({ ...current, [product.id]: e.target.checked ? [...(current[product.id] ?? []), sku.id] : (current[product.id] ?? product.skus.map((item) => item.id)).filter((id) => id !== sku.id) }))} />{sku.optionName}</label>)}</div><button type="button" disabled={form.productItems.some((item) => item.productId === product.id)} onClick={() => addProduct(product)}>{form.productItems.some((item) => item.productId === product.id) ? '추가됨' : '제품 추가'}</button></article>)}</div></EditorSection>
        <EditorSection title="3. 상품별 공개 정보"><div className="proposal-selected-products">{[...form.productItems].sort((a,b) => a.displayOrder - b.displayOrder).map((item, index) => <article key={item.id}>
          <header><label><input type="radio" name="representative" checked={item.representative} onChange={() => patch('productItems', form.productItems.map((candidate) => ({ ...candidate, representative: candidate.id === item.id })))} /> 대표 제품</label><strong>{item.brandName} · {item.productName}</strong><span>snapshot v{item.sourceVersion}</span></header>
          <div className="proposal-field-grid"><Field label="공개 상품명"><input value={item.displayProductName ?? item.productName} onChange={(e) => updateItem(item.id, { displayProductName: e.target.value })} /></Field><Field label="구성"><input value={item.compositionText} onChange={(e) => updateItem(item.id, { compositionText: e.target.value })} /></Field><Field label="정상가"><input type="number" value={item.regularPrice} onChange={(e) => updateItem(item.id, { regularPrice: Number(e.target.value), priceOverridden: true, discountRate: item.regularPrice ? Math.round((1 - item.groupBuyPrice / Number(e.target.value)) * 100) : 0 })} /></Field><Field label="공구가"><input type="number" value={item.groupBuyPrice} onChange={(e) => updateItem(item.id, { groupBuyPrice: Number(e.target.value), priceOverridden: true, discountRate: item.regularPrice ? Math.round((1 - Number(e.target.value) / item.regularPrice) * 100) : 0 })} /></Field><Field label="셀러 수수료"><input type="number" value={item.sellerCommissionRate ?? ''} onChange={(e) => updateItem(item.id, { sellerCommissionRate: Number(e.target.value), commissionOverridden: true })} /></Field><Field label="배송 안내"><input value={item.shippingText} onChange={(e) => updateItem(item.id, { shippingText: e.target.value })} /></Field><Field label="판매 포인트 (줄바꿈)" span><textarea value={item.keyPoints.join('\n')} onChange={(e) => updateItem(item.id, { keyPoints: e.target.value.split('\n').filter(Boolean) })} />{item.keyPoints.some((point) => point.length > 45) && <small className="field-warning">45자가 넘는 문장은 공유 화면에서 읽기 어려울 수 있습니다.</small>}</Field></div>
          <div className="proposal-internal-terms"><span>내부 snapshot</span><strong>공급가 {money(item.internalSnapshot.supplyPrice)}</strong><strong>총 수수료 {item.internalSnapshot.totalCommissionRate}%</strong><strong>회사 수수료 {item.internalSnapshot.companyCommissionRate}%</strong><small>공유 미리보기에는 포함되지 않습니다.</small></div>
          <footer><label><input type="checkbox" checked={item.visibleInSharedView} onChange={(e) => updateItem(item.id, { visibleInSharedView: e.target.checked })} /> 공유 화면에 표시</label><div><button type="button" disabled={index === 0} onClick={() => move(item.id, -1)}>위로</button><button type="button" disabled={index === form.productItems.length - 1} onClick={() => move(item.id, 1)}>아래로</button><button type="button" onClick={() => duplicateItem(item)}>복제</button><button type="button" className="danger-text" onClick={() => removeItem(item.id)}>삭제</button></div></footer>
        </article>)}</div></EditorSection>
        <EditorSection title="4. 공통 배송·샘플 안내"><div className="proposal-field-grid">{([['courierName','택배사','text'],['shippingFee','기본 배송비','number'],['freeShippingThreshold','무료배송 기준','number'],['jejuExtraFee','제주 추가 배송비','number'],['islandExtraFee','도서산간 추가 배송비','number'],['shippingSchedule','출고 일정','text'],['orderDeadlineTime','발주 마감 시간','time']] as const).map(([key,label,type]) => <Field label={label} key={key}><input type={type} value={form.shippingGuide[key] ?? ''} onChange={(e) => patchGuide(key, type === 'number' ? Number(e.target.value) : e.target.value)} /></Field>)}<Field label="합배송"><select value={form.shippingGuide.bundleShippingAvailable ? 'yes' : 'no'} onChange={(e) => patchGuide('bundleShippingAvailable', e.target.value === 'yes')}><option value="yes">가능</option><option value="no">불가</option></select></Field><Field label="샘플 가능"><select value={form.shippingGuide.sampleAvailable ? 'yes' : 'no'} onChange={(e) => patchGuide('sampleAvailable', e.target.value === 'yes')}><option value="yes">가능</option><option value="no">협의/불가</option></select></Field><Field label="샘플 제공 조건" span><input value={form.shippingGuide.sampleConditions} onChange={(e) => patchGuide('sampleConditions', e.target.value)} /></Field><Field label="교환·반품 참고" span><textarea value={form.shippingGuide.exchangeReturnNotes} onChange={(e) => patchGuide('exchangeReturnNotes', e.target.value)} /></Field><Field label="운영 참고" span><textarea value={form.shippingGuide.operationNotes} onChange={(e) => patchGuide('operationNotes', e.target.value)} /></Field></div></EditorSection>
        <EditorSection title="5. 판매 포인트"><Field label="제안서 전체 판매 포인트 (줄바꿈)"><textarea value={form.sellingPoints.join('\n')} onChange={(e) => patch('sellingPoints', e.target.value.split('\n').filter(Boolean))} />{form.sellingPoints.some((point) => point.length > 45) && <small className="field-warning">45자가 넘는 문장은 줄여주세요.</small>}</Field></EditorSection>
        <EditorSection title="6. 담당자와 원본 링크"><div className="proposal-field-grid"><Field label="담당 MD"><input value={form.mdName} onChange={(e) => patch('mdName', e.target.value)} /></Field><Field label="담당 매니저"><input value={form.managerName} onChange={(e) => patch('managerName', e.target.value)} /></Field><Field label="담당자 연락 안내"><input value={form.managerContact} onChange={(e) => patch('managerContact', e.target.value)} /></Field><Field label="스프레드시트 원본 URL"><input type="url" value={form.spreadsheetUrl} onChange={(e) => patch('spreadsheetUrl', e.target.value)} />{form.spreadsheetUrl && <a className="proposal-source-link" href={form.spreadsheetUrl} target="_blank" rel="noreferrer">스프레드시트 원본 열기 ↗</a>}</Field><Field label="기존 캡처 이미지 URL (줄바꿈)" span><textarea value={form.previewImageUrls.join('\n')} onChange={(e) => patch('previewImageUrls', e.target.value.split('\n').filter(Boolean))} /></Field></div>{form.previewImageUrls.length > 0 && <div className="proposal-existing-captures">{form.previewImageUrls.map((url, index) => <a href={url} target="_blank" rel="noreferrer" key={`${url}-${index}`}><img src={url} alt={`기존 제안서 캡처 ${index + 1}`} /><span>캡처 이미지 {index + 1} 보기</span></a>)}</div>}</EditorSection>
        <EditorSection title="7. 내부 참고정보"><Field label="내부 메모"><textarea value={form.internalMemo} onChange={(e) => patch('internalMemo', e.target.value)} /><small>공유용 미리보기에는 표시되지 않습니다.</small></Field></EditorSection>
        <EditorSection title="8. 최종 미리보기"><p>오른쪽 실시간 미리보기 또는 상단 “공유용 미리보기”에서 페이지 구성을 확인해주세요.</p></EditorSection>
      </fieldset>
      <aside className="proposal-live-preview"><div className="proposal-live-preview__bar"><strong>실시간 셀러 공유 미리보기</strong><span>내부 정보 제외 · 허용 목록 기반</span></div><ProposalPreviewDocument proposal={sharedView} /></aside>
    </div>
  </section>
}

function EditorSection({ title, children }: { title: string; children: React.ReactNode }) {
  return <section className="proposal-editor-section"><h2>{title}</h2>{children}</section>
}
function Field({ label, children, span = false }: { label: string; children: React.ReactNode; span?: boolean }) {
  return <label className={span ? 'proposal-field span-two' : 'proposal-field'}><span>{label}</span>{children}</label>
}
