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
      managerBaseShare: calculation.managerAmount + calculation.managerDeductionTotal,
      managerDeductions,
      managerFinalSettlement: calculation.managerAmount,
      companyBaseShare: calculation.distributableVendorCommission - (calculation.managerAmount + calculation.managerDeductionTotal),
      companyCosts,
      companyFinalContribution: calculation.companyAmount,
    }
  },
}
