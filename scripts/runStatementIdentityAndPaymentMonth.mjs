import assert from 'node:assert/strict'
import { createServer } from 'vite'
const values=new Map()
globalThis.localStorage={getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,v)}
const vite=await createServer({envDir:false,server:{middlewareMode:true,hmr:false},appType:'custom'})
try {
 const {statementIdentity,matchesBusinessSearch}=await vite.ssrLoadModule('/src/shared/utils/statementIdentity.ts')
 const {koreanPaymentDate,validatePaymentDate}=await vite.ssrLoadModule('/src/shared/utils/paymentDate.ts')
 const {accountingRows,accountingExportRows}=await vite.ssrLoadModule('/src/shared/utils/accountingRows.ts')
 const {withholdingTaxService:tax}=await vite.ssrLoadModule('/src/shared/services/withholdingTaxService.ts')
 const {paymentRequestService:payments}=await vite.ssrLoadModule('/src/shared/services/paymentRequestService.ts')
 const {settlementService:settlements}=await vite.ssrLoadModule('/src/shared/services/settlementService.ts')
 const {campaignService:campaigns}=await vite.ssrLoadModule('/src/shared/services/campaignService.ts')
 const {STORAGE_KEYS:K}=await vite.ssrLoadModule('/src/shared/services/storageService.ts')
 const campaign={id:'campaign',campaignName:'카루셀리x블루워시 1차',brandName:'',productName:'',sellerId:'seller',sellerName:'카루셀리'}
 const rows=[{id:'r1',productId:'product',skuId:'sku1',optionName:'건조기시트 3팩 세트'},{id:'r2',productId:'product',skuId:'sku2',optionName:'캡슐 세탁세제 5팩 세트'}]
 const product={id:'product',brandName:'블루워시',productName:'세탁세제',skus:[{id:'sku1'},{id:'sku2'}]}
 const identity=statementIdentity(campaign,rows,[product])
 assert.equal(identity.brand,'블루워시');assert.equal(identity.round,'1차');assert(identity.items.includes('건조기시트'));assert(identity.items.includes('캡슐'))
 assert.equal(statementIdentity({...campaign,round:'2차'},rows,[product]).round,'차수 확인 필요')
 assert.equal(statementIdentity({...campaign,campaignName:'새 공구'}).round,'차수 확인 필요')
 assert.equal(statementIdentity(campaign,rows,[{...product,id:'unrelated',skus:[]}]).brand,'브랜드 확인 필요')
 assert(matchesBusinessSearch('블루 워시 캡슐',['블루워시','캡슐 세탁세제 5팩 세트']))
 assert(!matchesBusinessSearch('블루워시 그라인더',['블루워시','캡슐 세탁세제']))
 assert.equal(koreanPaymentDate('2026-10-31T15:10:00Z'),'2026-11-01')
 assert.equal(koreanPaymentDate('2026-02-30'),'');assert.throws(()=>validatePaymentDate('2099-01-01'))
 const request={id:'request',campaignId:'campaign',settlementId:'settlement',recipientType:'seller',recipientId:'seller',recipientName:'카루셀리',businessType:'freelancer',evidenceType:'withholding_3_3',sourceVersion:1,status:'approved',dueDate:'2026-09-28',finalPaymentAmount:96700,grossSettlementAmount:100000,withholdingBaseAmount:100000,incomeTaxAmount:3000,localIncomeTaxAmount:300,withholdingTaxAmount:3300,withholdingTaxItemId:'tax'}
 const item={id:'tax',campaignId:'campaign',settlementId:'settlement',ownerType:'seller',ownerId:'seller',sourceVersion:1,paymentRequestId:'request',paymentMonth:'2026-09',status:'ready',incomeTaxAmount:3000,localIncomeTaxAmount:300,withholdingBaseAmount:100000,finalPaymentAmount:96700}
 assert.equal(accountingRows([item],[request])[0].month,'')
 const paid={...request,status:'payment_completed',completedAt:'2026-10-12T09:00:00Z',actualPaymentDate:'2026-10-05',actualPaidAmount:96700,completedBy:'허윤정'}
 assert.equal(accountingRows([item],[paid])[0].month,'2026-10')
 assert.equal(accountingRows([item],[paid])[0].paidAt,'2026-10-05')
 const boundary={...paid,actualPaymentDate:undefined,completedAt:'2026-10-31T15:10:00Z'}
 assert.equal(accountingRows([], [boundary])[0].month,'2026-11')
 assert.equal(accountingRows([], [{...paid,actualPaymentDate:undefined,completedAt:undefined}])[0].month,'')
 assert.equal(accountingRows([item],[{...paid,status:'canceled'}]).length,0)
 assert.equal(accountingRows([{...item,paymentDate:'2026-09-30'}],[{...paid,actualPaymentDate:undefined}])[0].month,'2026-09')
 const locked={...item,status:'reported'}
 assert.equal(accountingRows([locked],[paid])[0].month,'2026-09');assert(accountingRows([locked],[paid])[0].reportStatus.includes('확인 필요'))
 assert.equal(accountingExportRows(accountingRows([item],[paid]))[0].지급월,'2026-10')
 values.set(K.withholdingTaxItems,JSON.stringify([item,{...item,id:'other',paymentRequestId:'other'}]))
 tax.recordPaymentDate(paid);let saved=tax.getItems();assert.equal(saved.find(i=>i.id==='tax').paymentMonth,'2026-10');assert.equal(saved.find(i=>i.id==='other').paymentMonth,'2026-09')
 const first=values.get(K.withholdingTaxItems);tax.recordPaymentDate(paid);assert.equal(values.get(K.withholdingTaxItems),first)
 values.set(K.withholdingTaxItems,JSON.stringify([locked]));tax.recordPaymentDate(paid);assert.deepEqual(tax.getItems(),[locked])
 // Payment service writes actual date while preserving completion timestamp and amounts.
 const snapshot={stable:true};values.set(K.settlementVersions,JSON.stringify([snapshot]))
 campaigns.updatePaymentRequestStatus=()=>{};settlements.updatePaymentRequestStatus=()=>{};settlements.markSellerPaymentCompleted=()=>{};settlements.getSettlementById=()=>({id:'settlement',settlementVersion:1})
 payments.getPaymentRequestById=id=>JSON.parse(values.get(K.paymentRequests)).find(r=>r.id===id)
 values.set(K.paymentRequests,JSON.stringify([request]));values.set(K.withholdingTaxItems,JSON.stringify([item]))
 const completed=payments.markPaymentCompleted('request','허윤정','2026-10-05')
 assert.equal(completed.actualPaymentDate,'2026-10-05');assert.equal(completed.finalPaymentAmount,96700)
 assert.equal(tax.getItems()[0].paymentMonth,'2026-10')
 assert.throws(()=>payments.markPaymentCompleted('request','허윤정','2026-10-05'))
 assert.deepEqual(JSON.parse(values.get(K.settlementVersions)),[snapshot])
 const before=values.get(K.paymentRequests);assert.throws(()=>payments.markPaymentBatchCompleted(['request'],'허윤정','2099-01-01'));assert.equal(values.get(K.paymentRequests),before)
 console.log('PASS Bluewash linked brand/product labels, campaign round/conflicts, SKU search, actual payout month, Korean month boundary, unpaid exclusion, closed/report preservation, sidecar idempotency, completion original amounts/Snapshot preserved')
}finally{await vite.close()}
