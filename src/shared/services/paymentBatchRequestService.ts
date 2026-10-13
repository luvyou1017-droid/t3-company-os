import { isOwnPaymentCampaign } from '../utils/paymentRequestScope'
import type { CompanyProfile } from '../../features/auth/AuthGate'
import { supabase } from '../lib/supabase'
import { captureStorageWrites, STORAGE_KEYS as K, storageService } from './storageService'
import { rememberWorkspaceRow } from './workspacePayloadCache'
import { paymentRequestService } from './paymentRequestService'
import { campaignService } from './campaignService'
import { settlementService } from './settlementService'
import { sellerMasterService } from './sellerMasterService'
import { managerPaymentService } from './managerPaymentService'
import { paymentEvidenceService } from './paymentEvidenceService'
import { salesDataService } from './salesDataService'
import { campaignChannel } from '../utils/uploadSettlementConditions'
import { isCompanyDirectManager } from '../utils/managerPayment'
import type { PaymentRequest } from '../types/sellerSettlement'

const keys = [K.paymentRequests,K.settlements,K.campaigns,K.salesDataImports,K.salesDataRows,K.sellerSettlementRules,K.settlementDeductions,K.managerMasters,K.sellerMasters,K.withholdingTaxItems,K.paymentEvidence,K.settlementActivityLogs,K.settlementRevisionRequests]
type Row = { storage_key:string; payload:unknown; revision:number; updated_at:string; deleted:boolean }
export type BatchRequestTarget = 'both' | 'seller' | 'manager'
export type BatchRequestItem = { key:string; settlementId:string; ownerType:'seller'|'manager'; campaignName:string; recipientName:string; amount:number; reason:string; request?:PaymentRequest }
export type BatchRequestPreview = { ids:string[]; target:BatchRequestTarget; versions:Row[]; items:BatchRequestItem[]; actorName:string }

