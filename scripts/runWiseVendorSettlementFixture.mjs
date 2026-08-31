const { calculateSettlement, validateSettlementCalculation } = await import('../src/shared/utils/settlement.ts')
const { mapNotionIntegratedListRecord, notionCampaignMigrationService } = await import('../src/shared/services/notionCampaignMigrationService.ts')

const amounts = [1_216_800, 2_156_000, 2_958_000, 864_000, 1_288_000, 1_856_400, 1_113_600, 4_850_400, 22_604_400, 17_500]
const quantities = [169, 154, 145, 120, 92, 91, 116, 258, 819, 7]
const prices = [7_200, 14_000, 20_400, 7_200, 14_000, 20_400, 9_600, 18_800, 27_600, 2_500]
const rows = amounts.map((grossSales, index) => ({
  id: `baniere-row-${index + 1}`,
  salesDataImportId: 'baniere-import',
  campaignId: 'baniere-campaign',
  optionName: `바니에르 옵션 ${index + 1}`,
  quantity: quantities[index],
  unitPrice: prices[index],
  totalCommissionRate: 35,
  sellerCommissionRate: 28,
  grossSales,
  canceledQuantity: 0,
  refundedQuantity: 0,
  netQuantity: quantities[index],
  netSales: grossSales,
  validationStatus: 'valid',
  validationMessage: '',
}))
const deduction = {
  id: 'baniere-manager-prepayment', settlementId: 'baniere-settlement', campaignId: 'baniere-campaign',
  type: 'event', title: '매니저 선결제 이벤트비', amount: 24_700, costOwner: 'manager',
  linkedData: 'fixture:baniere', evidenceStatus: 'confirmed', applyLocation: 'manager_reimbursement', reflected: true,
  memo: '페이백 및 커피 이벤트 비용', createdAt: '2026-08-01T00:00:00.000Z', updatedAt: '2026-08-01T00:00:00.000Z',
}
const calculation = calculateSettlement({
  id: 'baniere-import', campaignId: 'baniere-campaign', fileName: 'baniere.xlsx', fileSize: 0,
  sourceType: 'file', uploadedBy: 'fixture', uploadedAt: '2026-08-01T00:00:00.000Z', reviewStatus: '확정 완료',
  settlementStatus: '정산 가능', totalQuantity: 1_971, totalSalesAmount: 38_925_100, notes: '', totalCommissionRate: 35, sellerCommissionRate: 28,
}, rows, [deduction], 'tax_invoice', '바니에르 실제 정산 검증')

const expected = {
  grossSales: 38_925_100,
  grossCommission: 13_623_785,
  sellerCommissionAmount: 10_899_028,
  vendorCommission: 2_724_757,
  managerReimbursementTotal: 24_700,
  distributableVendorCommission: 2_700_057,
  managerBaseShareAmount: 1_890_040,
  managerAmount: 1_914_740,
  companyAmount: 810_017,
}
const checks = Object.entries(expected).map(([key, value]) => [key, calculation[key] === value, calculation[key], value])
checks.push(['calculation validation', validateSettlementCalculation(calculation).valid, validateSettlementCalculation(calculation), true])

const notionRecord = {
  sourceId: '2b6ddc8b-71f1-802f-9b9b-e84cce038d42', title: '집순키친x풍류댁 보리굴비',
  startDate: '2026-02-07', endDate: '2026-02-11', landingPage: '와이즈(네이버)',
  sellerId: 'seller-jipsun-kitchen', sellerName: '집순키친', productId: 'product-pungryudaek-borigulbi', productName: '풍류댁 보리굴비',
  managerId: 'manager-wise-01', managerName: '고정원', inputCompleted: true, settlementDocumentCompleted: true, supplierSettlementCompleted: true,
}
const migration = mapNotionIntegratedListRecord(notionRecord, { today: '2026-08-31', migratedAt: '2026-08-31T00:00:00.000Z' })
const migratedCampaigns = notionCampaignMigrationService.mergeCampaigns([], [migration])
checks.push(['notion validation', notionCampaignMigrationService.validate([notionRecord]).length === 0, notionCampaignMigrationService.validate([notionRecord]), []])
checks.push(['notion channel mapping', migration.campaign.salesChannelType === 'wise_shop_link', migration.campaign.salesChannelType, 'wise_shop_link'])
checks.push(['notion source identity', migration.campaign.notionImportMetadata?.sourceId === notionRecord.sourceId, migration.campaign.notionImportMetadata, notionRecord.sourceId])
checks.push(['notion local pilot merge', migratedCampaigns.length === 1 && migratedCampaigns[0].campaignName === notionRecord.title, migratedCampaigns.map((item) => item.campaignName), [notionRecord.title]])

for (const [name, passed, actual, expectedValue] of checks) console.log(`${passed ? 'PASS' : 'FAIL'} ${name}: actual=${JSON.stringify(actual)} expected=${JSON.stringify(expectedValue)}`)
if (checks.some(([, passed]) => !passed)) process.exitCode = 1
