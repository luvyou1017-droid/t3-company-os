import { useRef, useState } from 'react'
import type { AccountDraft } from './SellerAccountEditor'
import { sanitizeAccountNumberInput } from '../../../shared/utils/accountNumber'
import { normalizeManagerAccount } from '../../../shared/services/managerAccountService'

export function ManagerAccountEditor({ initial, onSave, onCancel }: {
  initial: AccountDraft
  onSave: (value: Partial<AccountDraft>) => Promise<void>
  onCancel: () => void
}) {
  const [draft, setDraft] = useState(initial)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const lock = useRef(false)
  async function save() {
    if (lock.current) return
    lock.current = true
    setSaving(true)
    setError('')
    try {
      const normalized = normalizeManagerAccount(draft)
      const baseline = { bankName: initial.bankName.trim(), accountNumber: sanitizeAccountNumberInput(initial.accountNumber), accountHolder: initial.accountHolder.trim() }
      const changes: Partial<AccountDraft> = {}
      for (const key of ['bankName', 'accountNumber', 'accountHolder'] as const) {
        if (normalized[key] !== baseline[key]) changes[key] = normalized[key]
      }
      if (!Object.keys(changes).length) { onCancel(); return }
      await onSave(changes)
    }
    catch (error) { setError(error instanceof Error ? error.message : '계좌 저장에 실패했습니다. 다시 시도해주세요.') }
    finally { lock.current = false; setSaving(false) }
  }
  return <><h2>매니저 계좌 수정</h2><div className="settlement-readiness-form">
    <label className="form-field"><span>은행명</span><input disabled={saving} value={draft.bankName} onChange={event => setDraft(value => ({ ...value, bankName: event.target.value }))} /></label>
    <label className="form-field"><span>계좌번호</span><input disabled={saving} inputMode="text" value={draft.accountNumber} onChange={event => setDraft(value => ({ ...value, accountNumber: event.target.value }))} /></label>
    <label className="form-field"><span>예금주명</span><input disabled={saving} value={draft.accountHolder} onChange={event => setDraft(value => ({ ...value, accountHolder: event.target.value }))} /></label>
  </div>{error && <p role="alert">{error}</p>}<div className="modal-actions">
    <button className="secondary-button" disabled={saving} onClick={onCancel} type="button">취소</button>
    <button className="primary-button" disabled={saving} onClick={() => void save()} type="button">{saving ? '저장 중…' : '저장'}</button>
  </div></>
}
