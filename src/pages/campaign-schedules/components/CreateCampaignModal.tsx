import { useMemo, useState } from 'react'
import { appUsers, DEFAULT_MD_USER_ID } from '../../../shared/data/users'
import { campaignService, type CampaignCreateInput } from '../../../shared/services/campaignService'
import { campaignProductCatalogService } from '../../../shared/services/campaignProductCatalogService'
import {
  calculateEventAmounts, calculateSettlementDueDate, captureProposalSnapshots, generateCampaignName,
  mockAiCampaignDraftService, mockNotionCampaignImportProvider, summarizeEvents,
} from '../../../shared/services/campaignCreationService'
import { STORAGE_KEYS, storageService } from '../../../shared/services/storageService'
import type { Campaign } from '../../../shared/types/campaign'
import type { AiCampaignDraft, CampaignCreationBusinessType, CampaignEvent, CampaignProductSelection } from '../../../shared/types/campaignCreation'

type Props = { onClose: () => void; onCreated: (campaign: Campaign) => void }
type Step = 1 | 2 | 3 | 4 | 5 | 6
type Draft = {
  sellerName: string; businessType: CampaignCreationBusinessType; brandId: string
  products: CampaignProductSelection[]; salesChannelType: NonNullable<Campaign['salesChannelType']>
  startDate: string; endDate: string; settlementDueDate: string; settlementDueDateOverridden: boolean
  managerId: string; mdId: string; memo: string; events: CampaignEvent[]
  campaignName: string; nameOverridden: boolean; notionImportMetadata?: Campaign['notionImportMetadata']; aiDraftMetadata?: Campaign['aiDraftMetadata']
}

const steps = ['기본 정보', '상품 및 제안 조건', '판매 링크', '이벤트', '일정 및 담당자', '최종 확인']
const managers = appUsers.filter((user) => ['대표', '팀장', '매니저'].includes(user.role))
const mds = appUsers.filter((user) => user.role === 'MD')
const money = (value: number) => `${Math.round(value).toLocaleString('ko-KR')}원`
const initial: Draft = { sellerName: '', businessType: 'general_business', brandId: '', products: [], salesChannelType: 'supplier_link', startDate: '', endDate: '', settlementDueDate: '', settlementDueDateOverridden: false, managerId: '', mdId: DEFAULT_MD_USER_ID, memo: '', events: [], campaignName: '', nameOverridden: false }

function newEvent(): CampaignEvent {
  return { id: `event-${crypto.randomUUID()}`, payer: 'vendor', eventType: 'first_come', rewardUnitPrice: 0, plannedQuantity: 0, estimatedTotalAmount: 0 }
}

