import assert from 'node:assert/strict'
import {createServer} from 'vite'
import React from 'react'
import {renderToStaticMarkup} from 'react-dom/server'
// All amounts, identities and repositories are fictional. No operational writes.
globalThis.localStorage={data:new Map(),getItem(k){return this.data.get(k)??null},setItem(k,v){this.data.set(k,String(v))},removeItem(k){this.data.delete(k)}}
globalThis.fetch=async()=>{throw Error('Network disabled in isolated sample item tests')}
const mocks={AuthGate:'export function useCompanyAuth(){return {profile:{id:"fixture-manager",display_name:"테스트"}}}',campaignService:'export const campaignService={getCampaigns:()=>[]}',settlementService:'export const settlementService={getSettlements:()=>[]}'}
const vite=await createServer({configFile:false,envDir:false,define:{'import.meta.env.VITE_SUPABASE_URL':'""','import.meta.env.VITE_SUPABASE_ANON_KEY':'""'},server:{middlewareMode:true,hmr:false},appType:'custom',plugins:[{name:'isolated-ui-context',enforce:'pre',resolveId(id){const name=id.split('/').pop();if(mocks[name])return '\0fixture:'+name},load(id){if(id.startsWith('\0fixture:'))return mocks[id.slice(9)]}}]})
try {
 const m=await vite.ssrLoadModule('/src/features/samples/sampleProvision.ts')
 const model=await vite.ssrLoadModule('/src/features/samples/sampleOrderModel.ts')
 const {sampleSettlementCandidates,isLinkedSampleDeduction}=await vite.ssrLoadModule('/src/features/samples/sampleSettlementCandidate.ts')
 const {makeSampleOrderStore}=await vite.ssrLoadModule('/src/features/samples/sampleOrderStore.ts')
 const sku={id:'preserved-sku',productId:'preserved-product',active:true,groupBuyPrice:40000,supplyPrice:25000,totalCommissionRate:37.5,optionName:'가상 옵션',optionValues:{},currentTradeTerms:{companySupplyPrice:25000,sellerSupplyPrice:30000}}
 const product={id:sku.productId,active:true,brandName:'가상 브랜드',productName:'가상 상품',vendorId:'fixture-supplier',skus:[sku]}
 const snapshot=model.samplePriceSnapshot(product,sku)
 assert.deepEqual([snapshot.groupBuyPrice,snapshot.companySupplyPrice,snapshot.totalCommissionRate],[40000,25000,37.5])
 const p={...m.blankProvision(),unitPrice:40000,shippingFee:3000}
 const line=(id,method)=>({lineId:id,productId:product.id,skuId:sku.id,supplierId:'fixture-supplier',productName:'가상 상품',optionName:'가상 옵션',detailOption:'',quantity:1,unitPrice:40000,priceSnapshot:snapshot,provision:{...m.blankProvision(),unitPrice:40000,method,provider:'벤더(와이즈)'}})
 const draft={itemConditionsVersion:2,primaryLineId:'purchase',priceSnapshot:snapshot,provision:p,operations:m.blankOperations(),sellerId:'fixture-seller',sellerName:'가상 셀러',campaignId:'fixture-campaign',campaignName:'가상 공구',productId:product.id,skuId:sku.id,supplierId:'fixture-supplier',brandName:'가상 브랜드',productName:'가상 상품',optionName:'가상 옵션',detailOption:'',quantity:1,recipient:'가상 수령인',phone:'01000000000',address:'격리 주소',purpose:'촬영',memo:'',deliveryMemo:'',payer:'seller',supportType:'full',supportAmount:null,costs:model.skuCostSnapshot(sku),additionalItems:[line('gift','무상 제공'),line('loan','대여')]}
 model.validateSampleDraft(draft,true)
 assert.equal(m.provisionTotal(draft),43000)
 assert.throws(()=>model.validateSampleDraft({...draft,additionalItems:[{...line('bad','대여'),quantity:0}]}),/수량/)
 assert.throws(()=>model.validateSampleDraft({...draft,additionalItems:[line('purchase','대여')]}),/식별번호/)
 const actor={id:'fixture-manager',name:'테스트'}
 const order={...model.createSampleOrder(draft,actor,'fixture-request','2026-10-07T00:00:00Z'),status:'발주완료'}
 assert.deepEqual(m.sampleItems(order).map(i=>i.provision.method),['유상 구매','무상 제공','대여'])
 assert.equal(new Set(m.sampleItems(order).map(i=>i.itemId)).size,3)
 assert.ok(m.sampleItems(order).every(i=>i.skuId==='preserved-sku'))
 const deductions=sampleSettlementCandidates(order,order.campaignId).deductions
 assert.equal(deductions.length,1);assert.equal(deductions[0].amount,43000)
 assert.ok(deductions[0].linkedData.includes(':item:purchase:'));assert.ok(isLinkedSampleDeduction(deductions[0],order.id))
 const shipped=model.transitionSample(order,'배송중',actor,'2026-10-07T00:00:00Z')
 assert.deepEqual(Object.keys(shipped.operations.itemLoans),['fixture-request:loan'])
 assert.equal(m.needsCollection(shipped,{endDate:'2026-09-30'},'2026-10-07'),true)
 const returned={...shipped,operations:{...shipped.operations,itemLoans:{'fixture-request:loan':{loanStatus:'반납 완료',shippedAt:'2026-10-07',collectionDate:'',collectionMemo:''}}}}
 assert.equal(m.needsCollection(returned,{endDate:'2026-09-30'},'2026-10-07'),false)
 const received={...order,operations:{...order.operations,itemFinancials:{'fixture-request:purchase':{...m.blankOperations(),depositReceived:true,depositExpected:43000,depositReceivedAt:'2026-10-07',depositConfirmedBy:'테스트'}}}}
 assert.equal(sampleSettlementCandidates(received,order.campaignId).deductions.length,0)
 const partial={...received,operations:{...received.operations,itemFinancials:{'fixture-request:purchase':{...received.operations.itemFinancials['fixture-request:purchase'],depositExpected:10000}}}}
 assert.equal(sampleSettlementCandidates(partial,order.campaignId).deductions[0].amount,33000)
 const secondPurchase={...order,additionalItems:[{...line('purchase-two','유상 구매'),provision:{...p,unitPrice:10000,shippingFee:0}},line('loan','대여')]}
 const separate=sampleSettlementCandidates(secondPurchase,order.campaignId).deductions
 assert.deepEqual(separate.map(d=>d.amount),[43000,10000]);assert.equal(new Set(separate.map(d=>d.linkedData)).size,2)
 const conditional={...order,provision:{...p,method:'조건부 제공',threshold:100000,missed:{mode:'percent',shares:{seller:50,company:0,supplier:50,manager:0}}}}
 assert.equal(sampleSettlementCandidates(conditional,order.campaignId,90000).deductions[0].amount,21500)
 assert.equal(sampleSettlementCandidates(conditional,order.campaignId,100000).deductions.length,0)
 const frozen=JSON.stringify(order)
 model.samplePriceSnapshot({...product,totalCommissionRate:10},{...sku,groupBuyPrice:50000})
 m.effectiveBurden(order,100000);assert.equal(JSON.stringify(order),frozen)
 const legacy={...order,itemConditionsVersion:undefined,primaryLineId:undefined,additionalItems:[{...line('old','무상 제공'),lineId:undefined,provision:undefined,unitPrice:5000}]}
 assert.equal(m.provisionTotal(legacy),48000)
 assert.equal(sampleSettlementCandidates(legacy,order.campaignId).deductions[0].linkedData,`sample:${order.id}:셀러`)
 let saved={revision:0,book:{schemaVersion:1,orders:[order]}}
 const store=makeSampleOrderStore({read:async()=>structuredClone(saved),write:async(book,revision)=>{if(revision!==saved.revision)throw Error('CAS');saved={revision:revision+1,book:structuredClone(book)};return structuredClone(saved)}},async()=>actor)
 const claims=await Promise.allSettled([store.claimSettlement(order.id,'fixture-settlement',order),store.claimSettlement(order.id,'fixture-other-settlement',order)])
 assert.equal(claims.filter(r=>r.status==='fulfilled').length,1)
 await assert.rejects(()=>store.updateOperations(order.id,received.operations,order.history.length),/품목별 입금·상계/)
 const {SampleOrderForm}=await vite.ssrLoadModule('/src/pages/sample-management/components/SampleOrderForm.tsx')
 const html=renderToStaticMarkup(React.createElement(SampleOrderForm,{initial:draft,onClose(){},async onSave(){throw Error('No UI writes')}}))
 assert.equal((html.match(/샘플 제공 방식/g)||[]).length,3)
 assert.equal((html.match(/공급가 : 25,000원, 총수수료 : 37.5%/g)||[]).length,3)
 assert.equal((html.match(/브랜드·상품·옵션 검색 \(다른 공구 상품도 가능\)/g)||[]).length,3)
 const {SampleOperationsFields}=await vite.ssrLoadModule('/src/pages/sample-management/components/SampleOperationsFields.tsx')
 const operationsHtml=renderToStaticMarkup(React.createElement(SampleOperationsFields,{order,busy:false,reflected:false,sellerReflected:false,async onSave(){throw Error('No UI writes')}}))
 assert.ok(operationsHtml.includes('SKU 3'));assert.equal((operationsHtml.match(/대여 상태/g)||[]).length,1)
 console.log('PASS mixed same-SKU purchase/gift/loan: independent terms, retail price snapshots, shipping once, item deductions, receipts, conditional revenue, collection and partial returns')
 console.log('PASS preserved legacy calculations and IDs, immutable snapshots, CAS duplicate claim and post-claim financial lock; actual form renders all item conditions and price labels')
} finally {await vite.close()}
