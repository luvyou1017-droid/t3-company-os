import { scheduleRequiredErrors, mergeNotionCampaign } from '../utils/campaignReadiness'
import type { Campaign, CampaignSalesChannelType, LinkOwner } from '../types/campaign'
import type { NotionCampaignMigrationPreview, NotionIntegratedListRecord } from '../types/notionMigration'

const channelMap: Record<NonNullable<NotionIntegratedListRecord['landingPage']>, { salesChannelType: CampaignSalesChannelType; linkOwner: LinkOwner }> = {
  공급사: { salesChannelType: 'supplier_link', linkOwner: '브랜드사' },
  '와이즈(스룩)': { salesChannelType: 'wise_shop_link', linkOwner: '자사' },
  '와이즈(네이버)': { salesChannelType: 'wise_shop_link', linkOwner: '자사' },
  셀러: { salesChannelType: 'seller_checkout', linkOwner: '셀러' },
}

function deriveStatus(record: NotionIntegratedListRecord, today: string): Campaign['status'] {
  if (record.sellerSettlementCompleted && record.managerSettlementCompleted && record.supplierSettlementCompleted) return 'settled'
  const endDate = record.endDate ?? record.startDate
  if (endDate < today) return 'closed'
  if (record.startDate <= today && endDate >= today) return 'active'
  return record.inputCompleted ? 'preparing' : 'draft'
}

function notionCampaignCode(sourceId: string) {
  const normalized = sourceId.replace(/-/g, '').toUpperCase()
  return `NT-${normalized.slice(0, 8)}-${normalized.slice(-8)}`
}

export function mapNotionIntegratedListRecord(record: NotionIntegratedListRecord, options: { today?: string; migratedAt?: string } = {}): NotionCampaignMigrationPreview {
  const migratedAt = options.migratedAt ?? new Date().toISOString()
  const today = options.today ?? migratedAt.slice(0, 10)
  const channel = record.landingPage ? channelMap[record.landingPage] : undefined
  const warnings: string[] = []
  if (!channel) warnings.push('랜딩페이지 방식 확인 필요')
  if (!record.productId) warnings.push('상품 연결 필요')
  if (!record.supplierId || !record.supplierName) warnings.push('공급처 미연결')

  const campaign: Campaign = {
    id: `notion-${record.sourceId.replace(/-/g, '').toLowerCase()}`,
    campaignCode: notionCampaignCode(record.sourceId),
    campaignName: record.title,
    sellerId: record.sellerId,
    sellerName: record.sellerName,
    supplierId: record.supplierId, supplierName: record.supplierName,
    supplyAudience: record.supplyAudience, settlementVendorName: record.settlementVendorName,
    brandId: '', brandName: '',
    productId: record.productId,
    productName: record.productName,
    managerId: record.managerId,
    managerName: record.managerName,
    mdId: record.managerId,
    mdName: record.managerName,
    startDate: record.startDate,
    endDate: record.endDate ?? '',
    linkOwner: channel?.linkOwner ?? '자사',
    salesChannelType: channel?.salesChannelType,
    businessType: '미정',
    landingPageType: record.landingPage,
    settlementDueDate: record.endDate ?? record.startDate,
    status: deriveStatus(record, today),
    landingPageCompleted: record.landingPageCompleted ?? false,
    settlementDocumentCompleted: record.settlementDocumentCompleted ?? false,
    sellerPaymentCompleted: record.sellerSettlementCompleted ?? false,
    managerPaymentCompleted: record.managerSettlementCompleted ?? false,
    vendorSettlementCompleted: record.supplierSettlementCompleted ?? false,
    memo: [record.vendorDeductionMemo, record.sellerDeductionMemo].filter(Boolean).join(' / ') || undefined,
    createdAt: migratedAt,
    updatedAt: migratedAt,
    notionImportMetadata: { sourceId: record.sourceId, importedAt: migratedAt, provider: 'notion' },
  }

  warnings.push('정산조건 확인 필요')
  return { source: record, campaign, warnings, blockingErrors: scheduleRequiredErrors(campaign) }
}

export const notionCampaignMigrationService = {
  preview(records: NotionIntegratedListRecord[], options?: { today?: string; migratedAt?: string }) {
    return records.map((record) => mapNotionIntegratedListRecord(record, options))
  },
  validate(records: NotionIntegratedListRecord[]) {
    const seen = new Set<string>()
    return records.flatMap((record) => {
      const errors: string[] = []
      if (seen.has(record.sourceId)) errors.push(`${record.title}: 중복된 Notion sourceId`)
      seen.add(record.sourceId)
      errors.push(...mapNotionIntegratedListRecord(record).blockingErrors.map(error => `${record.title || record.sourceId}: ${error}`))
      return errors
    })
  },
  mergeCampaigns(existing: Campaign[], previews: NotionCampaignMigrationPreview[]) {
    const next = [...existing]
    for (const item of previews) {
      const matches = next.filter(c => c.notionImportMetadata?.sourceId?.replace(/-/g, '') === item.source.sourceId.replace(/-/g, ''))
      if (matches.length > 1) throw new Error(`${item.source.title}: 동일 Notion ID 중복 연결 확인 필요`)
      const merged = mergeNotionCampaign(matches[0], item.campaign)
      if (matches[0]) next[next.indexOf(matches[0])] = merged
      else next.push(merged)
    }
    return next
  },
}
