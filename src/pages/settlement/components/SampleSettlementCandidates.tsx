import { useEffect, useState } from 'react'
import { sampleTotals, type SampleOrder } from '../../../features/samples/sampleOrderModel'
import { sampleOrderStore } from '../../../features/samples/sampleOrderStore'
import { sampleSettlementCandidate, isLinkedSampleDeduction } from '../../../features/samples/sampleSettlementCandidate'
import { settlementService } from '../../../shared/services/settlementService'
import { cloudSyncService } from '../../../shared/services/cloudSyncService'
import { STORAGE_KEYS } from '../../../shared/services/storageService'
import { formatCurrency } from '../../../shared/utils/salesData'

export function SampleSettlementCandidates({ settlementId, campaignId, canEdit, onApplied }: {
  settlementId: string; campaignId: string; canEdit: boolean; onApplied: () => void
}) {
  const [orders, setOrders] = useState<SampleOrder[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  useEffect(() => {
    let active = true
    setLoading(true)
    void sampleOrderStore.list().then(all => { if (active) setOrders(all.filter(order => order.campaignId === campaignId)) })
      .catch(reason => { if (active) setError(reason instanceof Error ? reason.message : '샘플을 불러오지 못했습니다.') })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [campaignId])
  const deductions = settlementService.getDeductions()
  const activeIds = new Set(settlementService.getSettlements().filter(item => item.status !== 'canceled').map(item => item.id))
  const confirm = async (order: SampleOrder) => {
    if (busy) return
    const candidate = sampleSettlementCandidate(order, campaignId)
    if (!candidate.deduction) return
    const totals = sampleTotals(order)
    if (!window.confirm(`${order.id} 샘플비를 정산에 반영할까요?\n${order.payer === 'seller' ? `셀러 차감 ${formatCurrency(candidate.deduction.amount)} · ` : ''}회사 실제원가 ${formatCurrency(totals.companyCost ?? 0)}${order.payer === 'seller' ? ` · 회사 귀속 차액 ${formatCurrency(totals.difference ?? 0)}` : ''}`)) return
    setBusy(true); setError(''); setNotice('')
    try {
      const latest = (await sampleOrderStore.list()).find(item => item.id === order.id)
      if (!latest || JSON.stringify(latest) !== JSON.stringify(order)) throw new Error('샘플 정보가 변경됐습니다. 샘플관리에서 확인한 뒤 다시 열어주세요.')
      settlementService.addSampleOrderDeduction(settlementId, latest)
      await cloudSyncService.syncKeys([STORAGE_KEYS.settlementDeductions, STORAGE_KEYS.settlements, STORAGE_KEYS.settlementVersions, STORAGE_KEYS.settlementActivityLogs])
      setNotice(`${order.id} 샘플비가 정산 차감·조정내역에 반영됐습니다.`)
      onApplied()
    } catch (reason) { setError(reason instanceof Error ? reason.message : '샘플비를 반영하지 못했습니다.') }
    finally { setBusy(false) }
  }
  return <section className="detail-card settlement-card settlement-page-section" id="sample-settlement-candidates">
    <div className="section-heading"><div><h2>공구 연결 샘플비</h2><p>발주 완료된 샘플의 비용을 확인한 후 정산에 반영합니다.</p></div></div>
    {loading && <p role="status">샘플 요청 확인 중…</p>}
    {error && <p className="danger-text" role="alert">{error}</p>}
    {notice && <p className="mock-notice" role="status">{notice}</p>}
    {!loading && !orders.length && <p>이 공구에 연결된 새 샘플 요청이 없습니다.</p>}
    {!loading && orders.length > 0 && <div className="table-scroll"><table className="data-table"><thead><tr><th>샘플 / 출처</th><th>상태</th><th>회사 실제원가</th><th>셀러 차감 예정</th><th>회사 귀속 차액</th><th>정산 연결</th></tr></thead><tbody>{orders.map(order => {
      const totals = sampleTotals(order)
      const candidate = sampleSettlementCandidate(order, campaignId)
      const linked = deductions.find(item => activeIds.has(item.settlementId) && isLinkedSampleDeduction(item, order.id))
      return <tr key={order.id}><td>{order.productName} · {order.optionName}<small>{order.id}</small></td><td>{order.status}</td><td>{totals.companyCost === null ? '확인 필요' : formatCurrency(totals.companyCost)}</td><td>{order.payer === 'seller' ? totals.sellerDeduction === null ? '확인 필요' : formatCurrency(totals.sellerDeduction) : '해당 없음'}</td><td>{totals.difference === null ? '해당 없음' : formatCurrency(totals.difference)}</td><td>{linked ? linked.reflected ? '반영 완료' : '연결 기록 확인 필요' : candidate.reason ? candidate.reason : canEdit ? <button className="secondary-button" disabled={busy} onClick={() => void confirm(order)} type="button">확인 후 반영</button> : '반영 대기'}</td></tr>
    })}</tbody></table></div>}
  </section>
}
