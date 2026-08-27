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
  realName?: string
  businessType: SellerBusinessType
  bankName?: string
  accountNumber?: string
  accountHolder?: string
  taxRegistrationNumber?: string
}

const managerProfiles: ManagerMasterProfile[] = [
  { id: 'u-001', name: '허윤정', businessName: '허윤정', businessType: 'freelancer', bankName: '국민은행', accountNumber: '123456-01-123456', accountHolder: '허윤정', taxRegistrationNumber: 'mock-tax-u-001' },
  { id: 'u-005', name: '김병희', businessName: '김병희', businessType: 'freelancer', bankName: '신한은행', accountNumber: '110-123-456789', accountHolder: '김병희', taxRegistrationNumber: 'mock-tax-u-005' },
  { id: 'manager-SCH-003', name: '오세린', businessName: '오세린컴퍼니', businessType: 'general_business', bankName: '우리은행', accountNumber: '1002-003-003003', accountHolder: '오세린컴퍼니' },
  { id: 'manager-SCH-004', name: '박지훈', businessName: '박지훈', businessType: 'simplified_business', bankName: '하나은행', accountNumber: '004-004004-00404', accountHolder: '박지훈' },
  { id: 'manager-SCH-006', name: '최유진', businessName: '최유진', businessType: 'freelancer', bankName: '카카오뱅크', accountNumber: '3333-06-0606060', accountHolder: '최유진', taxRegistrationNumber: 'mock-tax-sch-006' },
  { id: 'manager-SCH-008', name: '윤태호', businessName: '(주)윤태호컴퍼니', businessType: 'general_business', bankName: '기업은행', accountNumber: '008-008008-01-008', accountHolder: '(주)윤태호컴퍼니' },
  { id: 'manager-SCH-010', name: '오세린', businessName: '오세린컴퍼니', businessType: 'general_business', bankName: '우리은행', accountNumber: '1002-003-003003', accountHolder: '오세린컴퍼니' },
  { id: 'manager-SCH-011', name: '박지훈', businessName: '박지훈', businessType: 'simplified_business', bankName: '하나은행', accountNumber: '004-004004-00404', accountHolder: '박지훈' },
  { id: 'manager-SCH-012', name: '최유진', businessName: '최유진', businessType: 'freelancer', bankName: '카카오뱅크', accountNumber: '3333-06-0606060', accountHolder: '최유진', taxRegistrationNumber: 'mock-tax-sch-012' },
]

export const managerPaymentService = {
  getProfiles() {
    const stored = storageService.getItem<ManagerMasterProfile[]>(STORAGE_KEYS.managerMasters, [])
    const storedById = new Map(stored.map((profile) => [profile.id, profile]))
    return [
      ...managerProfiles.map((profile) => ({ ...profile, ...storedById.get(profile.id), businessType: storedById.get(profile.id)?.businessType ?? profile.businessType })),
      ...stored.filter((profile) => !managerProfiles.some((seed) => seed.id === profile.id)),
    ]
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
    return this.getProfiles().find((profile) => profile.name === managerName)?.businessType ?? getManagerBusinessType(managerName)
  },
  getScheduledItems(managerId: string) {
    return settlementService.getSettlements().flatMap((settlement) => {
      const campaign = campaignService.getCampaignById(settlement.campaignId)
      if (!campaign || campaign.managerId !== managerId) return []
      const businessType = this.getBusinessType(campaign.managerName)
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
        evidenceTypeConfirmed: true, accountConfirmed: Boolean(this.getProfile(campaign.managerId)?.bankName && this.getProfile(campaign.managerId)?.accountNumber && this.getProfile(campaign.managerId)?.accountHolder), calculationCompleted: true,
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
      paymentRequestService.createManagerPaymentRequest(item.settlement.id, requestedBy, item.businessType as SellerBusinessType, id, { accountConfirmed: true }))
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
      if (businessType !== 'freelancer' || !['manager_reviewed', 'approval_pending', 'approved', 'payment_ready', 'partially_paid', 'completed'].includes(settlement.status)) return
      withholdingTaxService.upsert({
        settlementId: settlement.id, ownerType: 'manager', ownerId: campaign.managerId, ownerName: campaign.managerName,
        grossSettlementAmount: settlement.currentCalculation.managerAmount + settlement.currentCalculation.managerDeductionTotal,
        deductions: settlement.currentCalculation.managerDeductionTotal,
        sourceVersion: settlement.settlementVersion,
      })
    })
  },
}