export function CreateCampaignModal({ onClose, onCreated }: Props) {
  const [step, setStep] = useState<Step>(1)
  const [form, setForm] = useState<Draft>(() => {
    const saved = storageService.getItem<Partial<Draft> | null>(STORAGE_KEYS.campaignCreateDraft, null)
    return saved ? { ...initial, ...saved, products: saved.products ?? [], events: saved.events ?? [] } : initial
  })
  const [brandQuery, setBrandQuery] = useState('')
  const [productQuery, setProductQuery] = useState('')
  const [notice, setNotice] = useState('')
  const [proposalOpen, setProposalOpen] = useState(false)
  const [helper, setHelper] = useState<'notion' | 'ai' | null>(null)
  const [helperInput, setHelperInput] = useState('')
  const [helperPreview, setHelperPreview] = useState<AiCampaignDraft | null>(null)

  const brands = campaignProductCatalogService.searchBrands(brandQuery)
  const selectedBrand = campaignProductCatalogService.listBrands().find((brand) => brand.id === form.brandId)
  const availableProducts = campaignProductCatalogService.listProductsByBrand(form.brandId, productQuery)
  const snapshots = useMemo(() => {
    try { return captureProposalSnapshots(form.products) } catch { return [] }
  }, [form.products])
  const policyMissing = form.products.some((product) => !campaignProductCatalogService.hasCompletePolicy(product.productId))
  const eventSummary = summarizeEvents(form.events)
  const automaticName = generateCampaignName({ sellerName: form.sellerName, selectedProducts: form.products })
  const campaignName = form.nameOverridden ? form.campaignName : automaticName
  const missing = [
    !form.sellerName && '셀러', !form.brandId && '브랜드', !form.products.length && '상품',
    !form.startDate && '시작일', !form.endDate && '종료일', !form.managerId && '담당 매니저',
    policyMissing && '상품 수수료 정책',
  ].filter(Boolean) as string[]

  const updateProducts = (next: CampaignProductSelection[]) => {
    if (form.nameOverridden && form.products.length && !window.confirm('상품 선택이 변경됩니다. 공동구매명을 자동 이름으로 다시 바꿀까요?')) {
      setForm((current) => ({ ...current, products: next }))
    } else setForm((current) => ({ ...current, products: next, nameOverridden: false, campaignName: '' }))
  }
  const selectProduct = (productId: string) => {
    const product = campaignProductCatalogService.getProduct(productId)
    if (!product || form.products.some((item) => item.productId === productId)) return
    updateProducts([...form.products, { id: `selection-${crypto.randomUUID()}`, brandId: product.brandId, brandName: product.brandName, productId: product.id, productName: product.productName, displayOrder: form.products.length }])
  }
  const move = (index: number, direction: -1 | 1) => {
    const target = index + direction
    if (target < 0 || target >= form.products.length) return
    const next = [...form.products]; [next[index], next[target]] = [next[target], next[index]]
    updateProducts(next.map((item, displayOrder) => ({ ...item, displayOrder })))
  }
  const updateEndDate = (endDate: string) => {
    const automatic = calculateSettlementDueDate(endDate)
    if (form.settlementDueDateOverridden && form.settlementDueDate && !window.confirm(`정산 예정일을 자동 날짜(${automatic})로 변경할까요?`)) setForm((current) => ({ ...current, endDate }))
    else setForm((current) => ({ ...current, endDate, settlementDueDate: automatic, settlementDueDateOverridden: false }))
  }
  const patchEvent = (id: string, patch: Partial<CampaignEvent>) => setForm((current) => ({ ...current, events: current.events.map((event) => event.id === id ? calculateEventAmounts({ ...event, ...patch }) : event) }))
  const applyHelper = () => {
    if (!helperPreview) return
    const brand = campaignProductCatalogService.listBrands().find((item) => item.name === helperPreview.brandName)
    const products = brand ? campaignProductCatalogService.listProductsByBrand(brand.id).filter((item) => helperPreview.productNames.includes(item.productName)).map((item, displayOrder) => ({ id: `selection-${crypto.randomUUID()}`, brandId: item.brandId, brandName: item.brandName, productId: item.id, productName: item.productName, displayOrder })) : []
    setForm((current) => ({
      ...current, sellerName: helperPreview.sellerName ?? current.sellerName, brandId: brand?.id ?? current.brandId,
      products: products.length ? products : current.products, startDate: helperPreview.startDate ?? current.startDate,
      endDate: helperPreview.endDate ?? current.endDate, settlementDueDate: helperPreview.settlementDueDate ?? current.settlementDueDate,
      salesChannelType: helperPreview.salesChannelType ?? current.salesChannelType,
      events: helperPreview.events.length ? helperPreview.events.map((event) => calculateEventAmounts({ ...newEvent(), ...event })) : current.events,
      notionImportMetadata: helper === 'notion' ? { provider: 'mock-notion', sourceId: helperInput, importedAt: new Date().toISOString() } : current.notionImportMetadata,
      aiDraftMetadata: helper === 'ai' ? { provider: 'mock', prompt: helperInput, confidence: helperPreview.confidence, appliedAt: new Date().toISOString() } : current.aiDraftMetadata,
    }))
    setHelper(null); setHelperPreview(null)
  }
  const submit = () => {
    if (missing.length) { setNotice(`누락된 필수값: ${missing.join(', ')}`); setStep(6); return }
    const first = form.products[0]
    const proposal = snapshots[0]
    const input: CampaignCreateInput = {
      campaignName, sellerName: form.sellerName, brandName: first.brandName, productName: first.productName,
      managerId: form.managerId, mdId: form.mdId, startDate: form.startDate, endDate: form.endDate,
      linkOwner: form.salesChannelType === 'seller_checkout' ? 'seller' : form.salesChannelType === 'supplier_link' ? 'brand' : 'company',
      businessType: form.businessType, totalCommissionRate: proposal.totalCommissionRate,
      sellerCommissionRate: proposal.effectiveSellerCommissionRate, settlementDueDate: form.settlementDueDate,
      landingPageType: form.salesChannelType, salesChannelType: form.salesChannelType, memo: form.memo,
      campaignProducts: form.products, proposalSnapshots: snapshots, campaignEvents: form.events,
      settlementDueDateOverridden: form.settlementDueDateOverridden, nameOverridden: form.nameOverridden,
      notionImportMetadata: form.notionImportMetadata, aiDraftMetadata: form.aiDraftMetadata,
    }
    const result = campaignService.createCampaign(input)
    if (!result.campaign) { setNotice(Object.values(result.errors).join(' · ')); return }
    onCreated(result.campaign)
  }

  return <div className="campaign-create-backdrop"><section aria-modal="true" className="campaign-create-modal campaign-create-v2" role="dialog">
    <header className="campaign-create-modal__header"><div><p className="page-eyebrow">Campaign Creation V2</p><h2>새 공구 일정 등록</h2><p>상품 정책을 snapshot으로 저장하고 Campaign 생성 후 정산을 진행합니다.</p></div><button aria-label="닫기" className="icon-button" onClick={onClose}>×</button></header>
    <div className="campaign-create-tools"><button className="secondary-button" onClick={() => { setHelper('notion'); setHelperPreview(null) }}>Notion에서 가져오기</button><button className="secondary-button" onClick={() => { setHelper('ai'); setHelperPreview(null) }}>AI로 일정 초안 만들기</button></div>
    <nav className="campaign-create-steps">{steps.map((label, index) => <button className={step === index + 1 ? 'is-active' : step > index + 1 ? 'is-complete' : ''} key={label} onClick={() => setStep((index + 1) as Step)}><span>{step > index + 1 ? '✓' : index + 1}</span>{label}</button>)}</nav>
    {notice && <p className="campaign-v2-notice">{notice}</p>}
    <div className="campaign-create-form">
      {step === 1 && <section className="campaign-create-section"><h3>1. 기본 정보</h3><div className="campaign-create-grid">
        <label><span>셀러 *</span><input value={form.sellerName} onChange={(e) => setForm({ ...form, sellerName: e.target.value })} /></label>
        <label><span>사업자 유형 *</span><select value={form.businessType} onChange={(e) => setForm({ ...form, businessType: e.target.value as CampaignCreationBusinessType })}><option value="general_business">법인/개인사업자</option><option value="simplified_business">간이사업자</option><option value="freelancer">프리랜서</option></select></label>
        <label className="span-2"><span>공동구매명 · 자동 생성</span><input readOnly={!form.nameOverridden} value={campaignName} onChange={(e) => setForm({ ...form, campaignName: e.target.value })} /><small>{form.nameOverridden ? '직접 수정 중' : '셀러와 선택 상품으로 자동 생성됩니다.'}</small></label>
        <label className="checkbox-label"><input checked={form.nameOverridden} type="checkbox" onChange={(e) => setForm({ ...form, nameOverridden: e.target.checked, campaignName: e.target.checked ? automaticName : '' })} /> 이름 직접 수정</label>
      </div></section>}
      {step === 2 && <section className="campaign-create-section"><h3>2. 상품 및 제안 조건</h3><div className="campaign-create-grid">
        <label><span>브랜드 검색 *</span><input placeholder="브랜드명 검색" value={brandQuery} onChange={(e) => setBrandQuery(e.target.value)} /><select size={Math.min(4, brands.length || 1)} value={form.brandId} onChange={(e) => { campaignProductCatalogService.rememberBrand(e.target.value); setForm({ ...form, brandId: e.target.value }); setProductQuery('') }}>{brands.map((brand) => <option key={brand.id} value={brand.id}>{brand.name}</option>)}</select>{!brands.length && <small>검색 결과가 없습니다. 새 브랜드 등록 화면은 준비 중입니다.</small>}<small>최근 선택: {campaignProductCatalogService.getRecentBrands().map((brand) => brand.name).join(', ') || selectedBrand?.name || '없음'}</small></label>
        <label><span>상품 검색·다중 선택 *</span><input disabled={!form.brandId} placeholder="상품명 검색" value={productQuery} onChange={(e) => setProductQuery(e.target.value)} /><select disabled={!form.brandId} onChange={(e) => selectProduct(e.target.value)} value=""><option value="">상품 선택</option>{availableProducts.map((product) => <option key={product.id} value={product.id}>{product.productName}</option>)}</select></label>
      </div>
      <div className="selected-product-list">{form.products.map((product, index) => <article key={product.id}><div><span>{index + 1}</span><strong>{product.brandName} · {product.productName}</strong></div><div className="button-row"><button className="text-button" disabled={index === 0} onClick={() => move(index, -1)}>↑</button><button className="text-button" disabled={index === form.products.length - 1} onClick={() => move(index, 1)}>↓</button><button className="text-button danger-text" onClick={() => updateProducts(form.products.filter((item) => item.id !== product.id).map((item, displayOrder) => ({ ...item, displayOrder })))}>삭제</button></div></article>)}</div>
      {policyMissing && <p className="campaign-policy-warning">선택한 상품에 수수료 정책이 등록되지 않았습니다. 상품 정보를 먼저 완성해주세요.</p>}
      <button className="secondary-button" disabled={!snapshots.length} onClick={() => setProposalOpen(!proposalOpen)}>제안서 미리보기</button>
      {proposalOpen && <ProposalCards form={form} snapshots={snapshots} />}
      </section>}
      {step === 3 && <section className="campaign-create-section"><h3>3. 판매 링크</h3><label><span>판매 링크 유형 *</span><select value={form.salesChannelType} onChange={(e) => setForm({ ...form, salesChannelType: e.target.value as Draft['salesChannelType'] })}><option value="supplier_link">공급사 링크</option><option value="wise_shop_link">와이즈샵 링크</option><option value="seller_checkout">셀러 결제창</option></select></label><p className="muted-text">기존 링크주체와 랜딩페이지 유형을 하나의 값으로 저장합니다.</p></section>}
      {step === 4 && <section className="campaign-create-section"><div className="section-heading"><div><h3>4. 이벤트</h3><p>부담 주체별 예상 금액을 분리해 관리합니다.</p></div><button className="secondary-button" onClick={() => setForm({ ...form, events: [...form.events, newEvent()] })}>이벤트 추가</button></div>
        <div className="event-summary-grid"><Summary label="전체 이벤트" value={`${form.events.length}개`} /><Summary label="벤더 부담" value={money(eventSummary.vendor)} /><Summary label="셀러 부담" value={money(eventSummary.seller)} /><Summary label="업체 지원" value={money(eventSummary.company_support)} /><Summary label="전체 예상" value={money(eventSummary.total)} /></div>
        <div className="campaign-event-list">{form.events.map((event, index) => <EventCard event={event} products={form.products} key={event.id} onChange={(patch) => patchEvent(event.id, patch)} onClone={() => setForm({ ...form, events: [...form.events, { ...event, id: `event-${crypto.randomUUID()}` }] })} onDelete={() => setForm({ ...form, events: form.events.filter((item) => item.id !== event.id) })} title={`이벤트 ${index + 1}`} />)}</div>
      </section>}
      {step === 5 && <section className="campaign-create-section"><h3>5. 일정 및 담당자</h3><div className="campaign-create-grid">
        <label><span>시작일 *</span><input type="date" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} /></label>
        <label><span>종료일 *</span><input type="date" value={form.endDate} onChange={(e) => updateEndDate(e.target.value)} /></label>
        <label><span>정산 예정일 · 종료 +21일</span><input type="date" value={form.settlementDueDate} onChange={(e) => setForm({ ...form, settlementDueDate: e.target.value, settlementDueDateOverridden: true })} /><button className="text-button" onClick={() => setForm({ ...form, settlementDueDate: calculateSettlementDueDate(form.endDate), settlementDueDateOverridden: false })}>자동 날짜로 재설정</button></label>
        <label><span>담당 매니저 *</span><select value={form.managerId} onChange={(e) => setForm({ ...form, managerId: e.target.value })}><option value="">선택</option>{managers.map((user) => <option key={user.id} value={user.id}>{user.name}</option>)}</select></label>
        <label><span>담당 MD *</span><select value={form.mdId} onChange={(e) => setForm({ ...form, mdId: e.target.value })}>{mds.map((user) => <option key={user.id} value={user.id}>{user.name}</option>)}</select></label>
        <label className="span-2"><span>주요 메모</span><textarea rows={3} value={form.memo} onChange={(e) => setForm({ ...form, memo: e.target.value })} /></label>
      </div></section>}
      {step === 6 && <FinalReview form={form} name={campaignName} snapshots={snapshots} missing={missing} summary={eventSummary} />}
    </div>
    <footer className="campaign-create-modal__actions"><button className="secondary-button" onClick={onClose}>취소</button><button className="secondary-button" onClick={() => { storageService.setItem(STORAGE_KEYS.campaignCreateDraft, form); setNotice('임시저장되었습니다.') }}>임시저장</button>{step > 1 && <button className="secondary-button" onClick={() => setStep((step - 1) as Step)}>이전</button>}{step < 6 ? <button className="primary-button" onClick={() => setStep((step + 1) as Step)}>다음</button> : <button className="primary-button" disabled={Boolean(missing.length)} title={missing.length ? `누락: ${missing.join(', ')}` : undefined} onClick={submit}>일정 등록</button>}</footer>
    {helper && <HelperModal kind={helper} input={helperInput} preview={helperPreview} onInput={setHelperInput} onClose={() => setHelper(null)} onPreview={async () => setHelperPreview(helper === 'notion' ? (await mockNotionCampaignImportProvider.preview({ provider: 'notion', pageUrlOrId: helperInput })).draft : await mockAiCampaignDraftService.createDraft(helperInput))} onApply={applyHelper} />}
  </section></div>
}

