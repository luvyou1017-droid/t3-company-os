import type { Campaign } from '../types/campaign'
import type { Settlement } from '../types/settlement'
import type { PaymentRequest } from '../types/sellerSettlement'
import type { PaymentEvidence } from '../types/paymentEvidence'
import type { WithholdingTaxItem } from '../types/withholdingTax'
import { createCampaignRepository } from '../repositories/campaignRepository'
import { createSettlementRepository } from '../repositories/settlementRepository'
import { createPaymentRequestRepository } from '../repositories/paymentRequestRepository'
import { createPaymentEvidenceRepository } from '../repositories/paymentEvidenceRepository'
import { createWithholdingTaxRepository } from '../repositories/withholdingTaxRepository'
import { getDataProviderMode } from '../lib/dataProvider'

export const phaseOneDataService = {
  getMode: getDataProviderMode,
  campaigns: {
    list: () => createCampaignRepository().list(),
    save: (item: Campaign) => createCampaignRepository().upsert(item),
  },
  settlements: {
    list: () => createSettlementRepository().list(),
    save: (item: Settlement) => createSettlementRepository().upsert(item),
  },
  paymentRequests: {
    list: () => createPaymentRequestRepository().list(),
    save: (item: PaymentRequest) => createPaymentRequestRepository().upsert(item),
  },
  paymentEvidence: {
    list: () => createPaymentEvidenceRepository().list(),
    save: (item: PaymentEvidence) => createPaymentEvidenceRepository().upsert(item),
  },
  withholdingTaxItems: {
    list: () => createWithholdingTaxRepository().list(),
    save: (item: WithholdingTaxItem) => createWithholdingTaxRepository().upsert(item),
  },
}
