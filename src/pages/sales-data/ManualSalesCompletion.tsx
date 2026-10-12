import { useState } from 'react'
import { useCompanyAuth } from '../../features/auth/AuthGate'
import { completeSalesManually } from '../../shared/services/manualSalesCompletionService'
import { NumericInput } from '../../shared/components/NumericInput'
import type { SalesDataImport } from '../../shared/types/salesData'

export function ManualSalesCompletion({ item, name, onCompleted }: { item: SalesDataImport; name: string; onCompleted: () => void }) {
  const { profile } = useCompanyAuth()
  const [open, setOpen] = useState(false)
  const [amount, setAmount] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  if (!['ceo', 'admin'].includes(profile.role) || item.settlementStatus === '정산 완료') return null
  async function save() {
    if (amount === '' || busy) return
    setBusy(true); setError('')
    try { await completeSalesManually(item.id, Number(amount)); setOpen(false); onCompleted() }
    catch (e) { setError(e instanceof Error ? e.message : '완료 처리 실패') }
    finally { setBusy(false) }
  }
  return <span onClick={event => event.stopPropagation()}><button className="secondary-button" type="button" onClick={() => setOpen(true)}>강제 완료처리</button>
    {open && <div className="nested-modal-backdrop"><section className="helper-modal" role="dialog" aria-modal="true" aria-label="매출 입력 · 강제 완료처리"><h3>{name} · 강제 완료처리</h3><p>정산·지급이 실제로 끝난 건입니다. 매출만 기록하고 사이트 정산 계산을 생략합니다. 원본 판매행·기존 금액·Snapshot은 보존됩니다.</p><label>확정 매출 (원)<NumericInput value={amount} onChange={event => setAmount(event.target.value)} disabled={busy} /></label><p>완료하면 처리할 목록에서 빠지고 ‘완료 내역’에 수동 완료로 보관됩니다.</p>{error && <p role="alert">{error}</p>}<div className="button-row"><button type="button" disabled={busy} onClick={() => setOpen(false)}>취소</button><button className="primary-button" type="button" disabled={busy || amount === ''} onClick={() => void save()}>{busy ? '서버 저장 중…' : '매출 기록 · 완료 처리'}</button></div></section></div>}
  </span>
}
