import { useEffect, useMemo, useRef, useState } from 'react'
import { appUsers, DEFAULT_MD_USER_ID, getUserById } from '../../../shared/data/users'
import {
  campaignDraftService, type CampaignCreationFormData, type CampaignDraft,
  getDraftMissingFields,
} from '../../../shared/services/campaignDraftService'
import { campaignService, type CampaignCreateInput } from '../../../shared/services/campaignService'
import {
  calculateEventAmounts, calculateSettlementDueDate, calculateWinnerAnnouncementDate,
  captureProposalSnapshots, formatDateWithWeekday, generateCampaignName,
  getBusinessTypeLabel, getCampaignEventTypeLabel, getEventPayerLabel, getSalesChannelTypeLabel,
  mockAiCampaignDraftService, mockNotionCampaignImportProvider, summarizeEvents,
} from '../../../shared/services/campaignCreationService'
import { campaignProductCatalogService } from '../../../shared/services/campaignProductCatalogService'
import type { Campaign } from '../../../shared/types/campaign'
import type { AiCampaignDraft, CampaignCreationBusinessType, CampaignEvent, CampaignProductSelection } from '../../../shared/types/campaignCreation'
import {
  CAMPAIGN_FIELD_ORDER, scrollToFirstInvalidCampaignField, type CampaignFormErrorKey,
} from '../../../shared/utils/campaignFormValidation'

type Props = { onClose: () => void; onCreated: (campaign: Campaign) => void }
type Draft = CampaignCreationFormData
type CampaignFormErrors = Partial<Record<CampaignFormErrorKey, string>>

const managers = appUsers.filter((user) => ['대표', '팀장', '매니저'].includes(user.role))
const mds = appUsers.filter((user) => user.role === 'MD')
const money = (value: number) => `${Math.round(value).toLocaleString('ko-KR')}원`
const initial: Draft = {
  sellerName: '', businessType: 'general_business', brandId: '', products: [],
  salesChannelType: 'supplier_link', startDate: '', endDate: '', linkOpenTime: '',
  linkCloseTime: '', settlementDueDate: '', settlementDueDateOverridden: false,
  winnerAnnouncementDate: '', winnerAnnouncementDateOverride: false, managerId: '',
  mdId: DEFAULT_MD_USER_ID, memo: '', events: [], campaignName: '', nameOverridden: false,
}

function newEvent(): CampaignEvent {
  return { id: `event-${crypto.randomUUID()}`, payer: 'vendor', eventType: 'first_come', rewardUnitPrice: 0, plannedQuantity: 0, estimatedTotalAmount: 0 }
}

function withoutLegacyEventDates(event: CampaignEvent) {
  const next = { ...event }
  delete next.startDate
  delete next.endDate
  return next
}

function DateField({ fieldId, error, label, value, onChange, optional = false }: { fieldId?: string; error?: string; label: string; value: string; onChange: (value: string) => void; optional?: boolean }) {
  return <label className={error ? 'campaign-field--error' : ''} id={fieldId}><span>{label}{optional ? '' : ' *'}</span><input aria-invalid={Boolean(error)} type="date" value={value} onChange={(event) => onChange(event.target.value)} /><small className="date-weekday">{formatDateWithWeekday(value)}</small>{error && <small className="field-error">{error}</small>}</label>
}

