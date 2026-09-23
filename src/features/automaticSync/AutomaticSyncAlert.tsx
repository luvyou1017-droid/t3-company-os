import './automaticSync.css'
import {useEffect,useState} from 'react'
import {useCompanyAuth} from '../auth/AuthGate'
import {automaticSyncService} from './service'
import type {SyncJob} from './model'
export function AutomaticSyncAlert({onOpen}:{onOpen:()=>void}) {
 const {profile}=useCompanyAuth()
 const [failed,setFailed]=useState<SyncJob[]>([])
 const allowed=profile.role==='ceo'||profile.role==='admin'
 useEffect(()=>{
  if(!allowed)return
  let active=true
  const load=async()=>{try{const jobs=await automaticSyncService.status();if(active)setFailed(jobs.filter(job=>job.runs[0]?.status==='failed'))}catch{/* setup errors are shown in the status screen */}}
  void load()
  const timer=window.setInterval(()=>{if(document.visibilityState==='visible')void load()},300000)
  return()=>{active=false;window.clearInterval(timer)}
 },[allowed])
 if(!allowed||!failed.length)return null
 return <aside role="alert" className="auto-sync-error">{failed.map(job=><p key={job.kind}><strong>{job.kind==='campaign'?'공구일정':'제안서'} {job.runs[0].trigger==='scheduled'?'자동':'수동'} 동기화 실패</strong> · {job.runs[0].error} · 마지막 성공 {job.last_success_at?new Date(job.last_success_at).toLocaleString('ko-KR',{timeZone:'Asia/Seoul'}):'기록 없음'}</p>)}<button className="secondary-button" onClick={onOpen}>자동 동기화 현황 보기</button></aside>
}