function ProposalCards({ form, snapshots }: { form: Draft; snapshots: ReturnType<typeof captureProposalSnapshots> }) {
  return <div className="proposal-preview-grid">{snapshots.map((snapshot, index) => { const product = form.products[index]; const discount = Math.round((1 - snapshot.salePrice / snapshot.regularPrice) * 100); return <article key={snapshot.productId}><span>{product.brandName}</span><h4>{product.productName}</h4><dl><div><dt>정상가 / 공구가</dt><dd>{money(snapshot.regularPrice)} / {money(snapshot.salePrice)}</dd></div><div><dt>할인율 / 배송비</dt><dd>{discount}% / {money(snapshot.shippingAmount)}</dd></div><div><dt>기본 + 추가 지원</dt><dd>{snapshot.sellerCommissionRate}% + {snapshot.extraPgSupportRate}%</dd></div><div><dt>최종 셀러 수수료</dt><dd>{snapshot.effectiveSellerCommissionRate}%</dd></div><div><dt>예상 셀러 수익 / 개</dt><dd>{money(snapshot.salePrice * snapshot.effectiveSellerCommissionRate / 100)}</dd></div><div><dt>공구 기간 / 링크</dt><dd>{form.startDate || '-'} ~ {form.endDate || '-'} · {form.salesChannelType}</dd></div></dl><p>{snapshot.notes}</p></article> })}</div>
}

