import type {
  SalesChannelType,
  SellerBusinessType,
  SellerEvidenceType,
  SellerSettlementCalculation,
  SellerSettlementDocument,
  SellerSettlementRule,
} from '../types/sellerSettlement'
import {
  calculateCompanyRemittanceToSupplier,
  calculateEffectiveSellerCommissionRate,
  calculateFinalSellerPayment,
  calculateProductSalesAmount,
  calculateSellerCommissionAmount,
  calculateSellerRemittanceToCompany,
  calculateShippingAmount,
  calculateSupplierCostAmount,
  calculateTotalCollectedAmount,
  calculateTotalCommissionAmount,
  calculateVendorCommissionAmount,
  getRecommendedEvidenceType,
} from '../utils/sellerSettlement'
import { campaignService } from './campaignService'
import { salesDataService } from './salesDataService'
import { settlementService } from './settlementService'
import { STORAGE_KEYS, storageService } from './storageService'

const now = () => new Date().toISOString()
const channelCollector = { supplier_link: 'supplier', wise_shop_link: 'wise_shop', seller_checkout: 'seller' } as const

function salesChannelForCampaign(campaignId: string): SalesChannelType {
  const campaign = campaignService.getCampaignById(campaignId)
  return campaign?.salesChannelType ?? campaign?.proposalSnapshots?.[0]?.actualSalesChannel ?? 'supplier_link'
}

function businessTypeForCampaign(campaignId: string): SellerBusinessType {
  if (campaignId === 'SCH-005') return 'simplified_business'
  if (campaignId === 'SCH-009') return 'freelancer'
  return campaignService.getCampaignById(campaignId)?.businessType === '법인사업자' ? 'corporation' : 'general_business'
}

function buildDefaultRule(campaignId: string, salesChannelType: SalesChannelType): SellerSettlementRule {
  const settlement = settlementService.getSettlementByCampaignId(campaignId)[0]
  const sales = settlement ? salesDataService.getSalesDataImportById(settlement.salesDataImportId) : undefined
  const businessType = businessTypeForCampaign(campaignId)
  const extraRate = campaignId === 'SCH-006' ? 3 : 0
  return {
    campaignId,
    salesChannelType,
    moneyCollector: channelCollector[salesChannelType],
    settlementDirection: salesChannelType === 'seller_checkout' ? 'seller_pays_company' : 'company_pays_seller',
    sellerCommissionRate: sales?.sellerCommissionRate ?? 17,
    externalMallExtraRate: extraRate,
    externalMallExtraReason: extraRate ? '외부 결제 PG 수수료 보전' : '',
    externalMallExtraApprovedBy: extraRate ? '대표 김승인' : '',
    externalMallExtraApprovedAt: extraRate ? '2026-07-18T09:00:00.000Z' : '',
    businessType,
    recommendedEvidenceType: getRecommendedEvidenceType(businessType),
    confirmedEvidenceType: getRecommendedEvidenceType(businessType),
    evidenceConfirmed: true,
    evidenceConfirmedBy: '허수정',
    evidenceConfirmedAt: '2026-07-18T10:00:00.000Z',
    evidenceMemo: 'MVP mock 증빙 확인',
    shippingAmount: campaignId === 'SCH-005' ? 60_000 : 0,
    sellerDeductions: 0,
    updatedAt: now(),
  }
}

function calculate(rule: SellerSettlementRule, settlementId: string): SellerSettlementCalculation {
  const settlement = settlementService.getSettlementById(settlementId)
  if (!settlement) throw new Error('기존 정산을 찾을 수 없습니다.')
  const sales = salesDataService.getSalesDataImportById(settlement.salesDataImportId)
  const rows = salesDataService.getRowsByImportId(settlement.salesDataImportId)
  if (!sales) throw new Error('판매 데이터를 찾을 수 없습니다.')
  const items = rows.map((row) => ({ optionName: row.optionName, quantity: row.netQuantity, unitPrice: row.unitPrice, amount: row.netSales }))
  const productSalesAmount = calculateProductSalesAmount(items)
  const shippingAmount = calculateShippingAmount(rule.shippingAmount)
  const totalCommissionRate = sales.totalCommissionRate ?? settlement.currentCalculation.totalCommissionRate
  const effectiveSellerCommissionRate = calculateEffectiveSellerCommissionRate(rule.sellerCommissionRate, rule.externalMallExtraRate)
  const totalCommissionAmount = calculateTotalCommissionAmount(productSalesAmount, totalCommissionRate)
  const sellerCommissionAmount = calculateSellerCommissionAmount(productSalesAmount, effectiveSellerCommissionRate)
  const vendorCommissionAmount = calculateVendorCommissionAmount(totalCommissionAmount, sellerCommissionAmount)
  const supplierCostAmount = calculateSupplierCostAmount(productSalesAmount, totalCommissionAmount)
  const sellerRemittanceToCompany = calculateSellerRemittanceToCompany(productSalesAmount, sellerCommissionAmount, shippingAmount)
  const tax = calculateFinalSellerPayment(sellerCommissionAmount, rule.businessType, rule.sellerDeductions)
  return {
    productSalesAmount, shippingAmount,
    totalCollectedAmount: calculateTotalCollectedAmount(productSalesAmount, shippingAmount),
    totalCommissionRate, totalCommissionAmount,
    sellerCommissionRate: rule.sellerCommissionRate,
    externalMallExtraRate: rule.externalMallExtraRate,
    effectiveSellerCommissionRate,
    sellerCommissionAmount, vendorCommissionAmount,
    sellerDeductions: rule.sellerDeductions,
    supplierInvoiceAmount: totalCommissionAmount,
    sellerGrossSettlementAmount: sellerCommissionAmount,
    supplierCostAmount,
    sellerKeepsAmount: sellerCommissionAmount,
    sellerRemittanceToCompany,
    companyRemittanceToSupplier: calculateCompanyRemittanceToSupplier(supplierCostAmount, shippingAmount),
    ...tax,
  }
}

