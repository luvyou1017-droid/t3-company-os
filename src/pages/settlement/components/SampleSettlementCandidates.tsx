import { provisionTotal, sampleItems } from '../../../features/samples/sampleProvision'
import { useEffect, useState } from 'react'
import { sampleTotals, type SampleOrder } from '../../../features/samples/sampleOrderModel'
import { sampleOrderStore } from '../../../features/samples/sampleOrderStore'
import { sampleSettlementCandidates, isLinkedSampleDeduction } from '../../../features/samples/sampleSettlementCandidate'
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
    void sampleOrderStore.list().then(all => { if (active) setOrders(all.filter(order => order.campaignId === campaignId && (order.itemConditionsVersion === 2 ? sampleItems(order).some(item => !['무상 제공', '대여'].includes(item.provision?.method ?? '')) : !['무상 제공', '대여'].includes(order.provision?.method ?? '') && !order.operations?.offsetCompleted))) })
      .catch(reason => { if (active) setError(reason instanceof Error ? reason.message : '샘플을 불러오지 못했습니다.') })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [campaignId])
  const deductions = settlementService.getDeductions()
  const activeIds = new Set(settlementService.getSettlements().filter(item => item.status !== 'canceled').map(item => item.id))
  const confirm = async (order: SampleOrder) => {
    if (busy) return
    const candidate = sampleSettlementCandidates(order, campaignId, settlementService.getSettlementById(settlementId)?.currentCalculation.grossSales)
    if (!candidate.deductions.length) return
    if (!window.confirm(`${order.id} 샘플 비용을 정산에 반영할까요?\n${candidate.deductions.map(item => `${item.title}: ${formatCurrency(item.amount)}`).join('\n')}`)) return
    setBusy(true); setError(''); setNotice('')
    try {
      const latest = (await sampleOrderStore.list()).find(item => item.id === order.id)
      if (!latest || JSON.stringify(latest) !== JSON.stringify(order)) throw new Error('샘플 정보가 변경됐습니다. 샘플관리에서 확인한 뒤 다시 열어주세요.')
      settlementService.addSampleOrderDeduction(settlementId, latest, true)
      const claimed = await sampleOrderStore.claimSettlement(order.id,settlementId,latest)
      settlementService.addSampleOrderDeduction(settlementId, claimed)
      setOrders(items => items.map(item => item.id === claimed.id ? claimed : item))
      await cloudSyncService.syncKeys([STORAGE_KEYS.settlementDeductions, STORAGE_KEYS.settlements, STORAGE_KEYS.settlementVersions, STORAGE_KEYS.settlementActivityLogs])
      setOrders((await sampleOrderStore.completeSettlementClaim(order.id,settlementId)).filter(item => item.campaignId === campaignId))
      setNotice(`${order.id} 샘플비가 정산 차감·조정내역에 반영됐습니다.`)
      onApplied()
    } catch (reason) { setError(reason instanceof Error ? reason.message : '샘플비를 반영하지 못했습니다. 반영 요청 기록이 있으면 실제 정산 저장 여부를 먼저 확인해주세요.') }
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
      const cost = order.provision ? provisionTotal(order) : totals.companyCost
      const candidate = sampleSettlementCandidates(order, campaignId, settlementService.getSettlementById(settlementId)?.currentCalculation.grossSales)
      const linked = deductions.find(item => activeIds.has(item.settlementId) && isLinkedSampleDeduction(item, order.id))
      return <tr key={order.id}><td>{order.productName} · {order.optionName}<small>{order.id}</small></td><td>{order.status}</td><td>{cost === null ? '확인 필요' : formatCurrency(cost)}</td><td>{formatCurrency(candidate.deductions.filter(d => d.costOwner === 'seller').reduce((sum,d) => sum + d.amount,0))}</td><td>{order.provision || totals.difference === null ? '해당 없음' : formatCurrency(totals.difference)}</td><td>{linked ? linked.reflected && (!order.settlementClaim || order.settlementClaim.committedAt) ? '반영 완료' : '연결 기록 확인 필요' : order.settlementClaim ? '반영 요청됨 · 저장 기록 확인 필요' : candidate.reason ? candidate.reason : canEdit ? <button className="secondary-button" disabled={busy} onClick={() => void confirm(order)} type="button">확인 후 반영</button> : '반영 대기'}</td></tr>
    })}</tbody></table></div>}
  </section>
}
