import { useEffect, useState } from 'react'
import { appUsers, DEFAULT_MD_USER_ID, DEFAULT_OPERATOR_USER_ID } from '../../../shared/data/users'
import { campaignService, type CampaignCreateInput, type CampaignCreateValidationErrors } from '../../../shared/services/campaignService'
import { STORAGE_KEYS, storageService } from '../../../shared/services/storageService'
import type { Campaign } from '../../../shared/types/campaign'

type CreateCampaignModalProps = {
  onClose: () => void
  onCreated: (campaign: Campaign) => void
}

const emptyForm: CampaignCreateInput = {
  campaignName: '',
  sellerName: '',
  brandName: '',
  productName: '',
  managerId: '',
  mdId: DEFAULT_MD_USER_ID,
  startDate: '',
  endDate: '',
  linkOwner: 'company',
  businessType: 'corporation',
  totalCommissionRate: 0,
  sellerCommissionRate: 0,
  settlementDueDate: '',
  landingPageType: '',
  memo: '',
}

const managers = appUsers.filter((user) => ['대표', '팀장', '매니저'].includes(user.role))
const mds = appUsers.filter((user) => user.role === 'MD')
const operators = appUsers.filter((user) => user.role === '정산 담당자')

function getDraft() {
  return storageService.getItem<CampaignCreateInput | null>(STORAGE_KEYS.campaignCreateDraft, null)
}

function FieldError({ message }: { message?: string }) {
  if (!message) return null
  return <p className="field-error">{message}</p>
}

