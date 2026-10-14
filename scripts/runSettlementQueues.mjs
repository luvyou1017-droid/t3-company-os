import assert from 'node:assert/strict'
import { createServer } from 'vite'

const values = new Map()
globalThis.localStorage = { getItem: key => values.get(key) ?? null, setItem: (key,value) => values.set(key,String(value)), removeItem: key => values.delete(key) }
const vite = await createServer({ envDir:false, server:{ middlewareMode:true, hmr:false }, appType:'custom' })
try {
  const { pendingSellerLinkReceipts } = await vite.ssrLoadModule('/src/shared/utils/settlementQueues.ts')
  const { previewBatchSettlementConfirmations, submitBatchSettlementConfirmations } = await vite.ssrLoadModule('/src/shared/services/batchSettlementConfirmationService.ts')
  const { settlementService } = await vite.ssrLoadModule('/src/shared/services/settlementService.ts')
  const { campaignService } = await vite.ssrLoadModule('/src/shared/services/campaignService.ts')
  const { salesDataService } = await vite.ssrLoadModule('/src/shared/services/salesDataService.ts')
  const { calculateSettlement } = await vite.ssrLoadModule('/src/shared/utils/settlement.ts')
  const source = salesDataService.getSalesDataImports()[0]
  const campaign = campaignService.getCampaignById(source.campaignId)
  const draft = { id:'test-receipt', campaignId:campaign.id, salesDataImportId:source.id, status:'draft', settlementConfirmed:false, currentCalculation:{grossSales:0,totalCommissionRate:0,sellerCommissionRate:0,deductions:[]}, updatedAt:'2026-10-14' }
  const other = { ...draft, id:'test-payout' }
  const campaigns = new Map([[campaign.id,{ ...campaign, salesChannelType:'seller_checkout' }]])
  const sales = new Map([[source.id,{ ...source, settlementTerms:{ ...source.settlementTerms, salesChannelType:'seller_checkout' } }]])
  assert.deepEqual(pendingSellerLinkReceipts([draft,{...draft,id:'done',status:'completed'},{...draft,id:'received',sellerLinkReceipt:{amount:100}},other],campaigns,sales).map(item=>item.id),['test-receipt','test-payout'])
  assert.equal(pendingSellerLinkReceipts([draft],campaigns,new Map([[source.id,{...source,settlementTerms:{...source.settlementTerms,salesChannelType:'wise_shop_link'}}]])).length,0)
  settlementService.saveSettlements([draft])
  const before = JSON.stringify([...values])
  const preview = previewBatchSettlementConfirmations([draft.id,draft.id],'TEST')
  assert.equal(preview.length,1)
  assert(preview[0].reason,'incomplete settlement must be excluded')
  assert.equal(JSON.stringify([...values]),before,'preview must not write a settlement or snapshot')
  const rows = salesDataService.getSettlementRowsByImportId(source.id)
  const calculation = calculateSettlement(source,rows,[],'withholding_3_3')
  const valid = { ...draft, id:'test-valid', currentCalculation:calculation, calculationSnapshot:undefined, settlementVersion:1, taxType:'withholding_3_3', evidenceStatus:'confirmed', reviewChecklist:{} }
  settlementService.saveSettlements([valid])
  const beforeValid=JSON.stringify([...values])
  const validPreview=previewBatchSettlementConfirmations([valid.id],'TEST')
  assert.equal(validPreview.length,1)
  assert.equal(validPreview[0].reason,'',validPreview[0].reason)
  assert.equal(JSON.stringify([...values]),beforeValid,'valid preview must not persist financial snapshots')
  settlementService.saveSettlements([{...valid,updatedAt:'2026-10-15'}])
  await assert.rejects(()=>submitBatchSettlementConfirmations(validPreview,'TEST',async()=>{}),/데이터가 달라졌습니다/)
  settlementService.saveSettlements([valid])
  let synced=0
  assert.equal(await submitBatchSettlementConfirmations(validPreview,'TEST',async keys=>{ assert(keys.includes('t3_company_os_settlement_versions'));synced++ }),1)
  assert.equal(synced,1)
  assert.equal(settlementService.getSettlementById(valid.id).settlementConfirmed,true)
  assert(settlementService.getSettlementById(valid.id).calculationSnapshot)
  assert(previewBatchSettlementConfirmations([valid.id],'TEST')[0].reason.includes('이미 확정'))
  console.log('PASS seller-link receipt queue excludes completed/received/other channels; batch confirmation preview deduplicates and preserves source')
} finally { await vite.close() }