function EventCard({ event, products, title, onChange, onClone, onDelete }: { event: CampaignEvent; products: CampaignProductSelection[]; title: string; onChange: (patch: Partial<CampaignEvent>) => void; onClone: () => void; onDelete: () => void }) {
  const [open, setOpen] = useState(true)
  return <article className="campaign-event-card"><header><strong>{title} · {money(event.estimatedTotalAmount)}</strong><div className="button-row"><button className="text-button" onClick={() => setOpen(!open)}>{open ? '접기' : '펼치기'}</button><button className="text-button" onClick={onClone}>복제</button><button className="text-button danger-text" onClick={onDelete}>삭제</button></div></header>{open && <div className="campaign-create-grid">
    <label><span>부담 주체</span><select value={event.payer} onChange={(e) => onChange({ payer: e.target.value as CampaignEvent['payer'] })}><option value="vendor">벤더 부담</option><option value="seller">셀러 부담</option><option value="company_support">업체 지원</option></select></label>
    <label><span>이벤트 종류</span><select value={event.eventType} onChange={(e) => onChange({ eventType: e.target.value as CampaignEvent['eventType'] })}><option value="first_come">선착순</option><option value="purchase_complete">구매 완료</option><option value="try_it">써볼래요</option><option value="other">기타</option></select></label>
    <label><span>대상 상품</span><select value={event.targetProductId ?? ''} onChange={(e) => { const product = products.find((item) => item.productId === e.target.value); onChange({ targetProductId: product?.productId, targetProductName: product?.productName }) }}><option value="">전체/미지정</option>{products.map((product) => <option key={product.productId} value={product.productId}>{product.productName}</option>)}</select></label>
    <label><span>제공 상품 · 마스터 또는 직접 입력</span><select value={event.rewardProductId ?? ''} onChange={(e) => { const product = campaignProductCatalogService.getProduct(e.target.value); onChange({ rewardProductId: product?.id, rewardProductName: product?.productName, rewardUnitPrice: product?.salePrice ?? 0, rewardUnitPriceOverridden: false }) }}><option value="">직접 입력</option>{campaignProductCatalogService.listBrands().flatMap((brand) => campaignProductCatalogService.listProductsByBrand(brand.id)).map((product) => <option key={product.id} value={product.id}>{product.brandName} · {product.productName}</option>)}</select><input placeholder="직접 입력 상품명" value={event.rewardProductName ?? ''} onChange={(e) => onChange({ rewardProductName: e.target.value, rewardProductId: undefined })} /></label>
    <label><span>단가</span><input min="0" type="number" value={event.rewardUnitPrice || ''} onChange={(e) => onChange({ rewardUnitPrice: Number(e.target.value), rewardUnitPriceOverridden: true })} /><small>{event.rewardUnitPriceOverridden ? '수동 override' : '상품 마스터 자동 적용'}</small></label>
    <label><span>예정 수량</span><input min="0" type="number" value={event.plannedQuantity || ''} onChange={(e) => onChange({ plannedQuantity: Number(e.target.value) })} /></label>
    <label><span>시작일 / 종료일</span><div className="inline-fields"><input type="date" value={event.startDate ?? ''} onChange={(e) => onChange({ startDate: e.target.value })} /><input type="date" value={event.endDate ?? ''} onChange={(e) => onChange({ endDate: e.target.value })} /></div></label>
    <label><span>메모</span><input value={event.memo ?? ''} onChange={(e) => onChange({ memo: e.target.value })} /></label>
  </div>}</article>
}

