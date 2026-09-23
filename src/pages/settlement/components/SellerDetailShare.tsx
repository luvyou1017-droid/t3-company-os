import { useEffect, useState } from 'react'
import { accountingWorkflowService, type DetailShare } from '../../../shared/services/accountingWorkflowService'
import { remainingShareSeconds } from '../../../shared/utils/accountingRows'

export function SellerDetailShare({settlementId,enabled,createImage,message,onCopied}:{settlementId:string;enabled:boolean;createImage:()=>Promise<Blob>;message:()=>string;onCopied?:()=>Promise<void>}) {
  const [shares,setShares]=useState<DetailShare[]>([])
  const [busy,setBusy]=useState(false)
  const [error,setError]=useState('')
  useEffect(()=>{let active=true;void accountingWorkflowService.shares(settlementId).then(rows=>{if(active)setShares(rows)}).catch(e=>{if(active)setError(e.message)});return()=>{active=false}},[settlementId])
  async function generate(){if(busy||!enabled)return;setBusy(true);setError('');try{const share=await accountingWorkflowService.createShare(settlementId,await createImage());setShares(previous=>[share,...previous])}catch(e){setError(e instanceof Error?e.message:'생성 실패')}finally{setBusy(false)}}
  async function copy(share:DetailShare){try{if(!share.signed_url||!remainingShareSeconds(share.expires_at))throw new Error('만료되었거나 생성되지 않은 링크입니다.');await navigator.clipboard.writeText(`${message()}\n\n정산 상세 확인: ${share.signed_url}\n만료: ${new Date(share.expires_at).toLocaleString('ko-KR',{timeZone:'Asia/Seoul'})} (한국시간)`);await onCopied?.();setError('안내문과 링크를 복사했습니다.')}catch(e){setError(e instanceof Error?e.message:'복사 또는 전달시각 저장 실패')}}
  return <section className="seller-excel-share no-print"><h4>셀러 정산 상세 · 14일 링크</h4><p>확정된 셀러 정산서를 이미지로 보존해 공유합니다. 다른 정산이나 내부 문서는 포함하지 않습니다.</p><button className="primary-button" type="button" disabled={busy||!enabled} onClick={()=>void generate()}>{busy?'생성 중…':'정산 상세 링크 생성'}</button>{!enabled&&<p>정산 확정 후 생성할 수 있습니다.</p>}{shares.map(share=><div key={share.id}><span>생성 {new Date(share.created_at).toLocaleString('ko-KR')} · 만료 {new Date(share.expires_at).toLocaleString('ko-KR')} · {!share.signed_url?'생성 미완료':remainingShareSeconds(share.expires_at)?'활성':'만료'}</span><button type="button" className="secondary-button" disabled={!share.signed_url||!remainingShareSeconds(share.expires_at)} onClick={()=>void copy(share)}>안내문 + 링크 복사</button></div>)}<small>열람 여부는 현재 저장소 방식에서 수집하지 않습니다.</small>{error&&<p role="status">{error}</p>}</section>
}
