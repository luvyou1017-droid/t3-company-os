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

export function mapNotionIntegratedListRecord(record: NotionIntegratedListRecord, options: { today?: string; migratedAt?: string } = {}): NotionCampaignMigrationPreview {
  const migratedAt = options.migratedAt ?? new Date().toISOString()
  const today = options.today ?? migratedAt.slice(0, 10)
  const channel = record.landingPage ? channelMap[record.landingPage] : undefined
  const warnings: string[] = []
  if (!channel) warnings.push('랜딩페이지 방식 확인 필요')
  if (!record.endDate) warnings.push('종료일이 없어 시작일과 동일하게 임시 적용')
  if (!record.supplierId || !record.supplierName) warnings.push('공급처 연결 확인 필요')

  const campaign: Campaign = {
    id: `notion-${record.sourceId}`,
    campaignCode: `NT-${record.sourceId.replace(/-/g, '').slice(0, 10).toUpperCase()}`,
    campaignName: record.title,
    sellerId: record.sellerId,
    sellerName: record.sellerName,
    brandId: record.supplierId ?? `unresolved-supplier-${record.sourceId}`,
    brandName: record.supplierName ?? '공급처 확인 필요',
    productId: record.productId,
    productName: record.productName,
    managerId: record.managerId,
    managerName: record.managerName,
    mdId: record.managerId,
    mdName: record.managerName,
    startDate: record.startDate,
    endDate: record.endDate ?? record.startDate,
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

  return { source: record, campaign, warnings }
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
      if (!record.title || !record.sellerId || !record.productId || !record.managerId || !record.startDate) errors.push(`${record.title || record.sourceId}: 필수 관계 또는 일정 누락`)
      return errors
    })
  },
  mergeCampaigns(existing: Campaign[], previews: NotionCampaignMigrationPreview[]) {
    const incomingSourceIds = new Set(previews.map((item) => item.source.sourceId))
    const preserved = existing.filter((campaign) => !campaign.notionImportMetadata?.sourceId || !incomingSourceIds.has(campaign.notionImportMetadata.sourceId))
    return [...previews.map((item) => item.campaign), ...preserved]
  },
}