export function CreateCampaignModal({ onClose, onCreated }: Props) {
  const owner = getUserById('u-001')!
  const requestedDraftId = new URLSearchParams(window.location.search).get('draftId')
  const [drafts, setDrafts] = useState<CampaignDraft[]>(() => campaignDraftService.listCampaignDraftsByOwner(owner.id, owner.name))
  const requestedDraft = requestedDraftId ? campaignDraftService.getCampaignDraftById(requestedDraftId) : undefined
  const [screen, setScreen] = useState<'select' | 'form'>(() => requestedDraft ? 'form' : drafts.length ? 'select' : 'form')
  const [draftId, setDraftId] = useState<string | null>(requestedDraft?.id ?? null)
  const [form, setForm] = useState<Draft>(() => requestedDraft ? { ...initial, ...requestedDraft.formData, products: requestedDraft.formData.products ?? [], events: requestedDraft.formData.events ?? [] } : initial)
  const [errors, setErrors] = useState<CampaignFormErrors>({})
  const [saveState, setSaveState] = useState<'저장 안 됨' | '저장 중' | '저장 완료' | '저장 실패'>(requestedDraft ? '저장 완료' : '저장 안 됨')
  const [lastSavedAt, setLastSavedAt] = useState(requestedDraft?.updatedAt ?? '')
  const [deleteTarget, setDeleteTarget] = useState<CampaignDraft | null>(null)
  const [exitConfirmOpen, setExitConfirmOpen] = useState(false)
  const initialSerialized = useRef(JSON.stringify(form))
  const savedSerialized = useRef(JSON.stringify(form))
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
  const missing = [...getDraftMissingFields(form), ...(policyMissing ? ['상품 수수료 정책'] : [])]
  const status = missing.length ? (form.sellerName || form.products.length ? '필수값 누락' : '입력 중') : '저장 가능'

  const validate = (): CampaignFormErrors => {
    const next: CampaignFormErrors = {}
    if (!form.sellerName.trim()) next.sellerId = '셀러를 선택해주세요.'
    if (!form.businessType) next.businessType = '사업자 유형을 선택해주세요.'
    if (!form.brandId) next.brandId = '브랜드를 선택해주세요.'
    if (!form.products.length) next.campaignProducts = '상품을 한 개 이상 선택해주세요.'
    if (!form.startDate) next.startDate = '시작일을 입력해주세요.'
    if (!form.endDate) next.endDate = '종료일을 입력해주세요.'
    if (!form.managerId) next.managerId = '담당 매니저를 선택해주세요.'
    if (!form.mdId) next.mdId = '담당 MD를 선택해주세요.'
    if (!form.salesChannelType) next.salesChannelType = '판매 링크 유형을 선택해주세요.'
    return next
  }
  const fieldOrder = CAMPAIGN_FIELD_ORDER
  const visibleErrors = Object.fromEntries(Object.entries(errors).filter(([key]) => validate()[key as keyof CampaignFormErrors])) as CampaignFormErrors
  const productSectionErrorCount = ['sellerId', 'businessType', 'brandId', 'campaignProducts'].filter((key) => visibleErrors[key as keyof CampaignFormErrors]).length
  const scheduleSectionErrorCount = ['startDate', 'endDate', 'managerId', 'mdId'].filter((key) => visibleErrors[key as keyof CampaignFormErrors]).length
  const proposalSectionErrorCount = visibleErrors.salesChannelType ? 1 : 0

  useEffect(() => {
    if (screen !== 'form' || JSON.stringify(form) === savedSerialized.current || JSON.stringify(form) === initialSerialized.current) return
    setSaveState('저장 중')
    const timer = window.setTimeout(() => {
      try {
        const updated = draftId
          ? campaignDraftService.updateCampaignDraft(draftId, form, campaignName)
          : campaignDraftService.createCampaignDraft(owner.id, owner.name, form, campaignName)
        if (!updated) throw new Error('draft not found')
        if (!draftId) {
          setDraftId(updated.id)
          window.history.replaceState({}, '', `/campaigns/new?draftId=${encodeURIComponent(updated.id)}`)
        }
        savedSerialized.current = JSON.stringify(form)
        setLastSavedAt(updated.updatedAt)
        setSaveState('저장 완료')
        setDrafts(campaignDraftService.listCampaignDraftsByOwner(owner.id, owner.name))
      } catch {
        setSaveState('저장 실패')
      }
    }, 700)
    return () => window.clearTimeout(timer)
  }, [form, screen, draftId, campaignName, owner.id, owner.name])

  const saveDraft = () => {
    const updated = draftId
      ? campaignDraftService.updateCampaignDraft(draftId, form, campaignName)
      : campaignDraftService.createCampaignDraft(owner.id, owner.name, form, campaignName)
    if (!updated) return
    setDraftId(updated.id); setLastSavedAt(updated.updatedAt); setSaveState('저장 완료')
    savedSerialized.current = JSON.stringify(form)
    window.history.replaceState({}, '', `/campaigns/new?draftId=${encodeURIComponent(updated.id)}`)
    setNotice('임시저장되었습니다.')
  }
  const startNew = () => {
    setDraftId(null); setForm(initial); setErrors({}); setSaveState('저장 안 됨'); setLastSavedAt('')
    initialSerialized.current = JSON.stringify(initial); savedSerialized.current = JSON.stringify(initial)
    window.history.replaceState({}, '', '/campaigns/new')
    setScreen('form')
  }
  const continueDraft = (draft: CampaignDraft) => {
    const next = { ...initial, ...draft.formData, products: draft.formData.products ?? [], events: draft.formData.events ?? [] }
    setDraftId(draft.id); setForm(next); setErrors({}); setLastSavedAt(draft.updatedAt); setSaveState('저장 완료')
    initialSerialized.current = JSON.stringify(next); savedSerialized.current = JSON.stringify(next)
    window.history.replaceState({}, '', `/campaigns/new?draftId=${encodeURIComponent(draft.id)}`)
    setScreen('form')
  }

  const updateProducts = (products: CampaignProductSelection[]) => {
    if (form.nameOverridden && form.products.length && !window.confirm('상품 선택이 변경됩니다. 공동구매명을 자동 이름으로 다시 바꿀까요?')) {
      setForm((current) => ({ ...current, products }))
    } else setForm((current) => ({ ...current, products, nameOverridden: false, campaignName: '' }))
  }
  const selectProduct = (productId: string) => {
    const product = campaignProductCatalogService.getProduct(productId)
    if (!product || form.products.some((item) => item.productId === productId)) return
    updateProducts([...form.products, { id: `selection-${crypto.randomUUID()}`, brandId: product.brandId, brandName: product.brandName, productId: product.id, productName: product.productName, displayOrder: form.products.length }])
  }
  const move = (index: number, direction: -1 | 1) => {
    const target = index + direction
    if (target < 0 || target >= form.products.length) return
    const products = [...form.products]; [products[index], products[target]] = [products[target], products[index]]
    updateProducts(products.map((item, displayOrder) => ({ ...item, displayOrder })))
  }
  const updateEndDate = (endDate: string) => {
    const settlementDueDate = calculateSettlementDueDate(endDate)
    const winnerAnnouncementDate = calculateWinnerAnnouncementDate(endDate)
    const keepSettlement = Boolean(form.settlementDueDateOverridden && form.settlementDueDate && !window.confirm(`정산 예정일을 자동 날짜(${settlementDueDate})로 변경할까요?`))
    const keepWinner = Boolean(form.events.length > 0 && form.winnerAnnouncementDateOverride && form.winnerAnnouncementDate && !window.confirm(`발표자 선정일을 자동 날짜(${winnerAnnouncementDate})로 변경할까요?`))
    setForm((current) => ({
      ...current, endDate,
      settlementDueDate: keepSettlement ? current.settlementDueDate : settlementDueDate,
      settlementDueDateOverridden: keepSettlement,
      winnerAnnouncementDate: keepWinner ? current.winnerAnnouncementDate : winnerAnnouncementDate,
      winnerAnnouncementDateOverride: keepWinner,
    }))
  }
  const addEvent = () => setForm((current) => ({
    ...current, events: [...current.events, newEvent()],
    winnerAnnouncementDate: current.winnerAnnouncementDate || calculateWinnerAnnouncementDate(current.endDate),
  }))
  const patchEvent = (id: string, patch: Partial<CampaignEvent>) => setForm((current) => ({
    ...current, events: current.events.map((event) => event.id === id ? calculateEventAmounts({ ...event, ...patch }) : event),
  }))
  const scrollTo = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  const scrollToFirstInvalidField = (nextErrors: CampaignFormErrors, keys: readonly CampaignFormErrorKey[] = fieldOrder) => {
    scrollToFirstInvalidCampaignField(nextErrors, keys)
  }
  const handleClose = () => {
    if (JSON.stringify(form) !== savedSerialized.current) {
      setExitConfirmOpen(true)
      return
    }
    window.history.replaceState({}, '', '/')
    onClose()
  }
  const applyHelper = () => {
    if (!helperPreview) return
    const brand = campaignProductCatalogService.listBrands().find((item) => item.name === helperPreview.brandName)
    const products = brand ? campaignProductCatalogService.listProductsByBrand(brand.id).filter((item) => helperPreview.productNames.includes(item.productName)).map((item, displayOrder) => ({ id: `selection-${crypto.randomUUID()}`, brandId: item.brandId, brandName: item.brandName, productId: item.id, productName: item.productName, displayOrder })) : []
    const endDate = helperPreview.endDate ?? form.endDate
    setForm((current) => ({
      ...current, sellerName: helperPreview.sellerName ?? current.sellerName, brandId: brand?.id ?? current.brandId,
      products: products.length ? products : current.products, startDate: helperPreview.startDate ?? current.startDate,
      endDate, settlementDueDate: helperPreview.settlementDueDate ?? calculateSettlementDueDate(endDate),
      winnerAnnouncementDate: calculateWinnerAnnouncementDate(endDate),
      salesChannelType: helperPreview.salesChannelType ?? current.salesChannelType,
      events: helperPreview.events.length ? helperPreview.events.map((event) => calculateEventAmounts({ ...newEvent(), ...event, startDate: undefined, endDate: undefined })) : current.events,
      notionImportMetadata: helper === 'notion' ? { provider: 'mock-notion', sourceId: helperInput, importedAt: new Date().toISOString() } : current.notionImportMetadata,
      aiDraftMetadata: helper === 'ai' ? { provider: 'mock', prompt: helperInput, confidence: helperPreview.confidence, appliedAt: new Date().toISOString() } : current.aiDraftMetadata,
    }))
    setHelper(null); setHelperPreview(null)
  }
  const submit = () => {
    const nextErrors = validate()
    if (Object.keys(nextErrors).length || policyMissing) {
      setErrors(nextErrors)
      setNotice(`필수값 ${Object.keys(nextErrors).length + (policyMissing ? 1 : 0)}개를 확인해주세요.`)
      scrollToFirstInvalidField(nextErrors)
      return
    }
    const first = form.products[0]
    const proposal = snapshots[0]
    const input: CampaignCreateInput = {
      campaignName, sellerName: form.sellerName, brandName: first.brandName, productName: first.productName,
      managerId: form.managerId, mdId: form.mdId, startDate: form.startDate, endDate: form.endDate,
      linkOwner: form.salesChannelType === 'seller_checkout' ? 'seller' : form.salesChannelType === 'supplier_link' ? 'brand' : 'company',
      businessType: form.businessType, totalCommissionRate: proposal.totalCommissionRate,
      sellerCommissionRate: proposal.effectiveSellerCommissionRate, settlementDueDate: form.settlementDueDate,
      landingPageType: form.salesChannelType, salesChannelType: form.salesChannelType, memo: form.memo,
      campaignProducts: form.products, proposalSnapshots: snapshots,
      campaignEvents: form.events.map(withoutLegacyEventDates),
      settlementDueDateOverridden: form.settlementDueDateOverridden, nameOverridden: form.nameOverridden,
      linkOpenTime: form.linkOpenTime || undefined, linkCloseTime: form.linkCloseTime || undefined,
      winnerAnnouncementDate: form.events.length ? form.winnerAnnouncementDate : undefined,
      winnerAnnouncementDateOverride: form.events.length ? form.winnerAnnouncementDateOverride : undefined,
      notionImportMetadata: form.notionImportMetadata, aiDraftMetadata: form.aiDraftMetadata,
    }
    const result = campaignService.createCampaign(input)
    if (!result.campaign) { setNotice(Object.values(result.errors).join(' · ')); return }
    campaignDraftService.completeDraftAfterCampaignCreated(draftId, Boolean(result.campaign))
    onCreated(result.campaign)
  }

  if (screen === 'select') return <div className="campaign-create-backdrop"><section aria-modal="true" className="campaign-create-modal campaign-draft-picker" role="dialog">
    <header className="campaign-create-modal__header"><div><p className="page-eyebrow">Campaign Drafts</p><h2>임시저장한 일정이 있습니다</h2><p>이어서 작성할 일정을 선택하거나 새로운 일정을 등록해주세요.</p></div><button aria-label="닫기" className="icon-button" onClick={() => { window.history.replaceState({}, '', '/'); onClose() }}>×</button></header>
    <div className="campaign-draft-picker__actions"><strong>임시저장 {drafts.length}건</strong><button className="primary-button" onClick={startNew}>새 일정 등록</button></div>
    <div className="campaign-draft-list">{drafts.map((draft) => {
      const selectedProducts = draft.formData.products ?? []
      const brand = campaignProductCatalogService.listBrands().find((item) => item.id === draft.formData.brandId)
      return <article className="campaign-draft-card" key={draft.id}>
        <div className="campaign-draft-card__heading"><div><span>{draft.completionRate}% 작성</span><h3>{draft.generatedCampaignName || '이름 미정'}</h3></div><span className="draft-missing-badge">필수값 {draft.missingRequiredFields.length}개 누락</span></div>
        <dl><div><dt>셀러명</dt><dd>{draft.formData.sellerName || '미입력'}</dd></div><div><dt>브랜드</dt><dd>{brand?.name || selectedProducts[0]?.brandName || '미입력'}</dd></div><div><dt>선택 상품</dt><dd>{selectedProducts.map((item) => item.productName).join(', ') || '미입력'}</dd></div><div><dt>기간</dt><dd>{draft.formData.startDate || '미입력'} ~ {draft.formData.endDate || '미입력'}</dd></div><div><dt>작성자</dt><dd>{draft.ownerName}</dd></div><div><dt>마지막 저장</dt><dd>{new Date(draft.updatedAt).toLocaleString('ko-KR')}</dd></div></dl>
        <div className="button-row"><button className="secondary-button danger-text" onClick={() => setDeleteTarget(draft)}>삭제</button><button className="primary-button" onClick={() => continueDraft(draft)}>이어서 작성</button></div>
      </article>
    })}</div>
    {deleteTarget && <div className="nested-modal-backdrop"><section className="helper-modal"><h3>임시저장 삭제</h3><p>이 임시저장 일정을 삭제하시겠습니까?<br />삭제한 내용은 복구할 수 없습니다.</p><div className="button-row"><button className="secondary-button" onClick={() => setDeleteTarget(null)}>취소</button><button className="primary-button danger-button" onClick={() => { campaignDraftService.deleteCampaignDraft(deleteTarget.id); setDrafts(campaignDraftService.listCampaignDraftsByOwner(owner.id, owner.name)); setDeleteTarget(null) }}>임시저장 삭제</button></div></section></div>}
  </section></div>

  return <div className="campaign-create-backdrop"><section aria-modal="true" className="campaign-create-modal campaign-create-v2" role="dialog">
    <header className="campaign-create-modal__header"><div><p className="page-eyebrow">Campaign Creation V2</p><h2>새 공구 일정 등록</h2><p>한 화면에서 운영 순서대로 입력합니다.</p></div><div className="campaign-create-header-status"><span className={`campaign-form-status campaign-form-status--${missing.length ? 'warning' : 'ready'}`}>{status}</span><button aria-label="닫기" className="icon-button" onClick={handleClose}>×</button></div></header>
    <div className="campaign-create-tools"><button className="secondary-button" onClick={() => { setHelper('notion'); setHelperPreview(null) }}>Notion에서 가져오기</button><button className="secondary-button" onClick={() => { setHelper('ai'); setHelperPreview(null) }}>AI로 일정 초안 만들기</button></div>
    <nav aria-label="등록 화면 섹션" className="campaign-create-anchors">
      {[['campaign-section-products', '셀러·상품', productSectionErrorCount], ['campaign-section-schedule', '일정·담당자', scheduleSectionErrorCount], ['campaign-section-proposal', '판매 링크', proposalSectionErrorCount], ['campaign-section-events', '이벤트', 0], ['campaign-section-review', '최종 확인', 0]].map(([id, label, count]) => <button key={id} onClick={() => count ? scrollToFirstInvalidField(visibleErrors, id === 'campaign-section-products' ? fieldOrder.slice(0, 4) : id === 'campaign-section-schedule' ? fieldOrder.slice(4, 8) : ['salesChannelType']) : scrollTo(String(id))}>{label}{Number(count) > 0 && <span className="section-error-badge">{count}개 누락</span>}</button>)}
    </nav>
    {notice && <p className="campaign-v2-notice">{notice}</p>}
    <div className="campaign-create-form campaign-create-scroll-form">
      <section className="campaign-create-section" id="campaign-section-products"><div className="section-heading"><h3>1. 셀러 및 상품 정보</h3>{productSectionErrorCount > 0 && <button className="section-error-badge" onClick={() => scrollToFirstInvalidField(visibleErrors, fieldOrder.slice(0, 4))}>필수값 {productSectionErrorCount}개 누락</button>}</div><p className="section-description">셀러에서 상품 선택까지 끊김 없이 입력합니다.</p><div className="campaign-create-grid">
        <label className={visibleErrors.sellerId ? 'campaign-field--error' : ''} id="campaign-field-seller"><span>셀러 *</span><input aria-invalid={Boolean(visibleErrors.sellerId)} value={form.sellerName} onChange={(event) => setForm({ ...form, sellerName: event.target.value })} />{visibleErrors.sellerId && <small className="field-error">{visibleErrors.sellerId}</small>}</label>
        <label className={visibleErrors.businessType ? 'campaign-field--error' : ''} id="campaign-field-business-type"><span>사업자 유형 *</span><select aria-invalid={Boolean(visibleErrors.businessType)} value={form.businessType} onChange={(event) => setForm({ ...form, businessType: event.target.value as CampaignCreationBusinessType })}><option value="general_business">법인/개인사업자</option><option value="simplified_business">간이사업자</option><option value="freelancer">프리랜서</option></select>{visibleErrors.businessType && <small className="field-error">{visibleErrors.businessType}</small>}</label>
        <label className={visibleErrors.brandId ? 'campaign-field--error' : ''} id="campaign-field-brand"><span>브랜드 검색·선택 *</span><input placeholder="브랜드명 검색" value={brandQuery} onChange={(event) => setBrandQuery(event.target.value)} /><select aria-invalid={Boolean(visibleErrors.brandId)} size={Math.min(4, brands.length || 1)} value={form.brandId} onChange={(event) => { campaignProductCatalogService.rememberBrand(event.target.value); setForm({ ...form, brandId: event.target.value }); setProductQuery('') }}>{brands.map((brand) => <option key={brand.id} value={brand.id}>{brand.name}</option>)}</select>{visibleErrors.brandId && <small className="field-error">{visibleErrors.brandId}</small>}{!brands.length && <small>검색 결과가 없습니다. 새 브랜드 등록 화면은 준비 중입니다.</small>}<small>최근 선택: {campaignProductCatalogService.getRecentBrands().map((brand) => brand.name).join(', ') || selectedBrand?.name || '없음'}</small></label>
        <label className={visibleErrors.campaignProducts ? 'campaign-field--error' : ''} id="campaign-field-products"><span>상품 검색·다중 선택 *</span><input disabled={!form.brandId} placeholder="상품명 검색" value={productQuery} onChange={(event) => setProductQuery(event.target.value)} /><select aria-invalid={Boolean(visibleErrors.campaignProducts)} disabled={!form.brandId} onChange={(event) => selectProduct(event.target.value)} value=""><option value="">상품 선택</option>{availableProducts.map((product) => <option key={product.id} value={product.id}>{product.productName}</option>)}</select>{visibleErrors.campaignProducts && <small className="field-error">{visibleErrors.campaignProducts}</small>}</label>
      </div>
      <div className="selected-product-list">{form.products.map((product, index) => <article key={product.id}><div><span>{index + 1}</span><strong>{product.brandName} · {product.productName}</strong></div><div className="button-row"><button className="text-button" disabled={index === 0} onClick={() => move(index, -1)}>↑</button><button className="text-button" disabled={index === form.products.length - 1} onClick={() => move(index, 1)}>↓</button><button className="text-button danger-text" onClick={() => updateProducts(form.products.filter((item) => item.id !== product.id).map((item, displayOrder) => ({ ...item, displayOrder })))}>삭제</button></div></article>)}</div>
      {policyMissing && <p className="campaign-policy-warning">선택한 상품에 수수료 정책이 등록되지 않았습니다. 상품 정보를 먼저 완성해주세요.</p>}
      <div className="campaign-generated-name"><span>자동 생성된 공동구매명</span><strong>{campaignName || '셀러와 상품을 선택하면 자동 생성됩니다.'}</strong><label className="checkbox-label"><input checked={form.nameOverridden} type="checkbox" onChange={(event) => setForm({ ...form, nameOverridden: event.target.checked, campaignName: event.target.checked ? automaticName : '' })} /> 이름 직접 수정</label>{form.nameOverridden && <input aria-label="공동구매명 직접 수정" value={form.campaignName} onChange={(event) => setForm({ ...form, campaignName: event.target.value })} />}</div>
      </section>

      <section className="campaign-create-section" id="campaign-section-schedule"><div className="section-heading"><h3>2. 일정 및 담당자</h3>{scheduleSectionErrorCount > 0 && <button className="section-error-badge" onClick={() => scrollToFirstInvalidField(visibleErrors, fieldOrder.slice(4, 8))}>필수값 {scheduleSectionErrorCount}개 누락</button>}</div><div className="campaign-create-grid">
        <DateField error={visibleErrors.startDate} fieldId="campaign-field-start-date" label="시작일" value={form.startDate} onChange={(startDate) => setForm({ ...form, startDate })} />
        <label><span>링크 오픈 시간</span><input type="time" value={form.linkOpenTime} onChange={(event) => setForm({ ...form, linkOpenTime: event.target.value })} /><small>선택 입력</small></label>
        <DateField error={visibleErrors.endDate} fieldId="campaign-field-end-date" label="종료일" value={form.endDate} onChange={updateEndDate} />
        <label><span>링크 닫는 시간</span><input type="time" value={form.linkCloseTime} onChange={(event) => setForm({ ...form, linkCloseTime: event.target.value })} /><small>선택 입력</small></label>
        <label><span>정산 예정일 · 종료 +21일</span><input type="date" value={form.settlementDueDate} onChange={(event) => setForm({ ...form, settlementDueDate: event.target.value, settlementDueDateOverridden: true })} /><small className="date-weekday">{formatDateWithWeekday(form.settlementDueDate)}</small><button className="text-button" onClick={() => setForm({ ...form, settlementDueDate: calculateSettlementDueDate(form.endDate), settlementDueDateOverridden: false })}>자동 날짜로 재설정</button></label>
        <label className={visibleErrors.mdId ? 'campaign-field--error' : ''} id="campaign-field-md"><span>담당 MD *</span><select aria-invalid={Boolean(visibleErrors.mdId)} value={form.mdId} onChange={(event) => setForm({ ...form, mdId: event.target.value })}>{mds.map((user) => <option key={user.id} value={user.id}>{user.name}</option>)}</select>{visibleErrors.mdId && <small className="field-error">{visibleErrors.mdId}</small>}</label>
        <label className={visibleErrors.managerId ? 'campaign-field--error' : ''} id="campaign-field-manager"><span>담당 매니저 *</span><select aria-invalid={Boolean(visibleErrors.managerId)} value={form.managerId} onChange={(event) => setForm({ ...form, managerId: event.target.value })}><option value="">선택</option>{managers.map((user) => <option key={user.id} value={user.id}>{user.name}</option>)}</select>{visibleErrors.managerId && <small className="field-error">{visibleErrors.managerId}</small>}</label>
        <label className="span-2"><span>주요 메모</span><textarea rows={3} value={form.memo} onChange={(event) => setForm({ ...form, memo: event.target.value })} /></label>
      </div></section>

      <section className="campaign-create-section" id="campaign-section-proposal"><div className="section-heading"><h3>3. 판매 링크 및 제안 조건</h3>{proposalSectionErrorCount > 0 && <button className="section-error-badge" onClick={() => scrollToFirstInvalidField(visibleErrors, ['salesChannelType'])}>필수값 1개 누락</button>}</div><label className={visibleErrors.salesChannelType ? 'campaign-field--error' : ''} id="campaign-field-sales-channel"><span>판매 링크 유형 *</span><select aria-invalid={Boolean(visibleErrors.salesChannelType)} value={form.salesChannelType} onChange={(event) => setForm({ ...form, salesChannelType: event.target.value as Draft['salesChannelType'] })}><option value="supplier_link">공급사 링크</option><option value="wise_shop_link">와이즈샵 링크</option><option value="seller_checkout">셀러 결제창</option></select>{visibleErrors.salesChannelType && <small className="field-error">{visibleErrors.salesChannelType}</small>}</label><p className="muted-text">기존 링크주체와 랜딩페이지 유형을 하나의 값으로 저장합니다.</p><button className="secondary-button" disabled={!snapshots.length} onClick={() => setProposalOpen(!proposalOpen)}>제안서 미리보기</button>{proposalOpen && <ProposalCards form={form} snapshots={snapshots} />}</section>

      <section className="campaign-create-section" id="campaign-section-events"><div className="section-heading"><div><h3>4. 이벤트</h3><p>Campaign 전체 기간을 기준으로 진행하며 부담 주체별 금액을 분리합니다.</p></div><button className="secondary-button" onClick={addEvent}>이벤트 추가</button></div>
        <div className="event-summary-grid"><Summary label="전체 이벤트" value={`${form.events.length}개`} /><Summary label="벤더 부담" value={money(eventSummary.vendor)} /><Summary label="셀러 부담" value={money(eventSummary.seller)} /><Summary label="업체 지원" value={money(eventSummary.company_support)} /><Summary label="전체 예상" value={money(eventSummary.total)} /></div>
        {form.events.length > 0 && <div className="winner-announcement-card"><DateField optional label="발표자 선정일 · 종료 +7일" value={form.winnerAnnouncementDate} onChange={(winnerAnnouncementDate) => setForm({ ...form, winnerAnnouncementDate, winnerAnnouncementDateOverride: true })} /><button className="text-button" onClick={() => setForm({ ...form, winnerAnnouncementDate: calculateWinnerAnnouncementDate(form.endDate), winnerAnnouncementDateOverride: false })}>자동 날짜로 재설정</button></div>}
        <div className="campaign-event-list">{form.events.map((event, index) => <EventCard event={event} products={form.products} key={event.id} onChange={(patch) => patchEvent(event.id, patch)} onClone={() => setForm({ ...form, events: [...form.events, { ...event, id: `event-${crypto.randomUUID()}` }] })} onDelete={() => setForm({ ...form, events: form.events.filter((item) => item.id !== event.id) })} title={`이벤트 ${index + 1}`} />)}</div>
      </section>

      <FinalReview form={form} name={campaignName} snapshots={snapshots} missing={missing} summary={eventSummary} />
    </div>
    <footer className="campaign-create-modal__actions campaign-create-sticky-actions"><div><strong>필수값 누락 {missing.length}개 · {saveState}</strong><span>마지막 임시저장 {lastSavedAt ? new Date(lastSavedAt).toLocaleString('ko-KR') : '없음'}</span></div><button className="secondary-button" onClick={handleClose}>취소</button><button className="secondary-button" onClick={saveDraft}>임시저장</button><button className="secondary-button" onClick={() => scrollTo('campaign-section-review')}>최종 확인으로 이동</button>{missing.length > 0 && <button className="secondary-button" onClick={() => { const next = validate(); setErrors(next); scrollToFirstInvalidField(next) }}>오류 위치로 이동</button>}<button className="primary-button" onClick={submit}>일정 등록</button></footer>
    {exitConfirmOpen && <div className="nested-modal-backdrop"><section className="helper-modal"><h3>저장하지 않은 변경사항이 있습니다.</h3><p>작성 내용을 임시저장하고 나가거나, 저장하지 않고 나갈 수 있습니다.</p><div className="button-row"><button className="secondary-button" onClick={() => setExitConfirmOpen(false)}>계속 작성</button><button className="secondary-button danger-text" onClick={() => { window.history.replaceState({}, '', '/'); onClose() }}>저장하지 않고 나가기</button><button className="primary-button" onClick={() => { saveDraft(); window.history.replaceState({}, '', '/'); onClose() }}>임시저장 후 나가기</button></div></section></div>}
    {helper && <HelperModal kind={helper} input={helperInput} preview={helperPreview} onInput={setHelperInput} onClose={() => setHelper(null)} onPreview={async () => setHelperPreview(helper === 'notion' ? (await mockNotionCampaignImportProvider.preview({ provider: 'notion', pageUrlOrId: helperInput })).draft : await mockAiCampaignDraftService.createDraft(helperInput))} onApply={applyHelper} />}
  </section></div>
}

