import { useEffect, useRef, useState } from 'react'
import type { Campaign } from '../../shared/types/campaign'
import type { SampleOrder } from '../../features/samples/sampleOrderModel'
import { sampleOrderStore } from '../../features/samples/sampleOrderStore'
import { sampleItems } from '../../features/samples/sampleProvision'
import { unlinkedSampleCandidates } from '../../features/samples/sampleCampaignLink'
import { sampleSettlementCandidates } from '../../features/samples/sampleSettlementCandidate'
import { campaignService } from '../../shared/services/campaignService'
import { settlementService } from '../../shared/services/settlementService'
import type { Settlement } from '../../shared/types/settlement'
import { storageService, STORAGE_KEYS } from '../../shared/services/storageService'

export function SampleCampaignLinks({ campaign, locked, disabled }: { campaign: Campaign; locked: boolean; disabled: boolean }) {
  const [orders, setOrders] = useState<SampleOrder[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const lock = useRef(false)
  const settlements = storageService.getItem<Settlement[]>(STORAGE_KEYS.settlements, [])
  const campaignLocked = locked || settlements.some(item => item.campaignId === campaign.id && item.status !== 'canceled' && settlementService.isSettlementConfirmed(item))
  useEffect(() => {
    let active = true
    void sampleOrderStore.list().then(result => { if (active) setOrders(result) })
      .catch(reason => { if (active) setError(reason instanceof Error ? reason.message : '샘플을 불러오지 못했습니다.') })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [campaign.id])
  const refresh = async () => {
    setLoading(true); setError('')
    try { setOrders(await sampleOrderStore.list()) }
    catch (reason) { setError(reason instanceof Error ? reason.message : '샘플을 불러오지 못했습니다.') }
    finally { setLoading(false) }
  }
  const connect = async (order: SampleOrder) => {
    if (lock.current || campaignLocked || disabled) return
    if (!window.confirm(`${order.sellerName}의 샘플 요청을 ${campaign.campaignName}에 연결할까요?\n${sampleItems(order).map(item => `${item.productName} · ${item.optionName} ${item.quantity}개`).join('\n')}\n이 요청의 모든 품목이 연결됩니다. 제공조건과 배송정보는 유지되며 정산 차감은 별도로 확인합니다.`)) return
    lock.current = true; setBusy(true); setError(''); setNotice('')
    try {
      const currentCampaign = campaignService.getCampaignById(campaign.id)
      if (!currentCampaign) throw new Error('공구를 다시 확인해주세요.')
      setOrders(await sampleOrderStore.connectCampaign(order.id, currentCampaign, order.history.length))
      setNotice('샘플을 연결했습니다. 정산서의 공구 연결 샘플비에서 확인 후 반영할 수 있습니다. 대여는 회수 관리에 연결됩니다.')
    } catch (reason) { setError(reason instanceof Error ? reason.message : '샘플을 연결하지 못했습니다.') }
    finally { lock.current = false; setBusy(false) }
  }
  const candidates = unlinkedSampleCandidates(orders, campaign)
  const connected = orders.filter(order => order.campaignId === campaign.id)
  return <section className="sales-supply-notice" aria-label="일정 없이 요청한 샘플 연결">
    <div className="section-heading"><h3>일정 없이 요청한 샘플 연결</h3><button className="secondary-button" type="button" disabled={loading || busy} onClick={() => void refresh()}>샘플 새로고침</button></div>
    <p>같은 셀러의 미연결 샘플입니다. 동일 상품을 우선 추천합니다. 연결만으로 비용을 차감하지 않습니다.</p>
    {campaignLocked && <p>확정된 정산이 있는 공구는 새 샘플을 연결할 수 없습니다. 기존 정산 Snapshot은 유지됩니다.</p>}
    {loading && <p role="status">샘플 확인 중…</p>}
    {error && <p className="danger-text" role="alert">{error}</p>}
    {notice && <p role="status">{notice}</p>}
    {!loading && !error && !candidates.length && <p>연결 가능한 미연결 샘플이 없습니다.</p>}
    {!loading && candidates.length > 0 && <div className="table-scroll"><table className="data-table"><thead><tr><th>샘플 요청</th><th>품목 / 제공 방식</th><th>추천 / 상태</th><th>공구 연결</th></tr></thead><tbody>{candidates.map(({ order, productMatch, blockReason }) => <tr key={order.id}>
      <td><a href={`/samples?sampleId=${encodeURIComponent(order.id)}`}>{order.id}</a><small>{order.sellerName} · {order.purpose}</small></td>
      <td>{sampleItems(order).map(item => <div key={item.itemId}>{item.productName} · {item.optionName} · {item.quantity}개 · {item.provision?.method ?? '기존 요청 조건'}</div>)}</td>
      <td>{productMatch ? '동일 상품 추천' : '상품 연결 확인 필요'}<small>{order.status}</small>{blockReason && <small>{blockReason}</small>}</td>
      <td><button className="secondary-button" type="button" disabled={campaignLocked || disabled || busy || !!blockReason} onClick={() => void connect(order)}>이 공구에 연결</button></td>
    </tr>)}</tbody></table></div>}
    {connected.length > 0 && <div><h4>현재 공구에 연결된 샘플</h4>{connected.map(order => {
      const settlement = settlements.find(item => item.campaignId === campaign.id && item.status !== 'canceled')
      const candidate = sampleSettlementCandidates(order, campaign.id, settlement?.currentCalculation.grossSales)
      return <p key={order.id}><a href={`/samples?sampleId=${encodeURIComponent(order.id)}`}>{order.id}</a> · {sampleItems(order).map(item => `${item.optionName} (${item.provision?.method ?? '기존 조건'})`).join(' / ')} · {order.settlementClaim?.committedAt ? '정산 반영 완료' : order.settlementClaim ? '정산 저장 기록 확인 필요' : candidate.reason || '정산서에서 확인 후 반영'}</p>
    })}</div>}
  </section>
}
