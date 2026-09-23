import assert from 'node:assert/strict'
import { createServer } from 'vite'
class MemoryStorage { data = new Map(); getItem(k) { return this.data.get(k) ?? null }; setItem(k,v) { this.data.set(k,String(v)) }; removeItem(k) { this.data.delete(k) } }
globalThis.localStorage = new MemoryStorage()
const vite = await createServer({ configFile:false, envDir:false, server:{middlewareMode:true,hmr:false},appType:'custom' })
let count=0
const check=(name,fn)=>{fn();console.log(`PASS ${name}`);count++}
try {
 const load=p=>vite.ssrLoadModule(`/src/shared/${p}.ts`)
 const { calculateFinalSellerPayment:payout,sellerPayoutVersion }=await load('utils/sellerSettlement')
 const { calculateWithholding }=await load('utils/withholdingTax')
 const { accountingRows,accountingExportRows }=await load('utils/accountingRows')
 const { sellerAccountText }=await load('utils/sellerAccountText')
 const { calculateSettlement }=await load('utils/settlement')
 const { settlementService }=await load('services/settlementService')
 const { sellerSettlementService }=await load('services/sellerSettlementService')
 const { salesDataService }=await load('services/salesDataService')
 const { campaignService }=await load('services/campaignService')
 const { sellerMasterService }=await load('services/sellerMasterService')
 const { paymentRequestService }=await load('services/paymentRequestService')
 const { withholdingTaxService }=await load('services/withholdingTaxService')
 const { storageService,STORAGE_KEYS }=await load('services/storageService')
 check('하루살림 user-supplied gross 343890: all business types',()=>{
  assert.equal(payout(343890,'general_business',0).finalSellerPaymentAmount,343890)
  assert.equal(payout(343890,'simplified_business',0).finalSellerPaymentAmount,312627)
  const t=payout(343890,'freelancer',0)
  assert.deepEqual([t.vatExcludedAmount,t.withholding.incomeTaxAmount,t.withholding.localIncomeTaxAmount,t.withholdingTaxAmount,t.finalSellerPaymentAmount],[312627,9370,930,10300,302327])
 })
 check('old displayed amounts reproduced by deduct-after-tax (illustrative inputs, not live DB)',()=>{
  assert.equal(payout(372940,'general_business',29050,1).finalSellerPaymentAmount,343890)
  assert.equal(payout(372940,'simplified_business',29050,1).finalSellerPaymentAmount,309986)
  assert.equal(payout(372940,'freelancer',29050,1).finalSellerPaymentAmount,298806)
  assert.equal(payout(372940,'simplified_business',29050,2).finalSellerPaymentAmount,312627)
  assert.equal(payout(372940,'freelancer',29050,2).finalSellerPaymentAmount,302327)
 })
 check('adjustments resolved before VAT and tax; no hardcoded special case',()=>{
  for(const [g,d,a] of [[400000,70000,13890],[343890,0,0],[372940,29050,0]]) {
   assert.equal(payout(g,'freelancer',d,2,a).finalSellerPaymentAmount,302327)
  }
  assert.equal(payout(100000,'simplified_business',10000).finalSellerPaymentAmount,81818)
  assert.throws(()=>payout(100,'freelancer',101))
 })
 check('truncation order and 10-won boundaries',()=>{
  for(const gross of [0,1,333,366,367,3666,3667,11000,343890,999999]) {
   const t=calculateWithholding(gross)
   const income=Math.floor(Math.round(gross/1.1)*3/1000)*10
   const local=Math.floor(income/100)*10
   assert.equal(t.incomeTaxAmount,income);assert.equal(t.localIncomeTaxAmount,local)
  }
 })
 const campaign={id:'test-haru-campaign',sellerId:'test-haru',sellerName:'하루살림',campaignName:'격리 테스트',managerId:'test-manager',managerName:'테스트',productName:'테스트 상품'}
 const sales={id:'test-sales',campaignId:campaign.id,totalCommissionRate:40,sellerCommissionRate:20,status:'confirmed',supplyAudience:'seller',settlementTerms:{}}
 const rows=[{id:'test-row',optionName:'옵션',unitPrice:1864700,quantity:1,netQuantity:1,netSales:1864700,grossSales:1864700,sellerCommissionRate:20,totalCommissionRate:40}]
 const deductions=[{id:'test-deduct',settlementId:'test-haru-settlement',type:'other',amount:29050,reflected:true,applyLocation:'seller_payment',costOwner:'seller'}]
 const calculation=calculateSettlement(sales,rows,deductions,'withholding_3_3')
 let settlement={id:'test-haru-settlement',campaignId:campaign.id,salesDataImportId:sales.id,currentCalculation:calculation,calculationSnapshot:structuredClone(calculation),settlementConfirmed:true,status:'approved',settlementVersion:1,paymentDueDate:'2026-09-30',accountConfirmed:true}
 campaignService.getCampaignById=()=>campaign
 campaignService.updatePaymentRequestStatus=()=>{}
 settlementService.getSettlementById=()=>settlement
 settlementService.updatePaymentRequestStatus=()=>{}
 settlementService.getDeductionsBySettlementId=()=>deductions
 salesDataService.getSalesDataImportById=()=>sales
 salesDataService.getRowsByImportId=()=>rows
 sellerMasterService.getSellerById=()=>({id:campaign.sellerId,name:campaign.sellerName,businessType:'freelancer',bankName:'테스트은행',accountNumber:'TEST-ACCOUNT',accountHolder:'테스트'})
 sellerSettlementService.saveRule({campaignId:campaign.id,businessType:'general_business',salesChannelType:'supplier_link',sellerCommissionRate:20,externalMallExtraRate:0,shippingAmount:0,evidenceConfirmed:true,confirmedEvidenceType:'tax_invoice'})
 let request
 const before=JSON.stringify(settlement.calculationSnapshot)
 check('new freelancer payment snapshots shared tax + ledger and selected master type',()=>{
  request=paymentRequestService.createPaymentRequest(settlement.id,'격리 테스트',{accountConfirmed:true})
  assert.equal(request.businessType,'freelancer');assert.equal(request.finalPaymentAmount,302327)
  const item=withholdingTaxService.getItems().find(i=>i.id===request.withholdingTaxItemId)
  assert.ok(item);assert.equal(item.paymentRequestId,request.id)
  assert.equal(item.withholdingBaseAmount,312627);assert.equal(item.incomeTaxAmount,9370);assert.equal(item.localIncomeTaxAmount,930);assert.equal(item.finalPaymentAmount,request.finalPaymentAmount)
 })
 check('duplicate requests blocked; snapshot bytes unchanged',()=>{
  assert.throws(()=>paymentRequestService.createPaymentRequest(settlement.id,'test',{accountConfirmed:true}),/이미 지급 요청/)
  assert.equal(JSON.stringify(settlement.calculationSnapshot),before)
 })
 check('ledger and Excel consistent; missing sidecar does not hide a saved freelancer request',()=>{
  const list=accountingRows(withholdingTaxService.getItems(),[request])
  assert.equal(list.length,1);assert.equal(list[0].base,312627)
  const exportRow=accountingExportRows(list)[0]
  assert.equal(exportRow.소득세,9370);assert.equal(exportRow.지방소득세,930);assert.equal(exportRow.실지급액,302327)
  const ida = accountingRows([],[{...request,id:'test-ida',recipientName:'이다솔'}]);assert.equal(ida[0].name,'이다솔');assert.equal(ida[0].net,302327)
  assert.match(accountingRows([],[{...request,businessType:'general_business'}])[0].reportStatus,/사업자 유형/)
  const missing=accountingRows([],[request]);assert.equal(missing.length,1);assert.equal(missing[0].net,302327)
  assert.equal(accountingRows([],[{...request,status:'canceled'}]).length,0)
  assert.equal(accountingRows([],[{...request,businessType:'general_business',evidenceType:'tax_invoice'}]).length,0)
  const unknown=accountingRows([],[{...request,incomeTaxAmount:undefined,localIncomeTaxAmount:undefined}])[0]
  assert.match(unknown.reportStatus,/확인 필요/);assert.equal(accountingExportRows([unknown])[0].소득세,'확인 필요')
 })
 check('legacy confirmed payout policy and values retained; draft opts into v2',()=>{
  const legacy=structuredClone(settlement)
  delete legacy.currentCalculation.sellerPayoutVersion;delete legacy.calculationSnapshot.sellerPayoutVersion
  assert.equal(sellerPayoutVersion(legacy),1)
  assert.equal(sellerPayoutVersion({...legacy,settlementConfirmed:false,status:'draft'}),2)
  assert.equal(sellerPayoutVersion(settlement),2)
  settlement=legacy
  const old=JSON.stringify(legacy)
  const result=sellerSettlementService.createSellerDocument(legacy.id,false,'freelancer')
  assert.equal(result.calculation.finalSellerPaymentAmount,298806)
  assert.equal(JSON.stringify(legacy),old)
  assert.equal(settlementService.recalculateSettlement(legacy.id),legacy)
  assert.equal(JSON.stringify(legacy),old)
 })
 check('bank text and missing account fallback',()=>{
  assert.equal(sellerAccountText({bankName:'은행',accountNumber:'123',accountHolder:'예금주'}),'은행명: 은행\n계좌번호: 123\n예금주: 예금주')
  assert.equal(sellerAccountText({bankName:'은행'}),'계좌정보 확인 필요')
 })
 check('filed withholding item immutable on attempted recalculation',()=>{
  const tax=withholdingTaxService.getItems()[0]
  storageService.setItem(STORAGE_KEYS.withholdingTaxItems,[{...tax,status:'reported'}])
  const before=JSON.stringify(withholdingTaxService.getItems())
  withholdingTaxService.upsert({settlementId:settlement.id,ownerType:'seller',ownerId:campaign.sellerId,ownerName:'하루살림',grossSettlementAmount:500000,deductions:0,sourceVersion:1})
  assert.equal(JSON.stringify(withholdingTaxService.getItems()),before)
 })
 console.log(`${count} targeted tests passed. In-memory only; no live Harusalim DB access or writes.`)
} finally { await vite.close() }
