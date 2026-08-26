import type { PaymentRequestBatch, SellerBusinessType } from '../types/sellerSettlement'
import { calculateWithholding } from '../utils/withholdingTax'
import { getManagerBusinessType } from '../utils/managerPayment'
import { createPaymentBatchId, summarizePaymentBatch } from '../utils/paymentBatch'
import { campaignService } from './campaignService'
import { paymentRequestService } from './paymentRequestService'
import { settlementService } from './settlementService'
import { STORAGE_KEYS, storageService } from './storageService'
import { withholdingTaxService } from './withholdingTaxService'

const now = () => new Date().toISOString()

export interface ManagerMasterProfile {
  id: string
  name: string
  businessName?: string
  bankName?: string
  accountNumber?: string
  accountHolder?: string
}

export const managerPaymentService = {
  getProfiles() {
    return storageService.getItem<ManagerMasterProfile[]>(STORAGE_KEYS.managerMasters, [])
  },
  getProfile(managerId: string) {
    return this.getProfiles().find((profile) => profile.id === managerId)
  },
  saveProfile(profile: ManagerMasterProfile) {
    storageService.setItem(STORAGE_KEYS.managerMasters, [profile, ...this.getProfiles().filter((item) => item.id !== profile.id)])
    return profile
  },
  getManagers() {
    const unique = new Map<string, { id: string; name: string }>()
    campaignService.getCampaigns().forEach((campaign) => unique.set(campaign.managerId, { id: campaign.managerId, name: campaign.managerName }))
    return [...unique.values()].sort((a, b) => a.name.localeCompare(b.name, 'ko'))
  },
  getBusinessType(managerName: string) {
    return getManagerBusinessType(managerName)
  },
  getScheduledItems(managerId: string) {
    return settlementService.getSettlements().flatMap((settlement) => {
      const campaign = campaignService.getCampaignById(settlement.campaignId)
      if (!campaign || campaign.managerId !== managerId) return []
      const businessType = getManagerBusinessType(campaign.managerName)
      const grossManagerAmount = settlement.currentCalculation.managerAmount + settlement.currentCalculation.managerDeductionTotal
      const tax = businessType === 'freelancer'
        ? calculateWithholding(grossManagerAmount, settlement.currentCalculation.managerDeductionTotal)
        : undefined
      const finalAmount = businessType === 'freelancer' ? tax!.finalPaymentAmount
        : businessType === 'simplified_business'
          ? Math.round(grossManagerAmount / 1.1) - settlement.currentCalculation.managerDeductionTotal
          : grossManagerAmount - settlement.currentCalculation.managerDeductionTotal
      const reasons = paymentRequestService.getPaymentRequestBlockReasons({
        settlementId: settlement.id, ownerType: 'manager', ownerId: campaign.managerId, businessType,
        evidenceTypeConfirmed: true, accountConfirmed: settlement.accountConfirmed, calculationCompleted: true,
        calculationErrors: [], amountConfirmed: settlement.currentCalculation.managerAmount >= 0,
        sourceVersion: settlement.settlementVersion,
      })
      return [{
        settlement, campaign, businessType, tax, finalAmount, reasons,
        request: paymentRequestService.getPaymentRequestForRecipient(settlement.id, 'manager', campaign.managerId, settlement.settlementVersion),
      }]
    })
  },
  getBatches() {
    return storageService.getItem<PaymentRequestBatch[]>(STORAGE_KEYS.paymentRequestBatches, [])
  },
  createBatch(managerId: string, settlementIds: string[], requestedBy = '허수정') {
    const managers = this.getManagers()
    const manager = managers.find((item) => item.id === managerId)
    if (!manager) throw new Error('매니저를 찾을 수 없습니다.')
    const uniqueIds = [...new Set(settlementIds)]
    if (!uniqueIds.length) throw new Error('지급요청할 Campaign을 선택해주세요.')
    const candidates = this.getScheduledItems(managerId).filter((item) => uniqueIds.includes(item.settlement.id))
    if (candidates.length !== uniqueIds.length) throw new Error('선택 항목 중 매니저 소유가 아닌 정산이 있습니다.')
    const blocked = candidates.flatMap((item) => item.reasons)
    if (blocked.length) throw new Error([...new Set(blocked)].join('\n'))
    const batches = this.getBatches()
    const id = createPaymentBatchId(batches.map((item) => item.id))
    const requests = candidates.map((item) =>
      paymentRequestService.createManagerPaymentRequest(item.settlement.id, requestedBy, item.businessType as SellerBusinessType, id))
    const summary = summarizePaymentBatch(requests.map((request) => ({
      grossAmount: request.grossSettlementAmount,
      incomeTaxAmount: request.incomeTaxAmount ?? 0,
      localIncomeTaxAmount: request.localIncomeTaxAmount ?? 0,
      finalAmount: request.finalPaymentAmount,
    })))
    const batch: PaymentRequestBatch = {
      id, managerId, managerName: manager.name, recipientType: 'manager',
      paymentRequestIds: requests.map((item) => item.id),
      campaignIds: candidates.map((item) => item.campaign.id),
      ...summary,
      requestedBy, requestedAt: now(), status: 'approval_pending', memo: 'Campaign 전액 일괄 지급요청',
    }
    storageService.setItem(STORAGE_KEYS.paymentRequestBatches, [batch, ...batches])
    return batch
  },
  ensureFreelancerTaxItems(managerId: string) {
    this.getScheduledItems(managerId).forEach(({ settlement, campaign, businessType }) => {
      if (businessType !== 'freelancer' || !['approved', 'payment_ready', 'partially_paid', 'completed'].includes(settlement.status)) return
      withholdingTaxService.upsert({
        settlementId: settlement.id, ownerType: 'manager', ownerId: campaign.managerId, ownerName: campaign.managerName,
        grossSettlementAmount: settlement.currentCalculation.managerAmount + settlement.currentCalculation.managerDeductionTotal,
        deductions: settlement.currentCalculation.managerDeductionTotal,
        sourceVersion: settlement.settlementVersion,
      })
    })
  },
}
