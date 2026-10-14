import { useState } from 'react'
import { previewBatchSettlementConfirmations, submitBatchSettlementConfirmations, type ConfirmationCandidate } from '../../../shared/services/batchSettlementConfirmationService'
import { campaignService } from '../../../shared/services/campaignService'
import { settlementService } from '../../../shared/services/settlementService'

export function BatchSettlementConfirmButton({ ids, confirmedBy, onSaved, onOpenDetail }: { ids: string[]; confirmedBy: string; onSaved: () => void; onOpenDetail: (id: string) => void }) {
  const [preview, setPreview] = useState<ConfirmationCandidate[] | null>(null)
  const [confirmed, setConfirmed] = useState(false)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')
  const selectedIds = [...new Set(ids)]
  const ready = preview?.filter(item => !item.reason) ?? []
  const review = () => {
    setConfirmed(false); setNotice('')
    setPreview(previewBatchSettlementConfirmations(selectedIds, confirmedBy))
  }
  const submit = async () => {
    if (!preview || !confirmed || busy) return
    setBusy(true); setNotice('')
    try {
      const count = await submitBatchSettlementConfirmations(preview, confirmedBy)
      setPreview(null); setConfirmed(false); setNotice(`${count}건 정산서를 확정했습니다. 지급 대상과 금액을 다시 확인한 뒤 지급신청해주세요.`)
      onSaved()
    } catch (error) {
      setPreview(null); setConfirmed(false)
      setNotice(error instanceof Error ? error.message : '정산서 확정 실패')
      onSaved()
    } finally { setBusy(false) }
  }
  return <div className="no-print">
    <button className="secondary-button" type="button" disabled={!selectedIds.length || busy} onClick={review}>선택 건 일괄 정산서 확정</button>
    {notice && <p role="status">{notice}</p>}
    {preview && <div className="settlement-modal-backdrop"><section role="dialog" aria-modal="true" aria-label="선택 건 일괄 정산서 확정" className="settlement-readiness-modal">
      <h2>선택 건 일괄 정산서 확정</h2>
      <p>선택 공구 {preview.length}건 · 확정 가능 {ready.length}건 · 개별 확인 {preview.length - ready.length}건</p>
      <p>확정된 계산 결과는 정산 Snapshot으로 보존됩니다. 확인이 필요한 건은 확정하지 않습니다.</p>
      <div className="responsive-table" style={{maxHeight:'45vh',overflow:'auto'}}><table><thead><tr><th>공구</th><th>확인 결과</th></tr></thead><tbody>{preview.map(item => <tr key={item.id}><td>{campaignService.getCampaignById(settlementService.getSettlementById(item.id)?.campaignId ?? '')?.campaignName ?? item.id}</td><td>{item.reason ? <>{item.reason} <button className="secondary-button" type="button" onClick={() => { setPreview(null); onOpenDetail(item.id) }}>개별 확인</button></> : '확정 가능'}</td></tr>)}</tbody></table></div>
      <label><input type="checkbox" checked={confirmed} disabled={busy} onChange={event => setConfirmed(event.target.checked)} /> 확정 가능한 정산서의 계산 결과를 확인했습니다.</label>
      <div className="action-row"><button type="button" className="secondary-button" disabled={busy} onClick={() => setPreview(null)}>닫기</button><button type="button" className="primary-button" disabled={busy || !confirmed || !ready.length} onClick={() => void submit()}>{busy ? '저장 중…' : `${ready.length}건 정산서 확정`}</button></div>
    </section></div>}
  </div>
}
