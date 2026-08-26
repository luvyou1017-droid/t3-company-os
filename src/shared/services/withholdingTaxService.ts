import type { EvidenceOwnerType } from '../types/paymentEvidence'
import type { WithholdingTaxItem, WithholdingTaxStatus } from '../types/withholdingTax'
import type { SellerBusinessType } from '../types/sellerSettlement'
import { calculateWithholding } from '../utils/withholdingTax'
import { getManagerBusinessType } from '../utils/managerPayment'
import { campaignService } from './campaignService'
import { settlementService } from './settlementService'
import { STORAGE_KEYS, storageService } from './storageService'

const now = () => new Date().toISOString()

type UpsertInput = {
  settlementId: string
  ownerType: EvidenceOwnerType
  ownerId: string
  ownerName: string
  grossSettlementAmount: number
  deductions: number
  paymentMonth?: string
  paymentDate?: string
  paymentRequestId?: string
  sourceVersion: number
  updatedBy?: string
}

function save(item: WithholdingTaxItem) {
  const items = withholdingTaxService.getItems()
  storageService.setItem(STORAGE_KEYS.withholdingTaxItems, [item, ...items.filter((candidate) => candidate.id !== item.id)])
  return item
}

export const withholdingTaxService = {
  getItems() {
    return storageService.getItem<WithholdingTaxItem[]>(STORAGE_KEYS.withholdingTaxItems, [])
  },
  getBySettlementOwner(settlementId: string, ownerType: EvidenceOwnerType, ownerId: string) {
    return this.getItems().filter((item) => item.settlementId === settlementId && item.ownerType === ownerType && item.ownerId === ownerId)
  },
  upsert(input: UpsertInput) {
    const settlement = settlementService.getSettlementById(input.settlementId)
    if (!settlement) throw new Error('정산을 찾을 수 없습니다.')
    const existingVersions = this.getBySettlementOwner(input.settlementId, input.ownerType, input.ownerId)
    const exact = existingVersions.find((item) => item.sourceVersion === input.sourceVersion)
    const locked = existingVersions.find((item) => ['uploaded', 'reported', 'paid'].includes(item.status) && item.sourceVersion !== input.sourceVersion)
    if (locked) save({ ...locked, status: 'revision_required', updatedAt: now(), updatedBy: input.updatedBy ?? '허수정', memo: '확정 후 원본 정산 변경: 새 버전 재검토 필요' })
    const calculation = calculateWithholding(input.grossSettlementAmount, input.deductions)
    const timestamp = now()
    return save({
      id: exact?.id ?? `withholding-${crypto.randomUUID()}`,
      campaignId: settlement.campaignId,
      settlementId: input.settlementId,
      paymentRequestId: input.paymentRequestId ?? exact?.paymentRequestId,
      ownerType: input.ownerType,
      ownerId: input.ownerId,
      ownerName: input.ownerName,
      paymentMonth: input.paymentMonth ?? settlement.paymentDueDate.slice(0, 7),
      paymentDate: input.paymentDate ?? exact?.paymentDate,
      ...calculation,
      sourceVersion: input.sourceVersion,
      status: exact?.status ?? 'ready',
      createdAt: exact?.createdAt ?? timestamp,
      updatedAt: timestamp,
      createdBy: exact?.createdBy ?? input.updatedBy ?? '허수정',
      updatedBy: input.updatedBy ?? '허수정',
      memo: exact?.memo,
    })
  },
  syncSettlementRecipients(settlementId: string, sellerBusinessType: SellerBusinessType, managerBusinessType: SellerBusinessType) {
    const settlement = settlementService.getSettlementById(settlementId)
    if (!settlement || !['approved', 'payment_ready', 'partially_paid', 'completed'].includes(settlement.status)) return []
    const campaign = campaignService.getCampaignById(settlement.campaignId)
    if (!campaign) return []
    const synced: WithholdingTaxItem[] = []
    if (sellerBusinessType === 'freelancer') synced.push(this.upsert({
      settlementId, ownerType: 'seller', ownerId: campaign.sellerId, ownerName: campaign.sellerName,
      grossSettlementAmount: settlement.currentCalculation.sellerCommissionAmount,
      deductions: settlement.currentCalculation.sellerDeductionTotal, sourceVersion: settlement.settlementVersion,
    }))
    if (managerBusinessType === 'freelancer') synced.push(this.upsert({
      settlementId, ownerType: 'manager', ownerId: campaign.managerId, ownerName: campaign.managerName,
      grossSettlementAmount: settlement.currentCalculation.managerAmount + settlement.currentCalculation.managerDeductionTotal,
      deductions: settlement.currentCalculation.managerDeductionTotal, sourceVersion: settlement.settlementVersion,
    }))
    return synced
  },
  syncFromConfirmedSettlements() {
    settlementService.getSettlements().forEach((settlement) => {
      if (!['approved', 'payment_ready', 'partially_paid', 'completed'].includes(settlement.status)) return
      const campaign = campaignService.getCampaignById(settlement.campaignId)
      if (!campaign) return
      if (settlement.campaignId === 'SCH-009') withholdingTaxService.upsert({
        settlementId: settlement.id, ownerType: 'seller', ownerId: campaign.sellerId, ownerName: campaign.sellerName,
        grossSettlementAmount: settlement.currentCalculation.sellerCommissionAmount,
        deductions: settlement.currentCalculation.sellerDeductionTotal, sourceVersion: settlement.settlementVersion,
      })
      if (getManagerBusinessType(campaign.managerName) === 'freelancer') withholdingTaxService.upsert({
        settlementId: settlement.id, ownerType: 'manager', ownerId: campaign.managerId, ownerName: campaign.managerName,
        grossSettlementAmount: settlement.currentCalculation.managerAmount + settlement.currentCalculation.managerDeductionTotal,
        deductions: settlement.currentCalculation.managerDeductionTotal, sourceVersion: settlement.settlementVersion,
      })
    })
    return withholdingTaxService.getItems()
  },
  updateStatus(id: string, status: WithholdingTaxStatus, updatedBy = '허수정') {
    const item = this.getItems().find((candidate) => candidate.id === id)
    if (!item) throw new Error('원천세 항목을 찾을 수 없습니다.')
    return save({ ...item, status, updatedAt: now(), updatedBy })
  },
  linkPaymentRequest(id: string, paymentRequestId: string) {
    const item = this.getItems().find((candidate) => candidate.id === id)
    if (!item) throw new Error('원천세 항목을 찾을 수 없습니다.')
    return save({ ...item, paymentRequestId, updatedAt: now(), updatedBy: '허수정' })
  },
  toCsvRows(items?: WithholdingTaxItem[]) {
    return (items ?? withholdingTaxService.getItems()).map((item) => ({
      paymentMonth: item.paymentMonth, paymentDate: item.paymentDate ?? '', campaignId: item.campaignId,
      ownerType: item.ownerType, ownerName: item.ownerName, grossSettlementAmount: item.grossSettlementAmount,
      withholdingBaseAmount: item.withholdingBaseAmount, incomeTaxAmount: item.incomeTaxAmount,
      localIncomeTaxAmount: item.localIncomeTaxAmount, totalWithholdingTaxAmount: item.totalWithholdingTaxAmount,
      finalPaymentAmount: item.finalPaymentAmount, status: item.status,
    }))
  },
}
