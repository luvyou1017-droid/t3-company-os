class MemoryStorage {
  data = new Map()
  getItem(key) { return this.data.get(key) ?? null }
  setItem(key, value) { this.data.set(key, String(value)) }
  removeItem(key) { this.data.delete(key) }
}
globalThis.localStorage = new MemoryStorage()

const { createServer } = await import('vite')
const vite = await createServer({ configFile: false, server: { middlewareMode: true, hmr: false }, appType: 'custom' })
try {
  const { settlementService } = await vite.ssrLoadModule('/src/shared/services/settlementService.ts')
  const { salesDataService } = await vite.ssrLoadModule('/src/shared/services/salesDataService.ts')
  const { campaignService } = await vite.ssrLoadModule('/src/shared/services/campaignService.ts')
  const { storageService, STORAGE_KEYS } = await vite.ssrLoadModule('/src/shared/services/storageService.ts')
  const { sellerLinkReceiptAmount } = await vite.ssrLoadModule('/src/shared/utils/sellerLinkReceipt.ts')
  const { calculateSettlement } = await vite.ssrLoadModule('/src/shared/utils/settlement.ts')
  const source = salesDataService.getSalesDataImports().find(item => salesDataService.getSettlementRowsByImportId(item.id).length)
  if (!source) throw new Error('격리 정산 fixture가 없습니다.')
  const campaign = campaignService.getCampaignById(source.campaignId)
  const importForTest = { ...source, supplyAudience: 'vendor', settlementTerms: { ...source.settlementTerms, skuConditions: source.settlementTerms?.skuConditions ?? [], salesChannelType: 'seller_checkout', moneyCollector: 'seller' }, shippingRevenue: 0 }
  salesDataService.updateSalesDataImport(importForTest)
  salesDataService.saveRows(salesDataService.getSalesDataRows().map(row => row.salesDataImportId === source.id ? { ...row, sellerCommissionRate: 15 } : row))
  const calculation = calculateSettlement(importForTest, salesDataService.getSettlementRowsByImportId(source.id), [], 'withholding_3_3')
  const base = { id: 'receipt-fixture', campaignId: source.campaignId, salesDataImportId: source.id, settlementVersion: 1, status: 'approved', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), createdBy: '대표', assigneeName: '대표', paymentDueDate: '', taxType: 'withholding_3_3', evidenceStatus: 'confirmed', accountConfirmed: true, taxEvidenceConfirmed: true, sellerPaymentCompleted: false, managerPaymentCompleted: false, companySettlementCompleted: false, reviewChecklist: {}, calculationSnapshot: calculation, currentCalculation: calculation, calculationSteps: [], hasSourceChanged: false }
  const draft = { ...base, settlementConfirmed: true, settlementConfirmedVersion: base.settlementVersion }
  settlementService.saveSettlements([draft])
  storageService.setItem(STORAGE_KEYS.paymentRequests, [])
  const amount = sellerLinkReceiptAmount(draft, importForTest, salesDataService.getSettlementRowsByImportId(source.id), campaign)
  if (amount === undefined || amount <= 0) throw new Error('입금 요청액을 계산할 수 없습니다.')
  const day = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' })
  const fails = (run) => { try { run(); return false } catch { return true } }
  if (!fails(() => settlementService.confirmSellerLinkReceipt(base.id, amount, day, '직원', '매니저'))) throw new Error('권한 검증 실패')
  if (!fails(() => settlementService.confirmSellerLinkReceipt(base.id, amount + 1, day, '대표', '대표'))) throw new Error('금액 검증 실패')
  const completed = settlementService.confirmSellerLinkReceipt(base.id, amount, day, '대표', '대표')
  if (completed.status !== 'completed' || completed.sellerLinkReceipt?.amount !== amount || completed.sellerPaymentCompleted !== draft.sellerPaymentCompleted || completed.managerPaymentCompleted !== draft.managerPaymentCompleted || !fails(() => settlementService.confirmSellerLinkReceipt(base.id, amount, day, '대표', '대표'))) throw new Error('입금 완료 또는 중복 방지 실패')
  const second = { ...base, id: `${base.id}-pending`, status: 'approved', settlementConfirmed: true, hasSourceChanged: false, supplierPayment: undefined, currentCalculation: { ...calculation, managerAmount: 1000 } }
  const sellerSource = { ...importForTest, supplyAudience: 'seller' }
  salesDataService.updateSalesDataImport(sellerSource)
  campaignService.saveCampaigns(campaignService.getCampaigns().map(item => item.id === campaign.id ? { ...item, managerId: 'manager-receipt-test', managerName: '매니저 테스트' } : item))
  settlementService.saveSettlements([...settlementService.getSettlements(), second])
  storageService.setItem(STORAGE_KEYS.paymentRequests, [{ id: 'manager-request', settlementId: second.id, recipientType: 'manager', status: 'approved' }])
  const secondAmount = sellerLinkReceiptAmount(second, sellerSource, salesDataService.getSettlementRowsByImportId(source.id), campaign)
  const received = settlementService.confirmSellerLinkReceipt(second.id, secondAmount, day, '대표', '대표')
  if (received.status !== 'partially_paid' || !received.sellerLinkReceipt || received.managerPaymentCompleted || !fails(() => settlementService.confirmSellerLinkReceipt(second.id, secondAmount, day, '대표', '대표'))) throw new Error('매니저 지급 중 입금 확인 분리 실패')
  const paid = settlementService.markManagerPaymentCompleted(second.id)
  if (paid?.status !== 'completed' || !paid.sellerLinkReceipt || !paid.managerPaymentCompleted) throw new Error('매니저 지급 후 최종 완료 실패')
  const third = { ...second, id: `${base.id}-seller-request` }
  settlementService.saveSettlements([...settlementService.getSettlements(), third])
  storageService.setItem(STORAGE_KEYS.paymentRequests, [{ id: 'seller-request', settlementId: third.id, recipientType: 'seller', status: 'approved' }])
  if (!fails(() => settlementService.confirmSellerLinkReceipt(third.id, secondAmount, day, '대표', '대표'))) throw new Error('셀러 중복 지급요청 차단 실패')
  console.log('셀러링크 입금 확인: 금액·권한·중복·매니저 지급 분리·최종 완료 검증 통과')
} finally { await vite.close() }
