import type { Settlement } from '../types/settlement'
import type { Campaign } from '../types/campaign'
import type { SalesDataImport } from '../types/salesData'
import { campaignChannel } from './uploadSettlementConditions'

export function pendingSellerLinkReceipts(settlements: Settlement[], campaigns: Map<string, Campaign>, sales: Map<string, SalesDataImport>) {
  return settlements.filter(item => !['completed', 'canceled'].includes(item.status)
    && !item.sellerLinkReceipt
    && campaignChannel(campaigns.get(item.campaignId), sales.get(item.salesDataImportId)) === 'seller_checkout')
}
