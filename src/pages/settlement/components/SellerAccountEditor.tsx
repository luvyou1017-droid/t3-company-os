import { useRef, useState } from 'react'
import { sanitizeAccountNumberInput } from '../../../shared/utils/accountNumber'

export type AccountDraft = { bankName: string; accountNumber: string; accountHolder: string }

// Keep keystrokes local: the settlement's expensive validation only runs on save.
export function SellerAccountEditor({ initial, onSave }: { initial: AccountDraft; onSave: (value: AccountDraft) => Promise<void> }) {
  const [draft, setDraft] = useState(initial)
  const [saving, setSaving] = useState(false)
  const lock = useRef(false)
  const save = async () => {
    if (lock.current) return
    lock.current = true
    setSaving(true)
    try { await onSave(draft) } finally { lock.current = false; setSaving(false) }
  }
  return <><h2>셀러 지급 계좌 등록</h2><div className="settlement-readiness-form">
    <label className="form-field"><span>은행명</span><input disabled={saving} value={draft.bankName} onChange={event => setDraft({ ...draft, bankName: event.target.value })} /></label>
    <label className="form-field"><span>계좌번호</span><input disabled={saving} inputMode="text" value={draft.accountNumber} onChange={event => setDraft({ ...draft, accountNumber: sanitizeAccountNumberInput(event.target.value) })} /></label>
    <label className="form-field"><span>예금주명</span><input disabled={saving} value={draft.accountHolder} onChange={event => setDraft({ ...draft, accountHolder: event.target.value })} /></label>
  </div><div className="modal-actions"><button type="button" className="primary-button" disabled={saving || !draft.bankName.trim() || !draft.accountNumber.trim() || !draft.accountHolder.trim()} onClick={() => void save()}>{saving ? '저장 중…' : '저장'}</button></div></>
}
