import type { CompanyProfile } from '../../features/auth/AuthGate'
import type { Campaign } from '../types/campaign'
import type { BatchRequestTarget } from '../services/paymentBatchRequestService'
const normalized=(value:string)=>value.normalize('NFKC').replace(/\s+/g,'').toLowerCase()
export function isOwnPaymentCampaign(actor:Pick<CompanyProfile,'id'|'display_name'>,campaign?:Campaign) {
  return Boolean(campaign && (campaign.managerId===actor.id || (actor.display_name.trim() && normalized(actor.display_name)===normalized(campaign.managerName))))
}
export function unrequestedForTarget<T extends {ownerType:'seller'|'manager'}>(items:T[],target:BatchRequestTarget) {
  return items.filter(item=>target==='both' || item.ownerType===target)
}
