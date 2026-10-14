import type { Settlement } from '../types/settlement'
import type { PaymentRequest } from '../types/sellerSettlement'
import type { Campaign } from '../types/campaign'
import type { SalesDataImport } from '../types/salesData'
import { isCompanyDirectManager } from './managerPayment'
import { campaignChannel } from './uploadSettlementConditions'
const paid = new Set(['payment_completed','remittance_confirmed'])
const active = new Set(['evidence_pending','request_ready','approval_pending','approved','sent','on_hold'])
export function settlementPaymentOverview(settlements:Settlement[],requests:PaymentRequest[],campaigns:Map<string,Campaign>,salesById?:Map<string,SalesDataImport>) {
 const byId = new Map<string,PaymentRequest>()
 for(const request of requests){const old=byId.get(request.id);if(!old || !paid.has(old.status))byId.set(request.id,request)}
 const unique = [...byId.values()]
 const recipients = settlements.filter(item=>!['completed','canceled'].includes(item.status)).flatMap(settlement=> {
  const campaign=campaigns.get(settlement.campaignId)
  return (['seller','manager'] as const).flatMap(ownerType=> {
   if(ownerType==='manager' && (campaign?.supplyAudience==='vendor' || isCompanyDirectManager(campaign?.managerId,campaign?.managerName)))return []
   const sales=salesById?.get(settlement.salesDataImportId)
   if(ownerType==='seller' && ((sales?.supplyAudience ?? campaign?.supplyAudience)==='vendor' || campaignChannel(campaign,sales)==='seller_checkout'))return []
   const matching=unique.filter(request=>request.settlementId===settlement.id && request.recipientType===ownerType)
   if((ownerType==='seller'?settlement.sellerPaymentCompleted:settlement.managerPaymentCompleted) || matching.some(request=>paid.has(request.status)))return []
   const pending=matching.filter(request=>active.has(request.status)).sort((a,b)=>(b.requestedAt || '').localeCompare(a.requestedAt || ''))[0]
   const amount=Math.max(pending?.finalPaymentAmount ?? (ownerType==='seller'?settlement.currentCalculation.finalSellerPaymentAmount:settlement.currentCalculation.finalPaymentAmount),0)
   if(!amount)return []
   return [{settlementId:settlement.id,ownerType,amount,request:pending,unrequested:!pending,rejected:!pending && matching.some(request=>request.status==='rejected')}]
  })
 })
 const pendingRequests=recipients.flatMap(row=>row.request?[row.request]:[])
 const unrequested=recipients.filter(row=>row.unrequested)
 const sum=(ownerType:'seller'|'manager')=>recipients.filter(row=>row.ownerType===ownerType).reduce((total,row)=>total+row.amount,0)
 const evidenceMissing=pendingRequests.filter(request=>request.status==='evidence_pending' || (['tax_invoice','cash_receipt'].includes(request.evidenceType) && !['confirmed','reported_issued'].includes(request.documentCheckStatus ?? ''))).length
 return {recipients,unrequested,unrequestedIds:new Set(unrequested.map(row=>row.settlementId)),sellerDue:sum('seller'),managerDue:sum('manager'),unrequestedAmount:unrequested.reduce((total,row)=>total+row.amount,0),evidenceMissing,approvalPending:pendingRequests.filter(request=>request.status==='approval_pending').length,paymentReady:pendingRequests.filter(request=>['approved','sent'].includes(request.status)).length,rejected:unrequested.filter(row=>row.rejected).length}
}
