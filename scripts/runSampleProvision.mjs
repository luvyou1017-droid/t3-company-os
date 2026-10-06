import assert from 'node:assert/strict'
import { createServer } from 'vite'
globalThis.localStorage = { data:new Map(), getItem(k){return this.data.get(k) ?? null}, setItem(k,v){this.data.set(k,String(v))},removeItem(k){this.data.delete(k)} }
globalThis.fetch = async () => { throw new Error('Network disabled in isolated sample provisioning tests') }
const vite = await createServer({ configFile:false, envDir:false, define:{'import.meta.env.VITE_SUPABASE_URL':'""','import.meta.env.VITE_SUPABASE_ANON_KEY':'""'},server:{middlewareMode:true,hmr:false},appType:'custom' })
try {
 const m = await vite.ssrLoadModule('/src/features/samples/sampleProvision.ts')
 const model = await vite.ssrLoadModule('/src/features/samples/sampleOrderModel.ts')
 const {sampleSettlementCandidates} = await vite.ssrLoadModule('/src/features/samples/sampleSettlementCandidate.ts')
 const {makeSampleOrderStore} = await vite.ssrLoadModule('/src/features/samples/sampleOrderStore.ts')
 const {sellerMasterService} = await vite.ssrLoadModule('/src/shared/services/sellerMasterService.ts')
 const seller = await sellerMasterService.saveSellerProfile({id:'new-seller',name:'신규 셀러',instagramId:'test-account',defaultManagerId:'manager',defaultMdId:'',contact:'01000000000'})
 assert.equal(sellerMasterService.getSellerById(seller.id).name,'신규 셀러')
 assert.equal(seller.shippingAddress,undefined)
 const draft = {sellerId:'new-seller',sellerName:'신규 셀러',campaignId:'campaign',campaignName:'촬영 공구',productId:'existing-product',skuId:'existing-sku',supplierId:'supplier',productName:'그라인더',brandName:'브랜드',optionName:'화이트',detailOption:'',quantity:1,recipient:'테스트 수령인',phone:'01000000000',address:'격리 배송주소',purpose:'촬영',memo:'',deliveryMemo:'',payer:'seller',supportType:'full',supportAmount:null,costs:{sellerUnitPrice:null,companyUnitCost:null,source:'manual',capturedAt:'2026-10-06'},provision:{...m.blankProvision(),unitPrice:95000,shippingFee:5000},operations:m.blankOperations()}
 const actor={id:'manager',name:'담당 매니저'}
 const order={...model.createSampleOrder(draft,actor,'sample-request','2026-10-06T00:00:00Z'),status:'발주완료'}
 const conditional={...order,provision:{...order.provision,method:'조건부 제공',threshold:2000000,missed:{mode:'percent',shares:{supplier:50,company:20,seller:30,manager:0}}}}
 assert.equal(m.provisionTotal(order),100000)
 assert.deepEqual(m.effectiveBurden(conditional,1500000).shares,{supplier:50000,company:20000,seller:30000,manager:0})
 assert.deepEqual(m.effectiveBurden(conditional,2000000).shares,m.zeroShares())
 assert.equal(sampleSettlementCandidates(conditional,'campaign').deductions.length,0)
 assert.deepEqual(sampleSettlementCandidates(conditional,'campaign',1500000).deductions.map(d=>[d.costOwner,d.amount]),[['seller',30000],['company',20000]])
 assert.equal(sampleSettlementCandidates(conditional,'campaign',2000000).deductions.length,0)
 assert.throws(()=>m.validateBurden({mode:'percent',shares:{supplier:50,company:20,seller:20,manager:0}},100000),/100%/)
 assert.throws(()=>m.validateBurden({mode:'amount',shares:{supplier:50000,company:20000,seller:20000,manager:0}},100000),/총비용/)
 assert.deepEqual(m.allocate({mode:'percent',shares:{supplier:50,company:20,seller:30,manager:0}},100001),{supplier:50001,company:20000,seller:30000,manager:0})
 const paid={...order,operations:{...order.operations,depositReceived:true,depositExpected:100000,depositReceivedAt:'2026-10-06',depositConfirmedBy:'담당자'}}
 assert.equal(sampleSettlementCandidates(paid,'campaign').deductions.length,0)
 assert.equal(sampleSettlementCandidates({...paid,operations:{...paid.operations,depositExpected:30000}},'campaign').deductions[0].amount,70000)
 assert.equal(sampleSettlementCandidates({...order,operations:{...order.operations,offsetCompleted:true}},'campaign').deductions.length,0)
 const managerAdvance={...order,provision:{...order.provision,paymentMethod:'매니저 선입금',burden:{mode:'percent',shares:{supplier:0,seller:0,manager:0,company:100}}}}
 assert.equal(sampleSettlementCandidates(managerAdvance,'campaign').deductions[0].applyLocation,'manager_reimbursement')
 const loan={...order,provision:{...order.provision,method:'대여'},additionalItems:[{productId:'existing-product',skuId:'existing-sku-blue',productName:'그라인더',optionName:'블루',detailOption:'',quantity:1,unitPrice:null}],operations:{...m.blankOperations(),shippedAt:'2026-10-01',loanStatus:'사용 중'}}
 assert.equal(sampleSettlementCandidates(loan,'campaign').deductions.length,0)
 assert.equal(m.collectionDue(loan,{endDate:'2026-09-29'}),'2026-10-06')
 assert.equal(m.needsCollection(loan,{endDate:'2026-09-29'},'2026-10-05'),false)
 assert.equal(m.needsCollection(loan,{endDate:'2026-09-29'},'2026-10-06'),true)
 assert.equal(m.needsCollection({...loan,operations:{...loan.operations,loanStatus:'반납 완료'}},{endDate:'2026-09-29'},'2026-10-06'),false)
 assert.equal(m.collectionDue({...loan,campaignId:''},{endDate:'2026-09-29'}),'')
 assert.equal(model.sampleExportRows([loan]).length,3)
 const campaigns=[{id:'campaign',sellerId:'new-seller',sellerName:'신규 셀러',campaignName:'종료 미확정',productName:'그라인더',endDate:'2026-09-29'},{id:'final',sellerId:'new-seller',sellerName:'신규 셀러',campaignName:'정산확정',productName:'그라인더'},{id:'other',sellerId:'other-seller',sellerName:'다른 셀러',campaignName:'다른 공구',productName:'그라인더'}]
 assert.deepEqual(m.unsettledCampaigns(campaigns,[{campaignId:'final',settlementConfirmed:true}], 'new-seller','신규 셀러','그라인더').map(c=>c.id),['campaign'])
 assert.equal(m.unsettledCampaigns(campaigns,[{campaignId:'final',settlementConfirmed:true}],'new-seller','신규 셀러','검색없음','final')[0].id,'final')
 const test={...order,provision:{...order.provision,method:'테스트 후 진행',agreedTerms:'진행 시 비용 확정'}}
 assert.equal(sampleSettlementCandidates(test,'campaign').deductions.length,0)
 assert.throws(()=>model.validateSampleDraft(test),/진행 확정/)
 const agreed={...draft,provision:{...draft.provision,method:'진행 시 협의',agreedTerms:'이번 건 셀러 유상 구매'}}
 model.validateSampleDraft(agreed,true)
 const {sampleSettlementStatus} = await vite.ssrLoadModule('/src/features/samples/sampleSettlementStatus.ts')
 const before=JSON.stringify(conditional.provision);m.effectiveBurden(conditional,2500000);assert.equal(JSON.stringify(conditional.provision),before)
 let versioned={revision:0,book:{schemaVersion:1,orders:[order]}}
 const repo={read:async()=>structuredClone(versioned),write:async(book,expected)=>{if(expected!==versioned.revision)throw Error('CAS 충돌');versioned={book:structuredClone(book),revision:expected+1};return structuredClone(versioned)}}
 const store=makeSampleOrderStore(repo,async()=>actor)
 const claims=await Promise.allSettled([store.claimSettlement(order.id,'settlement-A',order),store.claimSettlement(order.id,'settlement-B',order)])
 assert.equal(claims.filter(r=>r.status==='fulfilled').length,1)
 const claimed = versioned.book.orders[0]
 const ds=[{type:'sample',campaignId:'campaign',settlementId:claimed.settlementClaim.settlementId,linkedData:`sample:${order.id}:셀러`,reflected:true}]
 assert.equal(sampleSettlementStatus(claimed,ds,new Set([claimed.settlementClaim.settlementId])),'반영 대기')
 await store.completeSettlementClaim(order.id,claimed.settlementClaim.settlementId)
 assert.equal(sampleSettlementStatus(versioned.book.orders[0],ds,new Set([claimed.settlementClaim.settlementId])),'반영 완료')
 assert.equal(versioned.book.orders[0].costs.capturedAt,order.costs.capturedAt)
 assert.throws(()=>m.validateProvision({...draft,provision:{...draft.provision,unitPrice:-1}}),/0 이상/)
 assert.equal(sellerMasterService.getSellerById(seller.id).shippingAddress,undefined)
 console.log('PASS sample provisioning regressions: conditional revenue, split totals, rounding, receipt/offset exclusion, reimbursement, loans, multi-SKU, recommendations, immutable snapshots, concurrent settlement claim')
} finally {await vite.close()}
