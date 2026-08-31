import type { Settlement } from '../types/settlement'
import { campaignService } from './campaignService'

export const managerSettlementReportService = {
  getReport(settlement: Settlement) {
    const campaign = campaignService.getCampaignById(settlement.campaignId)
    const calculation = settlement.currentCalculation
    const snapshot = campaign?.proposalSnapshots?.[0]
    const managerDeductions = calculation.deductions.filter((item) => item.reflected && item.applyLocation === 'manager_payment')
    const companyCosts = calculation.deductions.filter((item) => item.reflected && item.applyLocation === 'net_company_commission')
    return {
      managerId: campaign?.managerId,
      campaignId: settlement.campaignId,
      totalSales: calculation.grossSales,
      productMargin: calculation.vendorCommission,
      actualSalesChannel: snapshot?.actualSalesChannel ?? campaign?.salesChannelType,
      actualPgCost: snapshot?.actualPgCost,
      managerBaseShare: calculation.managerBaseShareAmount,
      managerReimbursement: calculation.managerReimbursementTotal,
      managerDeductions,
      managerFinalSettlement: calculation.managerAmount,
      companyBaseShare: calculation.companyAmount,
      companyCosts,
      companyFinalContribution: calculation.companyAmount,
    }
  },
}