export function planBatchPaymentRequests(ids:string[], target:BatchRequestTarget, values:Map<string,unknown>, actorName:string) {
  const seed = new Map<string,unknown>(Object.values(K).map(key => [key,values.get(key) ?? []]))
  const items:BatchRequestItem[]=[]
  const writes=new Map<string,unknown>()
  for(const settlementId of [...new Set(ids)]) for(const ownerType of target==='both' ? ['seller','manager'] as const : [target]) {
    const item:BatchRequestItem={key:`${settlementId}:${ownerType}`,settlementId,ownerType,campaignName:settlementId,recipientName:'',amount:0,reason:''}
    try {
      const captured=captureStorageWrites(seed,()=> {
        const settlement=settlementService.getSettlementById(settlementId)
        if(!settlement || ['completed','canceled'].includes(settlement.status)) throw new Error('완료 또는 취소된 정산입니다.')
        const campaign=campaignService.getCampaignById(settlement.campaignId)
        if(!campaign) throw new Error('공구일정을 찾을 수 없습니다.')
        item.campaignName=campaign.campaignName; item.recipientName=ownerType==='seller'?campaign.sellerName:campaign.managerName
        if(!settlementService.isSettlementConfirmed(settlement)) throw new Error('정산서 확정 필요')
        if(!(seed.get(K.sellerSettlementRules) as Array<{campaignId:string}>).some(rule=>rule.campaignId===campaign.id)) throw new Error('셀러 정산 규칙 확인 필요')
        if(settlementService.getPendingRevisionRequest(settlementId)) throw new Error('수정 요청 처리 필요')
        const sales=salesDataService.getSalesDataImportById(settlement.salesDataImportId)
        if((sales?.supplyAudience ?? campaign.supplyAudience)==='vendor') throw new Error('벤더 정산은 개별 확인 필요')
        if(ownerType==='manager' && isCompanyDirectManager(campaign.managerId,campaign.managerName)) throw new Error('회사 직속 · 매니저 지급 대상 아님')
        if(ownerType==='seller' && campaignChannel(campaign,sales)==='seller_checkout') throw new Error('셀러 입금 요청은 개별 확인 필요')
        const existing=paymentRequestService.getOperationalPaymentRequests().filter(r=>r.settlementId===settlementId && r.recipientType===ownerType)
        if((ownerType==='seller'?settlement.sellerPaymentCompleted:settlement.managerPaymentCompleted) || existing.some(r=>!['canceled','rejected','draft'].includes(r.status))) throw new Error('이미 신청 또는 지급 완료된 대상')
        // Use persisted masters only; prototype manager account fallbacks are not eligible.
        const profile=ownerType==='seller'?sellerMasterService.getSettlementProfile(campaign.sellerId,campaign.sellerBusinessId):(seed.get(K.managerMasters) as Array<ReturnType<typeof managerPaymentService.getProfile>>).find(p=>p?.id===campaign.managerId)
        if(!profile?.businessType) throw new Error('사업자 유형 등록 필요')
        if(!profile.bankName?.trim() || !profile.accountNumber?.trim() || !profile.accountHolder?.trim()) throw new Error('은행·계좌번호·예금주 등록 필요')
        if(profile.businessType==='freelancer' && (seed.get(K.withholdingTaxItems) as Array<{settlementId:string;ownerType:string;ownerId:string;status:string}>).some(t=>t.settlementId===settlementId && t.ownerType===ownerType && t.ownerId===(ownerType==='seller'?campaign.sellerId:campaign.managerId) && ['uploaded','reported','paid'].includes(t.status))) throw new Error('원천세 마감·신고 이력 · 개별 확인 필요')
        const recommended=paymentEvidenceService.getRecommendedEvidenceType(profile.businessType)
        const evidence=paymentEvidenceService.getEvidenceBySettlementId(settlementId,ownerType).filter(e=>e.ownerId===(ownerType==='seller'?campaign.sellerId:campaign.managerId) && e.evidenceType===recommended && ['uploaded','review_pending','approved'].includes(e.reviewStatus))
        if(profile.businessType!=='freelancer' && !evidence.length) throw new Error('증빙 첨부 필요 · 정산 상세에서 등록해주세요')
        const options={accountConfirmed:true,allowEvidencePending:profile.businessType!=='freelancer' && !evidence.some(e=>e.reviewStatus==='approved'),memo:'선택 건 일괄 지급신청',bankNameSnapshot:profile.bankName,accountNumberSnapshot:profile.accountNumber,accountHolderSnapshot:profile.accountHolder}
        const request=ownerType==='seller'?paymentRequestService.createPaymentRequest(settlementId,actorName,options):paymentRequestService.createManagerPaymentRequest(settlementId,actorName,profile.businessType,undefined,options)
        if(!Number.isFinite(request.finalPaymentAmount) || request.finalPaymentAmount<=0 || request.direction!=='company_to_seller') throw new Error('양수 지급액 확인 필요')
        return request
      })
      for(const [key,value] of captured.writes) { seed.set(key,value); writes.set(key,value) }
      item.request=captured.result; item.amount=captured.result.finalPaymentAmount
    } catch(error) { item.reason=error instanceof Error?error.message:'신청 조건 확인 필요' }
    items.push(item)
  }
  const created=items.flatMap(item=>item.request?[item.request]:[])
  if(created.length) {
    const paymentPayload=[...created,...(values.get(K.paymentRequests) as PaymentRequest[])]
    writes.set(K.paymentRequests,paymentPayload);seed.set(K.paymentRequests,paymentPayload)
    // Existing getters can project company-direct calculations. Persist status only,
    // preserving original financial records and all unrelated campaigns byte-for-byte.
    for(const key of [K.settlements,K.campaigns]) {
      const original=values.get(key) as Array<Record<string,unknown>>
      const payload=original.map(row=>{
        const matching=created.filter(request=>(key===K.settlements?request.settlementId:request.campaignId)===row.id)
        if(!matching.length)return row
        return matching.reduce((updated,request)=>({...updated,[request.recipientType==='seller'?'sellerPaymentRequestStatus':'managerPaymentRequestStatus']:request.status,updatedAt:request.requestedAt}),row)
      })
      writes.set(key,payload);seed.set(key,payload)
    }
  }
  return {items,values:seed,writes}
}