function ProposalCards({ form, snapshots }: { form: Draft; snapshots: ReturnType<typeof captureProposalSnapshots> }) {
  return <div className="proposal-preview-grid">{snapshots.map((snapshot, index) => { const product = form.products[index]; const discount = Math.round((1 - snapshot.salePrice / snapshot.regularPrice) * 100); return <article key={snapshot.productId}><span>{product.brandName}</span><h4>{product.productName}</h4><dl><div><dt>정상가 / 공구가</dt><dd>{money(snapshot.regularPrice)} / {money(snapshot.salePrice)}</dd></div><div><dt>할인율 / 배송비</dt><dd>{discount}% / {money(snapshot.shippingAmount)}</dd></div><div><dt>기본 + 추가 지원</dt><dd>{snapshot.sellerCommissionRate}% + {snapshot.extraPgSupportRate}%</dd></div><div><dt>최종 셀러 수수료</dt><dd>{snapshot.effectiveSellerCommissionRate}%</dd></div><div><dt>예상 셀러 수익 / 개</dt><dd>{money(snapshot.salePrice * snapshot.effectiveSellerCommissionRate / 100)}</dd></div><div><dt>공구 기간 / 링크</dt><dd>{formatDateWithWeekday(form.startDate)} ~ {formatDateWithWeekday(form.endDate)} · {getSalesChannelTypeLabel(form.salesChannelType)}</dd></div></dl><p>{snapshot.notes}</p></article> })}</div>
}

