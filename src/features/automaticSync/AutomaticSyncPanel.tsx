import { ScheduleCandidateReview } from './ScheduleCandidateReview'
import { useEffect, useState } from 'react'
import { useCompanyAuth } from '../auth/AuthGate'
import { automaticSyncService } from './service'
import type { SyncJob, SyncKind } from './model'
import './automaticSync.css'
const labels = { campaign: '공구일정', proposal: '제안서' }
const date = (value?: string) => value ? new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)) : '기록 없음'
export function AutomaticSyncPanel() {
  const {profile} = useCompanyAuth()
  const allowed = profile.role === 'ceo' || profile.role === 'admin'
  const [jobs,setJobs] = useState<SyncJob[]>([])
  const [error,setError] = useState('')
  const [busy,setBusy] = useState<SyncKind | 'status' | null>(null)
  const [message,setMessage] = useState('')
  async function refresh() {
    setBusy('status')
    try {setJobs(await automaticSyncService.status());setError('')} catch(e){setError(e instanceof Error?e.message:'현황 조회 실패')}
    finally {setBusy(null)}
  }
  useEffect(()=>{if(allowed)void refresh()},[allowed])
  if(!allowed)return null
  async function run(kind: SyncKind) {
    setBusy(kind);setMessage('')
    try {await automaticSyncService.run(kind);setJobs(await automaticSyncService.status());setError('');setMessage('실행 결과를 확인해주세요. 후보 생성과 실제 DB 반영은 구분됩니다.')}
    catch(e){setError(e instanceof Error?e.message:'실행 실패');try{setJobs(await automaticSyncService.status())}catch{/* preserve visible history */}}
    finally{setBusy(null)}
  }
  return <section className="auto-sync-panel"><div className="auto-sync-heading"><div><h2>자동 동기화 현황</h2><p>한국시간 기준 · 자동 실행과 수동 실행의 변경분 및 실패 기록을 확인합니다.</p></div><button className="secondary-button" disabled={Boolean(busy)} onClick={()=>void refresh()}>현황 새로고침</button></div>
    {error&&<p role="alert" className="auto-sync-error">{error}</p>}{message&&<p role="status">{message}</p>}
    <div className="auto-sync-grid">{(['campaign','proposal'] as SyncKind[]).map(kind=>{
      const job=jobs.find(x=>x.kind===kind), latest=job?.runs[0]
      return <article key={kind}><h3>{labels[kind]}</h3>
        <p><strong>{!job?'실행 여부 미확인':!job.configured?'연결 설정 필요':job.scheduled?'월요일 09:00 자동 실행 설정 확인':'스케줄러 미설정'}</strong></p>
        {job?.configuration_error&&<p className="auto-sync-error">{job.configuration_error}</p>}
        {latest?.status==='failed'&&<div role="alert" className="auto-sync-error"><strong>{labels[kind]} {latest.trigger==='scheduled'?'자동':'수동'} 동기화 실패</strong><p>{latest.error}</p><small>마지막 성공: {date(job?.last_success_at)}</small></div>}
        <dl><dt>최근 실행</dt><dd>{date(latest?.started_at)}</dd><dt>실행 방식</dt><dd>{latest?(latest.trigger==='manual'?'수동':'자동'):'기록 없음'}</dd><dt>마지막 결과</dt><dd>{latest?({running:'실행 중',succeeded:'성공',failed:'실패'}[latest.status]):'기록 없음'}</dd><dt>마지막 성공</dt><dd>{date(job?.last_success_at)}</dd><dt>다음 실행 예정</dt><dd>{job?.scheduled&&job.configured?date(job.next_run):'자동 실행 미확인 / 예정 없음'}</dd></dl>
        {latest && <p>{kind==='campaign'?<>신규 일정 후보 {latest.counts.newCampaigns??0} · 수정 일정 후보 {latest.counts.changedCampaigns??0}</>:<>확인 제안서 {latest.counts.checked??0} · 신규 상품 후보 {latest.counts.newProducts??0} · 신규 SKU 후보 {latest.counts.newSkus??0} · 조건변경 {latest.counts.terms??0}</>} · 변화 없음 {latest.counts.unchanged??0} · 확인 필요 {latest.counts.review??0}</p>}
        <p>기준: {kind==='proposal'?'파일 수정일':'노션 수정일'} &gt; 마지막 성공 시점</p>
        <button className="primary-button" disabled={Boolean(busy)||!job?.configured} onClick={()=>void run(kind)}>{busy===kind?'실행 중…':labels[kind]+' 지금 동기화'}</button>
        {(job?.runs??[]).map(item=><details key={item.id}><summary>변경내역 보기 · {date(item.started_at)} · {item.status==='succeeded'?'성공':item.status==='failed'?'실패':'실행 중'}</summary>
          <p>{kind==='campaign'?<>신규 후보 {item.counts.newCampaigns??0} · 수정 후보 {item.counts.changedCampaigns??0}</>:<>확인 제안서 {item.counts.checked??0} · 신규 상품 후보 {item.counts.newProducts??0} · 신규 SKU 후보 {item.counts.newSkus??0} · 조건변경 {item.counts.terms??0}</>} · 변화 없음 {item.counts.unchanged??0} · 확인 필요 {item.counts.review??0}</p>
          <p>검토 후보입니다. 상품·SKU·일정 및 과거 정산을 자동 덮어쓰지 않습니다.</p>
          {item.error&&<p role="alert">{item.error}</p>}
          <div className="auto-sync-table"><table><thead><tr><th>분류</th><th>항목</th><th>변경 / 확인 사유</th></tr></thead><tbody>{item.changes.map(c=><tr key={c.id}><td>{c.state} · {c.entity}</td><td>{c.name}</td><td>{c.reason}{kind === 'campaign' && <ScheduleCandidateReview change={c} />}{c.differences.map((d,i)=><div key={i}>{d.label}: {String(d.before??'없음')} → {String(d.after??'없음')}</div>)}</td></tr>)}</tbody></table></div>
        </details>)}
      </article>
    })}</div></section>
}
