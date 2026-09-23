import { useState } from 'react'
import type { AppUser } from '../../../shared/data/users'
import type { Settlement } from '../../../shared/types/settlement'
import { campaignService } from '../../../shared/services/campaignService'
import { sellerReceivableService } from '../../../shared/services/sellerReceivableService'
import { eligibleForOffset, financialLocked, receivableBalance, receivableStatuses, type ReceivableStatus } from '../../../shared/utils/sellerReceivable'

const money = (n: number) => `${n.toLocaleString('ko-KR')}원`
export function SellerReceivablePanel({ settlement, user, onSaved }: { settlement: Settlement; user: AppUser; onSaved: (s: Settlement) => void }) {
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')
  const [selected, setSelected] = useState<string[]>([])
  const [amount, setAmount] = useState('')
  const [status, setStatus] = useState<ReceivableStatus>(settlement.sellerReceivable?.status === '상계 완료' ? '미처리' : settlement.sellerReceivable?.status ?? '미처리')
  const [memo, setMemo] = useState('')
  const [invoiceDate, setInvoiceDate] = useState(settlement.sellerReceivable?.invoiceDate ?? '')
  const [receivedDate, setReceivedDate] = useState('')
  const items = sellerReceivableService.getItems()
  const current = items.find(s => s.id === settlement.id) ?? settlement
  const sellerId = campaignService.getCampaignById(current.campaignId)?.sellerId
  const debt = current.sellerReceivable
  const debts = items.filter(s => s.id !== current.id && s.sellerReceivable && s.sellerReceivable.sellerId === sellerId && eligibleForOffset(s.sellerReceivable) && receivableBalance(items, s.sellerReceivable) > 0)
  const targets = items.filter(s => s.id !== current.id && !financialLocked(s) && sellerId && campaignService.getCampaignById(s.campaignId)?.sellerId === sellerId && s.currentCalculation.finalSellerPaymentAmount > 0)
  const title = (s: Settlement) => campaignService.getCampaignById(s.campaignId)?.campaignName ?? s.id
  const run = async (task: () => Promise<Settlement[]>) => {
    setBusy(true); setNotice('')
    try { const next = await task(); const found = next.find(s => s.id === settlement.id); if (found) onSaved(found); setNotice('저장되었습니다.'); setSelected([]) }
    catch (error) { setNotice(error instanceof Error ? error.message : '저장하지 못했습니다. 다시 확인해주세요.') }
    finally { setBusy(false) }
  }
  if (!debt && !debts.length && !current.sellerReceivableOffsets?.length) return null
  return <section className="settlement-panel" aria-label="셀러 미수금 관리" style={{ border: '1px solid #e0d1a8', padding: 20, borderRadius: 12, margin: '16px 0' }}>
    <h3>셀러 미수금 · 상계</h3>
    {notice && <p role="status">{notice}</p>}
    {debt && <>
      <p><strong>미수금 {money(debt.amount)}</strong> · 최초 원금 {money(debt.principal)} · 잔액 {money(receivableBalance(items, debt))} · {debt.status}</p>
      <p>{title(current)} · 발생일 {debt.createdAt.slice(0, 10)}{debt.invoiceAmount !== undefined && ` · 청구금액 ${money(debt.invoiceAmount)}`}{debt.invoiceDate && ` · 계산서 발행 ${debt.invoiceDate}`}{debt.receivedDate && ` · 입금 ${debt.receivedDate}`}</p>
      {receivableBalance(items, debt) > 0 && <details><summary>처리 방식 선택 / 계산서·입금 기록</summary>
        <p>계산서 발행을 선택하면 다음 정산 상계 대상에서 제외됩니다. 실제 계산서 발행은 별도로 진행해주세요.</p>
        <label>처리 상태 <select value={status} onChange={e => setStatus(e.target.value as ReceivableStatus)}>{receivableStatuses.filter(s => s !== '상계 완료').map(s => <option key={s}>{s}</option>)}</select></label>{' '}
        {status === '계산서 발행 완료' && <><label>발행일 <input type="date" value={invoiceDate} onChange={e => setInvoiceDate(e.target.value)} /></label><label>입금일 (입금 확인 시) <input type="date" value={receivedDate} onChange={e => setReceivedDate(e.target.value)} /></label></>}
        <label>관리자 메모 <input value={memo} onChange={e => setMemo(e.target.value)} placeholder="수동 처리 시 사유 필수" /></label>
        <button type="button" className="secondary-button" disabled={busy} onClick={() => { if (window.confirm(`${status}로 처리하시겠습니까?`)) void run(() => sellerReceivableService.setStatus(current.id, status, memo, invoiceDate, receivedDate, user)) }}>처리 저장</button>
      </details>}
      {eligibleForOffset(debt) && receivableBalance(items, debt) > 0 && <details><summary>다른 공구 / 여러 공구 통합 상계</summary>
        <p>동일 셀러의 미확정 정산을 선택하세요. 선택 순서대로 지급 가능액 범위에서 나누어 상계합니다.</p>
        {!targets.length && <p>상계 가능한 미확정 정산이 없습니다. 다음 공구 정산에서 연결할 수 있습니다.</p>}
        {targets.map(s => <label key={s.id} style={{ display: 'block' }}><input type="checkbox" checked={selected.includes(s.id)} onChange={e => setSelected(prev => e.target.checked ? [...prev, s.id] : prev.filter(id => id !== s.id))} /> {title(s)} · 지급 가능액 {money(s.currentCalculation.finalSellerPaymentAmount)}</label>)}
        <label>상계 금액 <input type="number" min="1" step="1" value={amount} onChange={e => setAmount(e.target.value)} placeholder={String(receivableBalance(items, debt))} /></label>
        <button type="button" className="secondary-button" disabled={busy || !selected.length} onClick={() => { const value = amount ? Number(amount) : receivableBalance(items, debt); if (window.confirm(`${selected.length}개 정산에서 총 ${money(value)}을 상계하시겠습니까?`)) void run(() => sellerReceivableService.apply(current.id, selected, value, user)) }}>선택 정산 통합 상계</button>
      </details>}
      <details><summary>미수금 처리 이력</summary><ul>{debt.history.map((h, i) => <li key={i}>{h.at.slice(0, 16).replace('T', ' ')} · {h.action} · {money(h.amount)} · {h.actor} · {h.memo}</li>)}</ul></details>
    </>}
    {debts.length > 0 && <><p><strong>미처리 미수금 {money(debts.reduce((n, s) => n + receivableBalance(items, s.sellerReceivable!), 0))}이 있습니다.</strong></p>
      {debts.map(s => { const value = Math.min(receivableBalance(items, s.sellerReceivable!), Math.floor(current.currentCalculation.finalSellerPaymentAmount)); return <p key={s.id}>{title(s)} · {money(receivableBalance(items, s.sellerReceivable!))}{' '}<button type="button" className="secondary-button" disabled={busy || financialLocked(current) || value <= 0} onClick={() => { if (window.confirm(`이번 정산에서 ${money(value)}을 상계하시겠습니까?`)) void run(() => sellerReceivableService.apply(s.id, [current.id], value, user)) }}>이번 정산에서 상계 ({money(value)})</button></p> })}</>}
    {current.sellerReceivableOffsets?.map(o => <p key={o.id}>적용된 미수금 상계 −{money(o.amount)} · 원정산 {title(items.find(s => s.id === o.sourceSettlementId) ?? current)}{' '}<button type="button" className="secondary-button" disabled={busy || financialLocked(current)} onClick={() => { if (window.confirm('이 상계를 취소하고 미수금 잔액을 복원하시겠습니까?')) void run(() => sellerReceivableService.cancel(current.id, o.id, user)) }}>상계 취소</button></p>)}
  </section>
}