export function CreateCampaignModal({ onClose, onCreated }: CreateCampaignModalProps) {
  const [form, setForm] = useState<CampaignCreateInput>(emptyForm)
  const [errors, setErrors] = useState<CampaignCreateValidationErrors>({})
  const [draftPrompt, setDraftPrompt] = useState(false)
  const [draftRestored, setDraftRestored] = useState(false)
  const [notice, setNotice] = useState('')

  useEffect(() => {
    if (getDraft()) setDraftPrompt(true)
  }, [])

  const update = <Key extends keyof CampaignCreateInput>(key: Key, value: CampaignCreateInput[Key]) => {
    setForm((current) => ({ ...current, [key]: value }))
    setErrors((current) => ({ ...current, [key]: undefined }))
  }

  const restoreDraft = () => {
    const draft = getDraft()
    if (draft) {
      setForm(draft)
      setDraftRestored(true)
    }
    setDraftPrompt(false)
  }

  const discardDraft = () => {
    storageService.removeItem(STORAGE_KEYS.campaignCreateDraft)
    setDraftPrompt(false)
  }

  const saveDraft = () => {
    storageService.setItem(STORAGE_KEYS.campaignCreateDraft, form)
    setNotice('임시저장되었습니다. 다음에 모달을 열면 복구할 수 있습니다.')
  }

  const closeWithGuard = () => {
    const hasDraftableValue = Object.entries(form).some(([key, value]) => {
      if (key === 'mdId' || key === 'linkOwner' || key === 'businessType') return false
      return Boolean(value)
    })
    if (!hasDraftableValue || window.confirm('작성 중인 내용이 있습니다. 닫으시겠습니까?')) {
      onClose()
    }
  }

  const submit = () => {
    const nextErrors = campaignService.validateCampaign(form)
    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors)
      setNotice('필수값과 수수료 기준을 확인해주세요.')
      return
    }

    const result = campaignService.createCampaign(form)
    if (!result.campaign) {
      setErrors(result.errors)
      setNotice('등록할 수 없습니다. 입력값을 다시 확인해주세요.')
      return
    }

    onCreated(result.campaign)
  }

  return (
    <div className="campaign-create-backdrop" role="presentation">
      <section aria-modal="true" className="campaign-create-modal" role="dialog">
        <div className="campaign-create-modal__header">
          <div>
            <p className="page-eyebrow">Campaign Create</p>
            <h2>새 일정 등록</h2>
            <p>Campaign 생성과 동시에 체크리스트, My Work, 알림을 자동 생성합니다.</p>
          </div>
          <button aria-label="닫기" className="icon-button" onClick={closeWithGuard} type="button">×</button>
        </div>

        {draftPrompt && (
          <div className="draft-restore-box" role="status">
            <div>
              <strong>임시저장된 작성 내용이 있습니다.</strong>
              <p>이전 작성 내용을 복구할까요?</p>
            </div>
            <div className="draft-restore-box__actions">
              <button className="secondary-button" onClick={discardDraft} type="button">새로 작성</button>
              <button className="secondary-button" onClick={restoreDraft} type="button">복구</button>
            </div>
          </div>
        )}

        {draftRestored && <div className="inline-notice" role="status"><span>임시저장 내용을 복구했습니다.</span></div>}
        {notice && <div className="inline-notice" role="status"><span>{notice}</span></div>}

        <div className="campaign-create-form">
          <section className="campaign-create-section">
            <h3>1. 기본 정보</h3>
            <div className="campaign-create-grid">
              <label>
                <span>공동구매명 *</span>
                <input value={form.campaignName} onChange={(event) => update('campaignName', event.target.value)} />
                <FieldError message={errors.campaignName} />
              </label>
              <label>
                <span>셀러 *</span>
                <input value={form.sellerName} onChange={(event) => update('sellerName', event.target.value)} />
                <FieldError message={errors.sellerName} />
              </label>
              <label>
                <span>브랜드 *</span>
                <input value={form.brandName} onChange={(event) => update('brandName', event.target.value)} />
                <FieldError message={errors.brandName} />
              </label>
              <label>
                <span>상품 *</span>
                <input value={form.productName} onChange={(event) => update('productName', event.target.value)} />
                <FieldError message={errors.productName} />
              </label>
            </div>
          </section>

          <section className="campaign-create-section">
            <h3>2. 담당자</h3>
            <div className="campaign-create-grid">
              <label>
                <span>담당 매니저 *</span>
                <select value={form.managerId} onChange={(event) => update('managerId', event.target.value)}>
                  <option value="">선택</option>
                  {managers.map((user) => <option key={user.id} value={user.id}>{user.name}</option>)}
                </select>
                <FieldError message={errors.managerId} />
              </label>
              <label>
                <span>MD *</span>
                <select value={form.mdId} onChange={(event) => update('mdId', event.target.value)}>
                  {mds.map((user) => <option key={user.id} value={user.id}>{user.name}</option>)}
                </select>
                <FieldError message={errors.mdId} />
              </label>
              <label>
                <span>정산·CS 담당</span>
                <select disabled value={DEFAULT_OPERATOR_USER_ID}>
                  {operators.map((user) => <option key={user.id} value={user.id}>{user.name}</option>)}
                </select>
              </label>
            </div>
          </section>

          <section className="campaign-create-section">
            <h3>3. 판매 일정</h3>
            <div className="campaign-create-grid">
              <label>
                <span>시작일 *</span>
                <input type="date" value={form.startDate} onChange={(event) => update('startDate', event.target.value)} />
                <FieldError message={errors.startDate} />
              </label>
              <label>
                <span>종료일 *</span>
                <input type="date" value={form.endDate} onChange={(event) => update('endDate', event.target.value)} />
                <FieldError message={errors.endDate} />
              </label>
              <label>
                <span>정산 예정일</span>
                <input type="date" value={form.settlementDueDate} onChange={(event) => update('settlementDueDate', event.target.value)} />
              </label>
            </div>
          </section>

          <section className="campaign-create-section">
            <h3>4. 링크 및 사업자</h3>
            <div className="campaign-create-grid">
              <label>
                <span>링크 주체 *</span>
                <select value={form.linkOwner} onChange={(event) => update('linkOwner', event.target.value as CampaignCreateInput['linkOwner'])}>
                  <option value="company">자사 링크</option>
                  <option value="brand">브랜드사 링크</option>
                  <option value="seller">셀러 링크</option>
                </select>
                <FieldError message={errors.linkOwner} />
              </label>
              <label>
                <span>사업자 유형 *</span>
                <select value={form.businessType} onChange={(event) => update('businessType', event.target.value as CampaignCreateInput['businessType'])}>
                  <option value="corporation">법인</option>
                  <option value="sole_proprietor">개인사업자</option>
                  <option value="freelancer">프리랜서</option>
                </select>
                <FieldError message={errors.businessType} />
              </label>
              <label>
                <span>랜딩페이지 유형</span>
                <select value={form.landingPageType} onChange={(event) => update('landingPageType', event.target.value)}>
                  <option value="">미정</option>
                  <option value="internal">자사 상세페이지</option>
                  <option value="brand">브랜드 상세페이지</option>
                  <option value="seller">셀러 제공 페이지</option>
                </select>
              </label>
            </div>
          </section>

          <section className="campaign-create-section">
            <h3>5. 수수료</h3>
            <div className="campaign-create-grid">
              <label>
                <span>총수수료율 * · VAT 포함</span>
                <input min="0" max="100" step="0.1" type="number" value={form.totalCommissionRate || ''} onChange={(event) => update('totalCommissionRate', Number(event.target.value))} />
                <FieldError message={errors.totalCommissionRate} />
              </label>
              <label>
                <span>셀러 수수료율 * · VAT 포함</span>
                <input min="0" max="100" step="0.1" type="number" value={form.sellerCommissionRate || ''} onChange={(event) => update('sellerCommissionRate', Number(event.target.value))} />
                <FieldError message={errors.sellerCommissionRate} />
              </label>
            </div>
          </section>

          <section className="campaign-create-section">
            <h3>6. 정산</h3>
            <p className="muted-text">모든 금액은 부가세 포함 기준입니다. 총수수료율은 셀러 수수료율 이상이어야 합니다.</p>
          </section>

          <section className="campaign-create-section">
            <h3>7. 메모</h3>
            <label>
              <span>메모</span>
              <textarea rows={4} value={form.memo} onChange={(event) => update('memo', event.target.value)} />
            </label>
          </section>
        </div>

        <div className="campaign-create-modal__actions">
          <button className="secondary-button" onClick={closeWithGuard} type="button">취소</button>
          <button className="secondary-button" onClick={saveDraft} type="button">임시저장</button>
          <button className="primary-button" onClick={submit} type="button">일정 등록</button>
        </div>
      </section>
    </div>
  )
}
