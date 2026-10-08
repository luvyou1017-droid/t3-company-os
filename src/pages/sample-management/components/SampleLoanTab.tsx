import { useState } from 'react'
import type { SampleOrder } from '../../../features/samples/sampleOrderModel'
import { collectionDue, itemNeedsCollection, sampleItems, itemLoanOrder } from '../../../features/samples/sampleProvision'
import { campaignService } from '../../../shared/services/campaignService'
import { useCompanyAuth } from '../../../features/auth/AuthGate'
import { sampleReturnMessage } from '../../../features/samples/sampleReturnMessage'
export function SampleLoanTab({ orders, onOpen }: { orders: SampleOrder[]; onOpen: (id:string) => void }) {
  const [status,setStatus] = useState('')
  const [copyNotice, setCopyNotice] = useState('')
  const [copyFallback, setCopyFallback] = useState('')
  const copyReturn = async (id: string) => {
    const order = orders.find(item => item.id === id)
    const message = order ? sampleReturnMessage(order) : ''
    if (!message) return
    setCopyNotice(''); setCopyFallback('')
    try { await navigator.clipboard.writeText(message); setCopyNotice('회수 요청 메시지를 복사했습니다. 이 요청의 미반납 대여 품목과 수량이 포함됩니다.') }
    catch { setCopyFallback(message); setCopyNotice('자동 복사가 제한되었습니다. 아래 메시지를 선택해서 복사해주세요.') }
  }
  const {profile} = useCompanyAuth()
  const campaigns = campaignService.getCampaigns()
  const loans = orders.filter(o => o.status !== '취소').flatMap(o=>sampleItems(o).filter(item=>item.provision?.method === '대여').map(item=>({...itemLoanOrder(o,item.itemId),itemId:item.itemId,productName:item.productName,optionName:item.optionName,quantity:item.quantity,additionalItems:[]})))
  const alerts = loans.filter(o => (o.managerId === profile.id || o.managerName === profile.display_name) && itemNeedsCollection(o,campaigns.find(c => c.id === o.campaignId),new Date().toLocaleDateString('sv-SE',{timeZone:'Asia/Seoul'})))
  return <section><h3>대여 회수</h3><p>회수 요청 메시지는 같은 요청의 미반납 대여 품목 전체와 SKU별 수량을 포함합니다.</p>{copyNotice && <p role="status">{copyNotice}</p>}{copyFallback && <label>회수 요청 메시지<textarea readOnly rows={8} value={copyFallback} onFocus={event => event.currentTarget.select()} /></label>}{alerts.length > 0 && <div role="status" className="sample-collection-alert">샘플 수거 필요 · {alerts.map(o => <button key={o.itemId} type="button" onClick={() => onOpen(o.id)}>{o.sellerName} · {o.productName}</button>)}</div>}<label>회수상태<select value={status} onChange={e => setStatus(e.target.value)}><option value="">전체</option>{['반납 대기','수거 필요','수거 중','반납 완료','분실/파손'].map(v => <option key={v}>{v}</option>)}</select></label><div className="sample-order-table-wrap"><table className="sample-order-table sample-loan-table"><thead><tr>{['셀러','상품/SKU','공구명','담당 매니저','발송일','공구 종료일','수거 예정일','현재 회수상태','배송/회수 메모','관리'].map(v => <th key={v}>{v}</th>)}</tr></thead><tbody>{loans.map(o => { const c = campaigns.find(c => c.id === o.campaignId); const current = itemNeedsCollection(o,c,new Date().toLocaleDateString('sv-SE',{timeZone:'Asia/Seoul'})) && !['수거 중','반납 완료','분실/파손'].includes(o.operations?.loanStatus ?? '') ? '수거 필요' : o.operations?.loanStatus ?? '대여 요청'; return !status || status === current ? <tr key={o.itemId}><td>{o.sellerName}</td><td>{o.productName} · {o.optionName} · {o.quantity}개</td><td>{o.campaignName || '미연결'}</td><td>{o.managerName}</td><td>{o.operations?.shippedAt || '—'}</td><td>{c?.endDate || '—'}</td><td>{o.operations?.collectionDate || collectionDue(o,c) || '공구 연결 후 계산'}</td><td>{current}</td><td>{o.operations?.collectionMemo || o.deliveryMemo}</td><td><button type="button" className="secondary-button" onClick={() => onOpen(o.id)}>관리</button><button type="button" className="secondary-button" disabled={['반납 완료','분실/파손'].includes(o.operations?.loanStatus ?? '') || !sampleReturnMessage(orders.find(item => item.id === o.id)!)} onClick={() => void copyReturn(o.id)}>회수 요청 메시지 복사</button></td></tr> : null })}</tbody></table></div></section>
}