async function context(client:NonNullable<typeof supabase>, refreshMasters:()=>Promise<unknown>) {
  const user=await client.auth.getUser(); if(user.error || !user.data.user) throw new Error('다시 로그인해주세요.')
  const profile=await client.from('profiles').select('display_name,role,active,approval_status').eq('id',user.data.user.id).single()
  if(profile.error || !profile.data.active || profile.data.approval_status!=='approved' || !['ceo','admin','settlement_cs','manager'].includes(profile.data.role)) throw new Error('대표·관리자·정산 담당자 또는 담당 매니저만 일괄 지급신청할 수 있습니다.')
  const result=await client.from('workspace_state').select('storage_key,payload,revision,updated_at,deleted').eq('workspace_id','wisevendor').in('storage_key',keys)
  if(result.error) throw result.error
  const rows=(result.data ?? []) as Row[]
  if(![K.paymentRequests,K.settlements,K.campaigns].every(key=>rows.some(row=>row.storage_key===key && !row.deleted && Array.isArray(row.payload)))) throw new Error('신청에 필요한 운영 데이터를 모두 불러오지 못했습니다.')
  await refreshMasters()
  return {rows,name:profile.data.display_name as string,actor:{...profile.data,id:user.data.user.id} as CompanyProfile}
}
function requireScope(ids:string[],rows:Row[],actor:CompanyProfile) {
  if(actor.role!=='manager')return
  const campaigns=rows.find(row=>row.storage_key===K.campaigns)!.payload as import('../types/campaign').Campaign[]
  const settlements=rows.find(row=>row.storage_key===K.settlements)!.payload as import('../types/settlement').Settlement[]
  if(ids.some(id=>{const s=settlements.find(row=>row.id===id);return !s || !isOwnPaymentCampaign(actor,campaigns.find(c=>c.id===s.campaignId))})) throw new Error('본인이 담당한 공구만 지급신청할 수 있습니다.')
}
export async function previewBatchPaymentRequests(ids:string[],target:BatchRequestTarget,client=supabase, refreshMasters=()=>sellerMasterService.loadSellers(true)):Promise<BatchRequestPreview> {
  if(!client) throw new Error('운영 서버 연결을 확인해주세요.')
  const {rows,name,actor}=await context(client,refreshMasters)
  requireScope(ids,rows,actor)
  const plan=planBatchPaymentRequests(ids,target,new Map(rows.map(row=>[row.storage_key,row.payload])),name)
  return {ids:[...new Set(ids)],target,versions:rows,items:plan.items,actorName:name}
}
export async function submitBatchPaymentRequests(preview:BatchRequestPreview,client=supabase, refreshMasters=()=>sellerMasterService.loadSellers(true)) {
  if(!client) throw new Error('운영 서버 연결을 확인해주세요.')
  const {rows,name,actor}=await context(client,refreshMasters)
  requireScope(preview.ids,rows,actor)
  const versions=(r:Row[])=>JSON.stringify(r.map(row=>[row.storage_key,row.revision,row.updated_at]).sort())
  if(versions(rows)!==versions(preview.versions)) throw new Error('확인 이후 데이터가 변경되었습니다. 다시 일괄 확인해주세요.')
  const plan=planBatchPaymentRequests(preview.ids,preview.target,new Map(rows.map(row=>[row.storage_key,row.payload])),name)
  const signature=(items:BatchRequestItem[])=>JSON.stringify(items.map(i=>[i.key,i.amount,i.reason,i.request?.bankNameSnapshot,i.request?.accountNumberSnapshot,i.request?.accountHolderSnapshot,i.request?.businessType]))
  if(signature(plan.items)!==signature(preview.items)) throw new Error('계좌·금액·대상이 변경되었습니다. 다시 확인해주세요.')
  const ready=plan.items.filter(item=>item.request)
  if(!ready.length) throw new Error('신청 가능한 건이 없습니다.')
  const writes=rows.filter(row=>plan.writes.has(row.storage_key) && JSON.stringify(row.payload)!==JSON.stringify(plan.writes.get(row.storage_key))).map(row=>({storage_key:row.storage_key,payload:plan.writes.get(row.storage_key)}))
  const saved=await client.rpc('payment_request_batch_commit',{p_rows:writes,p_expected:rows.map(({storage_key,revision,updated_at})=>({storage_key,revision,updated_at}))})
  if(saved.error) throw saved.error
  for(const row of saved.data as Row[]) { const raw=JSON.stringify(row.payload); await rememberWorkspaceRow(row.storage_key,row.updated_at,raw); storageService.setItemFromCloud(row.storage_key,row.payload) }
  return ready.length
}