function FinalReview({ form, name, snapshots, missing, summary }: { form: Draft; name: string; snapshots: ReturnType<typeof captureProposalSnapshots>; missing: string[]; summary: ReturnType<typeof summarizeEvents> }) {
  return <section className="campaign-create-section"><h3>6. 최종 확인</h3>{missing.length ? <p className="campaign-policy-warning">누락된 필수값: {missing.join(', ')}</p> : <p className="success-panel">필수값 확인 완료 · 저장할 수 있습니다.</p>}<div className="final-review-grid"><Summary label="공동구매명" value={name || '-'} /><Summary label="셀러 / 사업자" value={`${form.sellerName || '-'} · ${form.businessType}`} /><Summary label="브랜드 / 상품" value={`${form.products[0]?.brandName ?? '-'} · ${form.products.map((item) => item.productName).join(', ') || '-'}`} /><Summary label="판매 링크 유형" value={form.salesChannelType} /><Summary label="기간" value={`${form.startDate || '-'} ~ ${form.endDate || '-'}`} /><Summary label="정산 예정일" value={`${form.settlementDueDate || '-'}${form.settlementDueDateOverridden ? ' · 수동' : ' · 자동'}`} /><Summary label="담당자" value={`${appUsers.find((user) => user.id === form.mdId)?.name ?? '-'} / ${appUsers.find((user) => user.id === form.managerId)?.name ?? '-'}`} /><Summary label="이벤트" value={`${form.events.length}개 · ${money(summary.total)}`} /></div><ProposalCards form={form} snapshots={snapshots} /><div className="campaign-event-list">{form.events.map((event) => <p key={event.id}>{event.rewardProductName || '제공 상품 미정'} · {money(event.estimatedTotalAmount)}</p>)}</div></section>
}