export const sellerSettlementService = {
  getRules() {
    const existing = storageService.getItem<SellerSettlementRule[]>(STORAGE_KEYS.sellerSettlementRules, [])
    if (existing.length) return existing
    const rules = settlementService.getSettlements().flatMap((settlement) => {
      return [buildDefaultRule(settlement.campaignId, salesChannelForCampaign(settlement.campaignId))]
    })
    storageService.setItem(STORAGE_KEYS.sellerSettlementRules, rules)
    return rules
  },
  getSellerSettlementRule(campaignId: string) {
    return this.getRules().find((item) => item.campaignId === campaignId)
  },
  ensureSellerSettlementRule(campaignId: string) {
    const existing = this.getSellerSettlementRule(campaignId)
    if (existing) return existing
    return this.saveRule(buildDefaultRule(campaignId, salesChannelForCampaign(campaignId)))
  },
  saveRule(rule: SellerSettlementRule) {
    storageService.setItem(STORAGE_KEYS.sellerSettlementRules, [...this.getRules().filter((item) => item.campaignId !== rule.campaignId), rule])
    return rule
  },
  confirmEvidenceType(campaignId: string, evidenceType: SellerEvidenceType, confirmedBy: string) {
    const rule = this.getSellerSettlementRule(campaignId)
    if (!rule) return undefined
    return this.saveRule({ ...rule, confirmedEvidenceType: evidenceType, evidenceConfirmed: true, evidenceConfirmedBy: confirmedBy, evidenceConfirmedAt: now(), updatedAt: now() })
  },
  recalculateSellerSettlement(settlementId: string) {
    const settlement = settlementService.getSettlementById(settlementId)
    const rule = settlement && this.getSellerSettlementRule(settlement.campaignId)
    if (!rule) throw new Error('결제 방식을 먼저 확인해주세요.')
    return calculate(rule, settlementId)
  },
  getDocuments() {
    const existing = storageService.getItem<SellerSettlementDocument[]>(STORAGE_KEYS.sellerSettlementDocuments, [])
    if (existing.length) return existing
    const documents = settlementService.getSettlements().flatMap((settlement) => {
      try { return [this.createSellerDocument(settlement.id, false)] } catch { return [] }
    })
    storageService.setItem(STORAGE_KEYS.sellerSettlementDocuments, documents)
    return documents
  },
  getDocumentBySettlementId(settlementId: string) {
    return this.getDocuments().find((item) => item.settlementId === settlementId)
  },
  createSellerDocument(settlementId: string, persist = true) {
    const settlement = settlementService.getSettlementById(settlementId)
    if (!settlement) throw new Error('기존 정산을 찾을 수 없습니다.')
    const campaign = campaignService.getCampaignById(settlement.campaignId)
    const rule = this.getSellerSettlementRule(settlement.campaignId)
    if (!campaign?.salesChannelType || !rule) throw new Error('결제 방식을 먼저 확인해주세요.')
    if (!rule.evidenceConfirmed || !rule.confirmedEvidenceType) throw new Error('증빙 유형을 최종 확인해주세요.')
    const sales = salesDataService.getSalesDataImportById(settlement.salesDataImportId)
    const rows = salesDataService.getRowsByImportId(settlement.salesDataImportId)
    const calculation = calculate(rule, settlement.id)
    const document: SellerSettlementDocument = {
      id: `seller-document-${settlement.id}`, settlementId, campaignId: campaign.id,
      sellerId: campaign.sellerId, sellerName: campaign.sellerName, campaignName: campaign.campaignName,
      salesPeriod: `${sales?.salesStartDate ?? campaign.startDate} ~ ${sales?.salesEndDate ?? campaign.endDate}`,
      productName: campaign.productName,
      items: rows.map((row) => ({ optionName: row.optionName, quantity: row.netQuantity, unitPrice: row.unitPrice, amount: row.netSales })),
      salesChannelType: rule.salesChannelType, direction: rule.settlementDirection,
      businessType: rule.businessType, evidenceType: rule.confirmedEvidenceType,
      evidenceRequestAmount: calculation.taxDocumentAmount, dueDate: settlement.paymentDueDate,
      companyAccountPlaceholder: '와이즈벤더 000-0000-0000 (예금주 placeholder)',
      remittanceConfirmed: false, calculation, createdAt: now(),
    }
    if (persist) storageService.setItem(STORAGE_KEYS.sellerSettlementDocuments, [document, ...this.getDocuments().filter((item) => item.settlementId !== settlementId)])
    return document
  },
  createSellerSettlement(settlementId: string) { return this.createSellerDocument(settlementId) },
}
