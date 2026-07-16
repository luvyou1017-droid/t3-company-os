import { useState } from 'react'
import { csCampaigns } from '../../features/cs/mockData'
import {
  calculateCsPriority,
  formatNow,
  generateCsCaseNumber,
  getAttachmentRequirement,
  isIntakeValid,
} from '../../features/cs/csUtils'
import { csService } from '../../features/cs/services/csService'
import type { CsAttachment, CsCase, CsIntakeFormData, CsType } from '../../features/cs/types'
import { CsAttachmentUploader } from './components/CsAttachmentUploader'
import { CsIntakeSuccess } from './components/CsIntakeSuccess'

const initialForm: CsIntakeFormData = {
  customerName: '',
  customerPhone: '',
  productName: '롤링 토트백',
  optionName: '',
  csType: '',
  description: '',
  privacyConsent: false,
  quantity: '',
  purchaseDate: '',
  receivedDate: '',
  desiredResolution: '',
  contactAvailableTime: '',
}

export function PublicCsIntakePage() {
  const campaignCode = 'CAMPAIGN-2026-001'
  const campaign = csCampaigns.find((item) => item.campaignCode === campaignCode)
  const [form, setForm] = useState<CsIntakeFormData>(initialForm)
  const [attachments, setAttachments] = useState<CsAttachment[]>([])
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [createdCase, setCreatedCase] = useState<CsCase | null>(null)

  if (!campaign) {
    return <main className="public-cs-page"><section className="public-card">유효하지 않은 CS 접수 링크입니다.</section></main>
  }

  if (createdCase) {
    return <CsIntakeSuccess csCase={createdCase} onNew={() => setCreatedCase(null)} />
  }

  const attachmentRule = getAttachmentRequirement(form.csType, form.description)
  const update = (key: keyof CsIntakeFormData, value: string | boolean) => setForm({ ...form, [key]: value })

  const submit = () => {
    if (submitting) return
    if (!isIntakeValid(form, attachments)) {
      setError('필수 항목과 개인정보 동의, 문의 유형별 첨부 조건을 확인해주세요.')
      return
    }

    setSubmitting(true)
    const receivedAt = formatNow()
    const caseId = crypto.randomUUID()
    const nextAttachments = attachments.map((attachment) => ({
      ...attachment,
      csCaseId: caseId,
      storagePath: `mock/cs/${caseId}/${attachment.fileName}`,
      previewUrl: attachment.previewUrl,
    }))
    const csCase: CsCase = {
      id: caseId,
      caseNumber: generateCsCaseNumber(csService.listCases().length),
      campaignId: campaign.campaignId,
      campaignCode: campaign.campaignCode,
      campaignName: campaign.campaignName,
      sellerName: campaign.sellerName,
      brandName: campaign.brandName,
      productName: campaign.productName,
      customerName: form.customerName,
      customerPhone: form.customerPhone,
      optionName: form.optionName,
      quantity: form.quantity,
      purchaseDate: form.purchaseDate,
      receivedDate: form.receivedDate,
      csType: form.csType as CsType,
      desiredResolution: form.desiredResolution,
      description: form.description,
      source: 'direct-form',
      status: '신규',
      priority: 'medium',
      assigneeId: 'u-002',
      assigneeName: '허수정',
      receivedAt,
      dueAt: '2026.07.16 14:12',
      privacyConsent: form.privacyConsent,
      attachments: nextAttachments,
      activityLogs: [
        { id: crypto.randomUUID(), at: receivedAt, actor: 'customer', action: 'CS 접수', memo: '외부 고객 CS 폼으로 접수되었습니다.' },
        { id: crypto.randomUUID(), at: receivedAt, actor: 'system', action: '담당자 자동 배정', after: '허수정', memo: '자사 링크 CS 규칙으로 자동 배정했습니다.' },
        { id: crypto.randomUUID(), at: receivedAt, actor: 'system', action: '첨부 등록', memo: `첨부 ${nextAttachments.length}개가 등록되었습니다.` },
      ],
    }
    const finalCase = { ...csCase, priority: calculateCsPriority(csCase) }
    csService.createCase(finalCase)
    setCreatedCase(finalCase)
    setSubmitting(false)
  }

  return (
    <main className="public-cs-page">
      <section className="public-cs-hero">
        <h1>T3 고객지원</h1>
        <p>주문하신 상품에 문제가 있으신가요? 문제 상황을 확인할 수 있도록 내용을 작성하고 사진이나 영상을 첨부해주세요.</p>
        <strong>현재 화면은 개발용 프로토타입입니다. 실제 고객 개인정보를 입력하지 마세요.</strong>
      </section>
      <section className="public-card">
        <h3>공동구매 정보</h3>
        <dl className="public-info-grid">
          <div><dt>공동구매명</dt><dd>{campaign.campaignName}</dd></div>
          <div><dt>셀러명</dt><dd>{campaign.sellerName}</dd></div>
          <div><dt>브랜드명</dt><dd>{campaign.brandName}</dd></div>
          <div><dt>상품명</dt><dd>{campaign.productName}</dd></div>
          <div><dt>진행 기간</dt><dd>{campaign.period}</dd></div>
          <div><dt>고객지원 담당 회사</dt><dd>{campaign.supportCompany}</dd></div>
        </dl>
      </section>
      <section className="public-card">
        <h3>문의 내용</h3>
        <div className="public-form-grid">
          <label><span>고객명 *</span><input value={form.customerName} onChange={(event) => update('customerName', event.target.value)} /></label>
          <label><span>연락처 *</span><input value={form.customerPhone} onChange={(event) => update('customerPhone', event.target.value.replace(/[^\d-]/g, ''))} placeholder="010-0000-0000" /></label>
          <label><span>상품명 *</span><input value={form.productName} onChange={(event) => update('productName', event.target.value)} /></label>
          <label><span>옵션명 *</span><input value={form.optionName} onChange={(event) => update('optionName', event.target.value)} /></label>
          <label><span>문의 유형 *</span><select value={form.csType} onChange={(event) => update('csType', event.target.value)}><option value="">선택</option>{['불량·교환','배송 누락','오발송','배송 지연','반품·환불','상품 문의','기타'].map((item) => <option key={item}>{item}</option>)}</select></label>
          <label><span>수량</span><input value={form.quantity} onChange={(event) => update('quantity', event.target.value)} /></label>
          <label><span>구매일</span><input type="date" value={form.purchaseDate} onChange={(event) => update('purchaseDate', event.target.value)} /></label>
          <label><span>수령일</span><input type="date" value={form.receivedDate} onChange={(event) => update('receivedDate', event.target.value)} /></label>
          <label><span>원하는 처리 방식</span><select value={form.desiredResolution} onChange={(event) => update('desiredResolution', event.target.value)}><option value="">선택</option>{['교환','재발송','환불','답변만 필요','담당자 확인 후 결정'].map((item) => <option key={item}>{item}</option>)}</select></label>
          <label><span>추가 연락 가능 시간</span><input value={form.contactAvailableTime} onChange={(event) => update('contactAvailableTime', event.target.value)} /></label>
          <label className="public-form-grid__full"><span>상세 내용 *</span><textarea value={form.description} onChange={(event) => update('description', event.target.value)} /></label>
        </div>
        <p className="attachment-guide">{attachmentRule.guide}</p>
        <p className="attachment-guide">제품 작동 문제나 소리, 움직임과 관련된 문제는 영상으로 첨부해주세요.</p>
      </section>
      <CsAttachmentUploader attachments={attachments} error={error} onChange={setAttachments} onError={setError} />
      <section className="public-card">
        <label className="privacy-consent"><input checked={form.privacyConsent} onChange={(event) => update('privacyConsent', event.target.checked)} type="checkbox" /> 입력하신 정보는 CS 접수 및 처리 목적으로만 사용되며, 처리 완료 후 회사 정책에 따라 보관 또는 삭제됩니다.</label>
        {error && <p className="form-error">{error}</p>}
        <button className="primary-button public-submit" disabled={submitting} onClick={submit} type="button">
          {submitting ? '접수 중입니다' : 'CS 접수하기'}
        </button>
      </section>
    </main>
  )
}
