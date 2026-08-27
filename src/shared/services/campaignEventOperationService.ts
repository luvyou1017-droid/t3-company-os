import type { CampaignEvent, CampaignEventCostHandling } from '../types/campaignCreation'
import { campaignService } from './campaignService'
import { STORAGE_KEYS, storageService } from './storageService'

export type CampaignEventOperation = CampaignEvent & {
  campaignId: string
  costHandling: CampaignEventCostHandling
  winnerCountConfirmed: boolean
  updatedAt: string
}

const now = () => new Date().toISOString()
const normalize = (event: CampaignEvent, campaignId: string): CampaignEventOperation => {
  const costHandling = event.costHandling ?? (event.payer === 'manager' ? 'manager_prepaid' : event.payer === 'vendor' || event.payer === 'company_support' ? 'vendor_free' : 'company_direct')
  const actualCount = event.winners?.length ? event.winners.length : event.confirmedQuantity
  const confirmedTotalAmount = costHandling === 'vendor_free' ? 0 : actualCount === undefined ? undefined : actualCount * event.rewardUnitPrice
  return { ...event, campaignId, eventName: event.eventName || event.memo || event.rewardProductName || '이벤트', costHandling, shippingOwner: event.shippingOwner ?? (costHandling === 'vendor_free' ? 'vendor' : 'company'), shippingStatus: event.shippingStatus ?? (actualCount === undefined ? 'winner_registration_pending' : 'shipping_pending'), confirmedQuantity: actualCount, estimatedTotalAmount: costHandling === 'vendor_free' ? 0 : event.plannedQuantity * event.rewardUnitPrice, confirmedTotalAmount, winnerCountConfirmed: event.winnerCountConfirmed ?? false, updatedAt: now() }
}

export const campaignEventOperationService = {
  getAll() { return storageService.getItem<CampaignEventOperation[]>(STORAGE_KEYS.campaignEventOperations, []) },
  getByCampaignId(campaignId: string) {
    const stored = this.getAll().filter((item) => item.campaignId === campaignId)
    if (stored.length) return stored
    return (campaignService.getCampaignById(campaignId)?.campaignEvents ?? []).map((event) => normalize(event, campaignId))
  },
  save(input: CampaignEventOperation) {
    const normalized = normalize(input, input.campaignId)
    storageService.setItem(STORAGE_KEYS.campaignEventOperations, [normalized, ...this.getAll().filter((item) => item.id !== normalized.id)])
    return normalized
  },
  confirmWinnerCount(campaignId: string, eventId: string, actualCount: number) {
    const target = this.getByCampaignId(campaignId).find((item) => item.id === eventId)
    if (!target) throw new Error('이벤트를 찾을 수 없습니다.')
    return this.save({ ...target, confirmedQuantity: actualCount, winners: (target.winners ?? []).slice(0, actualCount), winnerCountConfirmed: true })
  },
  requestManagerPrepayment(campaignId: string, eventId: string, reason: string, requestedAmount: number, managerId: string) {
    const target = this.getByCampaignId(campaignId).find((item) => item.id === eventId)
    if (!target || target.costHandling !== 'manager_prepaid') throw new Error('매니저 선결제 이벤트를 찾을 수 없습니다.')
    return this.save({ ...target, managerPrepayment: { status: 'approval_pending', reason, requestedAmount, managerId } })
  },
  approveManagerPrepayment(campaignId: string, eventId: string, approvedAmount: number) {
    const target = this.getByCampaignId(campaignId).find((item) => item.id === eventId)
    if (!target?.managerPrepayment || target.managerPrepayment.status !== 'approval_pending') throw new Error('승인 대기 중인 요청이 없습니다.')
    return this.save({ ...target, managerPrepayment: { ...target.managerPrepayment, status: 'approved', approvedAmount } })
  },
  confirmManagerPrepaymentEvidence(campaignId: string, eventId: string, actualAmount: number) {
    const target = this.getByCampaignId(campaignId).find((item) => item.id === eventId)
    if (!target?.managerPrepayment || target.managerPrepayment.status !== 'approved') throw new Error('사전 승인된 선결제가 아닙니다.')
    return this.save({ ...target, managerPrepayment: { ...target.managerPrepayment, status: 'evidence_confirmed', actualAmount, evidenceConfirmed: true } })
  },
  getConfirmedSettlementCost(event: CampaignEventOperation) {
    if (!event.winnerCountConfirmed) return undefined
    if (event.costHandling === 'vendor_free') return 0
    if (event.costHandling === 'manager_prepaid') {
      const prepaid = event.managerPrepayment
      return prepaid?.status === 'evidence_confirmed' && prepaid.evidenceConfirmed ? Math.min(prepaid.actualAmount ?? 0, prepaid.approvedAmount ?? 0) : 0
    }
    return (event.confirmedQuantity ?? event.winners?.length ?? 0) * event.rewardUnitPrice
  },
  validateForSettlementConfirmation(campaignId: string) {
    const events = this.getByCampaignId(campaignId)
    return events.flatMap((event) => event.winnerCountConfirmed ? [] : [`${event.eventName || event.rewardProductName || '이벤트'} 당첨자 인원을 확정해주세요.`])
  },
}
