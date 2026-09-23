import { useEffect, useState } from 'react'
import * as XLSX from 'xlsx'
import { useCompanyAuth } from '../../../features/auth/AuthGate'
import { withholdingTaxService } from '../../../shared/services/withholdingTaxService'
import { paymentRequestService } from '../../../shared/services/paymentRequestService'
import { accountingRows, accountingExportRows } from '../../../shared/utils/accountingRows'
import { accountingWorkflowService, type MonthClose } from '../../../shared/services/accountingWorkflowService'

const reports: Record<string,string> = {ready:'신고 전',uploaded:'자료 전달',reported:'신고완료',paid:'납부완료',revision_required:'재검토 필요'}
const payments: Record<string,string> = {approval_pending:'대표 승인 대기',approved:'승인 완료',payment_completed:'지급 완료',remittance_confirmed:'입금 확인',evidence_pending:'증빙 확인',request_ready:'지급 요청 준비',on_hold:'보류',sent:'승인 완료'}
const monthly = {open:'미마감',closed:'마감완료',reported:'신고완료',paid:'지급완료'}
export function AccountingManagement() {
  const {profile} = useCompanyAuth()
  const allowed = ['ceo','admin','settlement_cs'].includes(profile.role)
  const [month,setMonth] = useState(new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit'}).format(new Date()).slice(0,7))
  const [record,setRecord] = useState<MonthClose|null>(null)
  const [ready,setReady] = useState(false)
  const [busy,setBusy] = useState(false)
  const [error,setError] = useState('')
  const [,refresh] = useState(0)
  useEffect(() => {
    const update = () => refresh(value => value + 1)
    window.addEventListener('t3-storage-updated',update)
    return () => window.removeEventListener('t3-storage-updated',update)
  }, [])
  useEffect(() => {
    let active=true; setReady(false); setRecord(null); setError('')
    if (allowed) void accountingWorkflowService.month(month).then(value=>{if(active){setRecord(value);setReady(true)}}).catch(e=>{if(active)setError(e.message)})
    return ()=>{active=false}
  },[month,allowed])
  if (!allowed) return <p>대표·관리자·정산 담당자만 이용할 수 있습니다.</p>
  const allRows = accountingRows(withholdingTaxService.getItems(),paymentRequestService.getOperationalPaymentRequests())
  const live = allRows.filter(row=>row.month===month)
  const otherMonths = [...new Set(allRows.map(row => row.month).filter(value => value && value !== month))].sort().reverse()
  const needsReview = live.some(row => row.base === undefined || row.incomeTax === undefined || row.localTax === undefined || row.reportStatus.includes('확인 필요'))
  const locked = record && record.status !== 'open'
  const rows = locked ? record.rows : live
  const displayRows = rows.map(row=>({...row,reportStatus:record?.status==='reported'||record?.status==='paid'?'신고완료':reports[row.reportStatus] ?? row.reportStatus,paymentStatus:payments[row.paymentStatus] ?? row.paymentStatus}))
  const change = async (action: string) => {
    if(busy || !ready) return
    setBusy(true);setError('')
    try {setRecord(await accountingWorkflowService.close(month,live,record?.updated_at ?? null,action))}
    catch(e){setError(e instanceof Error?e.message:'저장 실패')}
    finally{setBusy(false)}
  }
  const download = () => {
    const workbook=XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(workbook,XLSX.utils.json_to_sheet(accountingExportRows(displayRows)),'원천세')
    XLSX.writeFile(workbook,`원천세_${month}.xlsx`)
  }
  return <section className="detail-card"><h2>원천세 관리</h2><div className="action-row"><label>귀속월 <input type="month" value={month} disabled={busy} onChange={e=>{if(e.target.value)setMonth(e.target.value)}} /></label><strong>{ready ? monthly[record?.status ?? 'open'] : '마감 상태 확인 필요'}</strong><button type="button" className="secondary-button" onClick={download} disabled={!ready || !rows.length}>Excel 다운로드</button><button type="button" className="primary-button" disabled={busy||!ready||Boolean(locked)||!rows.length||needsReview} onClick={()=>void change('close')}>월 마감</button>{record?.status==='closed' && <button type="button" className="secondary-button" disabled={busy} onClick={()=>void change('reported')}>신고완료</button>}{record?.status==='reported' && <button type="button" className="secondary-button" disabled={busy} onClick={()=>void change('paid')}>지급완료</button>}{locked && ['ceo','admin'].includes(profile.role) && <button type="button" className="danger-button" disabled={busy} onClick={()=>{if(window.confirm('월 마감본을 보존하고 재검토 상태로 전환할까요?'))void change('reopen')}}>관리자 마감 해제</button>}</div>
  <p>기존 지급 신청·원천세 저장값을 표시합니다. 귀속월은 기존 원천세 항목의 월을 사용하며, 지급일과 별도로 관리합니다.</p>
  {otherMonths.length > 0 && <p>다른 귀속월에도 지급신청 내역이 있습니다: {otherMonths.map(value => <button type="button" className="text-button" disabled={busy} key={value} onClick={() => setMonth(value)}>{value} ({allRows.filter(row => row.month === value).length}건)</button>)}</p>}
  {locked && <p>마감 당시 금액·지급상태를 고정 표시합니다. 이후 신청·지급 변경은 마감본에 자동 반영되지 않습니다.</p>}
  {locked && JSON.stringify(live)!==JSON.stringify(record.rows) && <p role="alert">마감 후 원본에 변경이 있습니다. 관리자 재검토가 필요합니다.</p>}
  {error && <p role="alert">{error}</p>}
  {!ready ? <p>서버 마감 상태를 확인하기 전에는 목록·내보내기·마감을 사용할 수 없습니다.</p> : <div style={{overflowX:'auto'}}><table className="seller-document__table"><thead><tr>{['귀속월','이름','지급 대상','지급 총액','부가세 제외 기준금액','소득세','지방소득세','실지급액','지급일','신고 상태','지급 상태'].map(x=><th key={x}>{x}</th>)}</tr></thead><tbody>{displayRows.map(row=><tr key={row.id}><td>{row.month}</td><td>{row.name}</td><td>{row.owner}</td><td>{row.gross.toLocaleString()}원</td><td>{row.base === undefined ? '확인 필요' : `${row.base.toLocaleString()}원`}</td><td>{row.incomeTax === undefined ? '확인 필요' : `${row.incomeTax.toLocaleString()}원`}</td><td>{row.localTax === undefined ? '확인 필요' : `${row.localTax.toLocaleString()}원`}</td><td>{row.net.toLocaleString()}원</td><td>{row.paidAt?new Date(row.paidAt).toLocaleDateString('ko-KR',{timeZone:'Asia/Seoul'}):'미지급'}</td><td>{row.reportStatus}</td><td>{row.paymentStatus}</td></tr>)}</tbody></table>{!rows.length&&<p>해당 월에 지급 신청된 프리랜서 원천세 항목이 없습니다.</p>}</div>}</section>
}