function EventCard({ event, products, title, onChange, onClone, onDelete }: { event: CampaignEvent; products: CampaignProductSelection[]; title: string; onChange: (patch: Partial<CampaignEvent>) => void; onClone: () => void; onDelete: () => void }) {
  const [open, setOpen] = useState(true)
  const masterProducts = campaignProductCatalogService.listProducts()
  return <article className="campaign-event-card"><header><div><strong>{title}</strong><span>{getEventPayerLabel(event.payer)} · {money(event.estimatedTotalAmount)}</span></div><div className="button-row"><button className="text-button" onClick={() => setOpen(!open)}>{open ? '접기' : '펼치기'}</button><button className="text-button" onClick={onClone}>복제</button><button className="text-button danger-text" onClick={onDelete}>삭제</button></div></header>{open && <div className="campaign-create-grid">
    <label><span>부담 주체</span><select value={event.payer} onChange={(e) => onChange({ payer: e.target.value as CampaignEvent['payer'] })}><option value="vendor">벤더 부담</option><option value="seller">셀러 부담</option><option value="company_support">업체 지원</option></select></label>
    <label><span>이벤트 종류</span><select value={event.eventType} onChange={(e) => onChange({ eventType: e.target.value as CampaignEvent['eventType'] })}><option value="first_come">선착순</option><option value="purchase_complete">구매 완료</option><option value="try_it">써볼래요</option><option value="other">기타</option></select></label>
    <label><span>대상 상품</span><select value={event.targetProductId ?? ''} onChange={(e) => { const item = products.find((product) => product.productId === e.target.value); onChange({ targetProductId: item?.productId, targetProductName: item?.productName }) }}><option value="">선택</option>{products.map((product) => <option key={product.id} value={product.productId}>{product.productName}</option>)}</select></label>
    <label><span>제공 상품</span><select value={event.rewardProductId ?? 'direct'} onChange={(e) => { const product = campaignProductCatalogService.getProduct(e.target.value); onChange(product ? { rewardProductId: product.id, rewardProductName: product.productName, rewardUnitPrice: product.supplyPrice, rewardUnitPriceOverridden: false } : { rewardProductId: undefined, rewardProductName: '', rewardUnitPrice: 0 }) }}><option value="direct">직접 입력</option>{masterProducts.map((product) => <option key={product.id} value={product.id}>{product.brandName} · {product.productName}</option>)}</select><input placeholder="제공 상품명" value={event.rewardProductName ?? ''} onChange={(e) => onChange({ rewardProductName: e.target.value })} /></label>
    <label><span>단가</span><input min="0" type="number" value={event.rewardUnitPrice || ''} onChange={(e) => onChange({ rewardUnitPrice: Number(e.target.value), rewardUnitPriceOverridden: true })} /><small>{event.rewardUnitPriceOverridden ? '수동 override' : '상품 마스터 자동 적용'}</small></label>
    <label><span>예정 수량</span><input min="0" type="number" value={event.plannedQuantity || ''} onChange={(e) => onChange({ plannedQuantity: Number(e.target.value) })} /></label>
    <label><span>예상 총금액</span><input readOnly value={money(event.estimatedTotalAmount)} /></label>
    <label><span>메모</span><input value={event.memo ?? ''} onChange={(e) => onChange({ memo: e.target.value })} /></label>
  </div>}</article>
}

