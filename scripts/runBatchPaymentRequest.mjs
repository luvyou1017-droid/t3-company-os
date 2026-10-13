import assert from 'node:assert/strict'
import {createServer} from 'vite'
const values=new Map()
globalThis.localStorage={getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,String(v)),removeItem:k=>values.delete(k)}
const v=await createServer({envDir:false,server:{middlewareMode:true,hmr:false},appType:'custom'})
try {
const {STORAGE_KEYS:K,storageService,captureStorageWrites}=await v.ssrLoadModule('/src/shared/services/storageService.ts')
const {planBatchPaymentRequests,previewBatchPaymentRequests,submitBatchPaymentRequests}=await v.ssrLoadModule('/src/shared/services/paymentBatchRequestService.ts')
const {settlementService}=await v.ssrLoadModule('/src/shared/services/settlementService.ts')
const {campaignService}=await v.ssrLoadModule('/src/shared/services/campaignService.ts')
const {sellerSettlementService}=await v.ssrLoadModule('/src/shared/services/sellerSettlementService.ts')
const {salesDataService}=await v.ssrLoadModule('/src/shared/services/salesDataService.ts')
const campaign={id:'TEST-campaign',campaignName:'TEST batch campaign',managerId:'TEST-manager',managerName:'TEST-manager',sellerId:'TEST-seller',sellerName:'TEST-seller',supplyAudience:'seller',salesChannelType:'supplier_link'}
const settlement={id:'TEST-settlement',campaignId:campaign.id,salesDataImportId:'TEST-sales',status:'approved',settlementVersion:1,paymentDueDate:'2026-10-21',settlementConfirmed:true,accountConfirmed:true,createdAt:'2026-10-01',updatedAt:'2026-10-01',assigneeName:'TEST',assigneeId:'TEST',calculationSnapshot:{grossSales:1000000},currentCalculation:{grossSales:1000000,grossCommission:200000,sellerCommissionAmount:100000,distributableVendorCommission:100000,totalCommissionRate:20,sellerCommissionRate:10,managerShareRate:50,companyShareRate:50,managerBaseShareAmount:50000,managerAmount:50000,managerDeductionTotal:0,managerReimbursementTotal:1000,managerAdditionalPayment:0,deductions:[]}}
const base=new Map(Object.values(K).map(k=>[k,[]]))
base.set(K.campaigns,[campaign]);base.set(K.settlements,[settlement]);base.set(K.salesDataImports,[{id:'TEST-sales',campaignId:campaign.id,supplyAudience:'seller'}]);base.set(K.sellerSettlementRules,[{campaignId:campaign.id,salesChannelType:'supplier_link'}]);base.set(K.managerMasters,[{id:campaign.managerId,name:campaign.managerName,businessType:'freelancer',bankName:'TEST bank',accountNumber:'TEST account',accountHolder:'TEST manager'}])
const before=JSON.stringify([...values]);const snapshots=JSON.stringify(base.get(K.settlements)[0].calculationSnapshot)
const plan=planBatchPaymentRequests([settlement.id,settlement.id],'manager',base,'TEST requester')
assert.equal(plan.items.length,1);assert.equal(plan.items[0].reason,'',plan.items[0].reason);assert(plan.items[0].amount>0);assert.equal(plan.items[0].request.status,'approval_pending');assert.equal(JSON.stringify([...values]),before,'preview never writes local storage')
assert.equal(JSON.stringify(plan.values.get(K.settlements)[0].calculationSnapshot),snapshots,'snapshot unchanged')
assert.equal(plan.writes.has(K.settlementVersions),false)
const repeat=planBatchPaymentRequests([settlement.id],'manager',plan.values,'TEST requester');assert(repeat.items[0].reason.includes('이미 신청'));assert.equal(repeat.writes.size,0)
const missing=new Map(base);missing.set(K.managerMasters,[{id:campaign.managerId,businessType:'freelancer'}]);assert(planBatchPaymentRequests([settlement.id],'manager',missing,'TEST').items[0].reason.includes('계좌'))
const unconfirmed=new Map(base);unconfirmed.set(K.settlements,[{...settlement,settlementConfirmed:false}]);assert(planBatchPaymentRequests([settlement.id],'manager',unconfirmed,'TEST').items[0].reason.includes('확정'))
const direct=new Map(base);direct.set(K.campaigns,[{...campaign,managerName:'허윤정'}]);assert(planBatchPaymentRequests([settlement.id],'manager',direct,'TEST').items[0].reason.includes('회사 직속'))
const invoice=new Map(base);invoice.set(K.managerMasters,[{id:campaign.managerId,businessType:'general_business',bankName:'TEST',accountNumber:'TEST',accountHolder:'TEST'}]);assert(planBatchPaymentRequests([settlement.id],'manager',invoice,'TEST').items[0].reason.includes('증빙'))
const paid=new Map(base);paid.set(K.settlements,[{...base.get(K.settlements)[0],managerPaymentCompleted:true}]);assert(planBatchPaymentRequests([settlement.id],'manager',paid,'TEST').items[0].reason.includes('완료'))
assert.throws(()=>captureStorageWrites(base,()=>{storageService.setItem(K.paymentRequests,['test']);throw Error('fail')}));assert.equal(JSON.stringify([...values]),before)
const sellerCase=new Map(base)
sellerCase.set(K.sellerMasters,[{id:campaign.sellerId,name:campaign.sellerName,businessType:'freelancer',bankName:'TEST bank',accountNumber:'TEST account',accountHolder:'TEST seller'}])
sellerCase.set(K.settlements,[{...settlement,currentCalculation:{...settlement.currentCalculation,sellerDeductionTotal:0}}])
sellerCase.set(K.sellerSettlementRules,[{campaignId:campaign.id,salesChannelType:'supplier_link',businessType:'freelancer',sellerCommissionRate:10,externalMallExtraRate:0,shippingAmount:0,evidenceConfirmed:true,confirmedEvidenceType:'withholding_3_3'}])
sellerCase.set(K.salesDataRows,[{id:'TEST-row',salesDataImportId:'TEST-sales',matchStatus:'matched',productMatchStatus:'matched',skuId:'TEST-sku',productId:'TEST-product',optionName:'TEST item',netQuantity:1,unitPrice:1000000,netSales:1000000,totalCommissionRate:20,sellerCommissionRate:10}])
const sellerPlan=planBatchPaymentRequests([settlement.id],'seller',sellerCase,'TEST requester')
assert.equal(sellerPlan.items[0].reason,'',sellerPlan.items[0].reason);assert.equal(sellerPlan.items[0].request.recipientType,'seller');assert(sellerPlan.items[0].amount>0)
// Mock the server boundary: preview and failed commits never mutate browser state.
let role='manager', rpcFailure=false, calls=0
let rows=[...base].filter(([k])=>[K.paymentRequests,K.settlements,K.campaigns,K.salesDataImports,K.salesDataRows,K.sellerSettlementRules,K.settlementDeductions,K.managerMasters,K.sellerMasters,K.withholdingTaxItems,K.paymentEvidence,K.settlementActivityLogs,K.settlementRevisionRequests].includes(k)).map(([storage_key,payload])=>({storage_key,payload,revision:1,updated_at:'2026-10-13T00:00:00Z',deleted:false}))
const client={auth:{getUser:async()=>({data:{user:{id:'TEST'}},error:null})},from(table){return {select(){return this},eq(){return this},in(){return this},single:async()=>({data:{display_name:'TEST requester',role,active:true,approval_status:'approved'},error:null}),then(resolve,reject){return Promise.resolve({data:structuredClone(rows),error:null}).then(resolve,reject)}}},rpc:async(name,args)=>{calls++;if(rpcFailure)return {error:new Error('TEST atomic save failure')};rows=rows.map(row=>{const write=args.p_rows.find(r=>r.storage_key===row.storage_key);return write?{...row,payload:write.payload,revision:row.revision+1,updated_at:'2026-10-13T01:00:00Z'}:row});return {data:rows.filter(row=>args.p_rows.some(r=>r.storage_key===row.storage_key)),error:null}}}
const refresh=async()=>{}
await assert.rejects(()=>previewBatchPaymentRequests([settlement.id],'manager',client,refresh),/정산 담당자/);assert.equal(calls,0)
role='ceo';let preview=await previewBatchPaymentRequests([settlement.id],'manager',client,refresh)
rows[0].revision++;await assert.rejects(()=>submitBatchPaymentRequests(preview,client,refresh),/변경/);assert.equal(calls,0)
preview=await previewBatchPaymentRequests([settlement.id],'manager',client,refresh);rpcFailure=true
await assert.rejects(()=>submitBatchPaymentRequests(preview,client,refresh),/atomic/);assert.equal(JSON.stringify([...values]),before)
rpcFailure=false;assert.equal(await submitBatchPaymentRequests(preview,client,refresh),1)
await assert.rejects(()=>submitBatchPaymentRequests(preview,client,refresh),/변경/)
const again=await previewBatchPaymentRequests([settlement.id],'manager',client,refresh);assert(again.items[0].reason.includes('이미 신청'))
console.log('PASS batch request calculation, deduplicated selection, repeat prevention, account/evidence/confirmation/paid/company-direct exclusions, preview isolation and Snapshot preservation')
}finally{await v.close()}
