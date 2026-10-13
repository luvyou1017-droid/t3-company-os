import { useEffect, useState } from 'react'
import { previewBatchPaymentRequests, submitBatchPaymentRequests, type BatchRequestPreview, type BatchRequestTarget } from '../../../shared/services/paymentBatchRequestService'
import { formatCurrency } from '../../../shared/utils/salesData'

export function BatchPaymentRequestButton({ids,onSaved,onOpenDetail,target}:{ids:string[];onSaved:()=>void;onOpenDetail:(id:string)=>void;target:BatchRequestTarget}) {
  const [preview,setPreview]=useState<BatchRequestPreview|null>(null)
  const [busy,setBusy]=useState(false)
  const [notice,setNotice]=useState('')
  const [confirmed,setConfirmed]=useState(false)
  const selection=ids.join(',')
  useEffect(()=>{setPreview(null);setConfirmed(false)},[selection,target])
  async function review() {
    setBusy(true);setNotice('');setConfirmed(false)
    try { setPreview(await previewBatchPaymentRequests(ids,target)) }
    catch(e){setNotice(e instanceof Error?e.message:'일괄 확인 실패')}
    finally{setBusy(false)}
  }
  async function submit() {
    if(!preview || !confirmed || busy)return
    setBusy(true)
    try { const count=await submitBatchPaymentRequests(preview);setPreview(null);setNotice(`${count}건 지급신청을 운영 서버에 저장했습니다.`);onSaved() }
    catch(e){setNotice(e instanceof Error?e.message:'신청 실패');setPreview(null);setConfirmed(false)}
    finally{setBusy(false)}
  }
  const ready=preview?.items.filter(item=>!item.reason) ?? []
  return <div className="no-print">
    <div className="action-row"><span>선택 {ids.length}건 · {target==='both'?'셀러 + 매니저':target==='seller'?'셀러':'매니저'} 신청</span><button type="button" className="primary-button" disabled={!ids.length || busy} onClick={()=>void review()}>{busy?'확인 중…':'선택 건 일괄 지급신청'}</button></div>
    {notice && <p role="status">{notice}</p>}
    {preview && <div className="settlement-modal-backdrop"><section role="dialog" aria-modal="true" aria-label="선택 건 일괄 지급신청" className="settlement-readiness-modal">
      <h2>선택 건 일괄 지급신청</h2><p>신청 가능 {ready.length}건 · 총 {formatCurrency(ready.reduce((sum,item)=>sum+item.amount,0))} · 제외 {preview.items.length-ready.length}건</p>
      <p>기존 증빙과 등록 계좌를 사용합니다. 신청은 승인·입금 완료와 별도입니다.</p>
      <div className="responsive-table" style={{maxHeight:'45vh',overflow:'auto'}}><table><thead><tr><th>공구 / 지급대상</th><th>신청금액</th><th>계좌 / 확인 결과</th></tr></thead><tbody>{preview.items.map(item=><tr key={item.key}><td>{item.campaignName}<br/>{item.ownerType==='seller'?'셀러':'매니저'} {item.recipientName}</td><td>{item.reason?'—':formatCurrency(item.amount)}</td><td>{item.reason?<>{item.reason}<button type="button" className="secondary-button" disabled={busy} onClick={()=>{setPreview(null);onOpenDetail(item.settlementId)}}>개별 확인</button></>:<>{item.request?.bankNameSnapshot} {item.request?.accountNumberSnapshot}<br/>{item.request?.accountHolderSnapshot} · {item.request?.status==='evidence_pending'?'증빙 검토 대기':'승인 대기'}</>}</td></tr>)}</tbody></table></div>
      <label><input type="checkbox" disabled={busy} checked={confirmed} onChange={e=>setConfirmed(e.target.checked)}/> 신청 대상·계좌·금액을 확인했습니다.</label>
      <div className="action-row"><button type="button" className="secondary-button" disabled={busy} onClick={()=>setPreview(null)}>닫기</button><button type="button" className="primary-button" disabled={busy || !confirmed || !ready.length} onClick={()=>void submit()}>{busy?'서버 저장 중…':`${ready.length}건 지급신청`}</button></div>
    </section></div>}
  </div>
}