function FinalReview({ form, name, snapshots, missing, summary }: { form: Draft; name: string; snapshots: ReturnType<typeof captureProposalSnapshots>; missing: string[]; summary: ReturnType<typeof summarizeEvents> }) {
  return <section className="campaign-create-section" id="campaign-section-review"><h3>5. 최종 확인</h3>{missing.length ? <p className="campaign-policy-warning">누락된 필수값: {missing.join(', ')}</p> : <p className="success-panel">필수값 확인 완료 · 저장할 수 있습니다.</p>}
    <div className="final-review-grid final-review-grid--ordered">
      <Summary label="자동 생성 공동구매명" value={name || '-'} />
      <Summary label="셀러" value={form.sellerName || '-'} />
      <Summary label="사업자 유형" value={getBusinessTypeLabel(form.businessType)} />
      <Summary label="브랜드 및 선택 상품" value={`${form.products[0]?.brandName ?? '-'} · ${form.products.map((item) => item.productName).join(', ') || '-'}`} />
      <Summary label="시작일 / 링크 오픈 시간" value={`${formatDateWithWeekday(form.startDate)} · ${form.linkOpenTime || '미입력'}`} />
      <Summary label="종료일 / 링크 닫는 시간" value={`${formatDateWithWeekday(form.endDate)} · ${form.linkCloseTime || '미입력'}`} />
      <Summary label="정산 예정일" value={`${formatDateWithWeekday(form.settlementDueDate)} · ${form.settlementDueDateOverridden ? '수동' : '자동'}`} />
      <Summary label="발표자 선정일" value={form.events.length ? `${formatDateWithWeekday(form.winnerAnnouncementDate)} · ${form.winnerAnnouncementDateOverride ? '수동' : '자동'}` : '이벤트 없음'} />
      <Summary label="담당 MD" value={appUsers.find((user) => user.id === form.mdId)?.name ?? '-'} />
      <Summary label="담당 매니저" value={appUsers.find((user) => user.id === form.managerId)?.name ?? '-'} />
      <Summary label="판매 링크 유형" value={getSalesChannelTypeLabel(form.salesChannelType)} />
    </div>
    <h4>상품별 제안 조건</h4><ProposalCards form={form} snapshots={snapshots} />
    <h4>이벤트 목록</h4><div className="final-event-list">{form.events.map((event, index) => <article key={event.id}><strong>이벤트 {index + 1}</strong><dl><div><dt>부담 주체</dt><dd>{getEventPayerLabel(event.payer)}</dd></div><div><dt>이벤트 종류</dt><dd>{getCampaignEventTypeLabel(event.eventType)}</dd></div><div><dt>대상 상품</dt><dd>{event.targetProductName || '미입력'}</dd></div><div><dt>제공 상품</dt><dd>{event.rewardProductName || '미입력'}</dd></div><div><dt>수량</dt><dd>{event.plannedQuantity.toLocaleString('ko-KR')}개</dd></div><div><dt>단가</dt><dd>{money(event.rewardUnitPrice)}</dd></div><div><dt>예상 총금액</dt><dd>{money(event.estimatedTotalAmount)}</dd></div></dl></article>)}</div>
    <h4>부담 주체별 이벤트 총액</h4><div className="event-summary-grid"><Summary label="전체 이벤트 수" value={`${form.events.length}개`} /><Summary label="벤더 부담 총액" value={money(summary.vendor)} /><Summary label="셀러 부담 총액" value={money(summary.seller)} /><Summary label="업체 지원 총액" value={money(summary.company_support)} /><Summary label="전체 예상 이벤트 금액" value={money(summary.total)} /><Summary label="발표자 선정일" value={form.events.length ? formatDateWithWeekday(form.winnerAnnouncementDate) : '이벤트 없음'} /></div>
  </section>
}