function HelperModal({ kind, input, preview, onInput, onPreview, onApply, onClose }: { kind: 'notion' | 'ai'; input: string; preview: AiCampaignDraft | null; onInput: (value: string) => void; onPreview: () => void; onApply: () => void; onClose: () => void }) {
  return <div className="nested-modal-backdrop"><section className="helper-modal"><h3>{kind === 'notion' ? 'Notion에서 가져오기 · 준비 중' : 'AI로 일정 초안 만들기 · Mock'}</h3><p>{kind === 'notion' ? '예정 매핑: 셀러, 브랜드, 상품, 기간, 판매 링크, 이벤트. 실제 API Key는 브라우저에 두지 않습니다.' : 'AI 초안 → 사용자 검토 → 상품 마스터 매칭 → 최종 적용 → 저장 순서입니다.'}</p>{kind === 'notion' ? <input placeholder="Notion 페이지 URL 또는 ID" value={input} onChange={(e) => onInput(e.target.value)} /> : <textarea rows={5} placeholder="자연어로 공구 내용을 입력하세요." value={input} onChange={(e) => onInput(e.target.value)} />}<button className="secondary-button" onClick={onPreview}>Mock 미리보기</button>{preview && <div className="helper-preview"><strong>{preview.sellerName} · {preview.brandName}</strong><p>{preview.productNames.join(', ')}</p><p>{preview.startDate} ~ {preview.endDate} · {preview.salesChannelType}</p><p>확인 필요: {preview.unresolvedFields.join(', ')}</p></div>}<div className="button-row"><button className="secondary-button" onClick={onClose}>닫기</button><button className="primary-button" disabled={!preview} onClick={onApply}>검토한 초안 적용</button></div></section></div>
}

function Summary({ label, value }: { label: string; value: string }) { return <div><span>{label}</span><strong>{value}</strong></div> }