function HelperModal({ kind, input, preview, onInput, onPreview, onApply, onClose }: { kind: 'notion' | 'ai'; input: string; preview: AiCampaignDraft | null; onInput: (value: string) => void; onPreview: () => void; onApply: () => void; onClose: () => void }) {
  return <div className="nested-modal-backdrop"><section className="helper-modal"><h3>{kind === 'notion' ? 'Notion에서 가져오기 · 준비 중' : 'AI로 일정 초안 만들기 · Mock'}</h3><p>{kind === 'notion' ? '예정 매핑: 셀러, 브랜드, 상품, 기간, 판매 링크, 이벤트. 실제 API Key는 브라우저에 두지 않습니다.' : 'AI 초안 → 사용자 검토 → 상품 마스터 매칭 → 최종 적용 → 저장 순서입니다.'}</p>{kind === 'notion' ? <input placeholder="Notion 페이지 URL 또는 ID" value={input} onChange={(e) => onInput(e.target.value)} /> : <textarea rows={5} placeholder="자연어로 공구 내용을 입력하세요." value={input} onChange={(e) => onInput(e.target.value)} />}<button className="secondary-button" onClick={onPreview}>Mock 미리보기</button>{preview && <div className="helper-preview"><strong>{preview.sellerName} · {preview.brandName}</strong><p>{preview.productNames.join(', ')}</p><p>{formatDateWithWeekday(preview.startDate)} ~ {formatDateWithWeekday(preview.endDate)} · {getSalesChannelTypeLabel(preview.salesChannelType)}</p><p>확인 필요: {preview.unresolvedFields.join(', ')}</p></div>}<div className="button-row"><button className="secondary-button" onClick={onClose}>닫기</button><button className="primary-button" disabled={!preview} onClick={onApply}>검토한 초안 적용</button></div></section></div>
}

function Summary({ label, value }: { label: string; value: string }) {
  return <div><span>{label}</span><strong>{value}</strong></div>
}
