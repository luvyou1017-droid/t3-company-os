import assert from 'node:assert/strict'
import { createServer } from 'vite'
const memory = new Map(); globalThis.localStorage = { getItem: k => memory.get(k) ?? null, setItem: (k,v) => memory.set(k,v) }
const server = await createServer({ envDir: false, server: { middlewareMode: true, hmr: false }, appType: 'custom' })
try {
 const load = p => server.ssrLoadModule('/src/shared/'+p+'.ts')
 const { calculateFinalSellerPayment: payout } = await load('utils/sellerSettlement')
 const { calculateSettlement, validateSettlementCalculation } = await load('utils/settlement')
 const { reconcileReceivable, receivableBalance, changeReceivableStatus, offsetDeductions } = await load('utils/sellerReceivable')
 const { applyReceivableOffsets: apply, cancelReceivableOffset: cancel, sellerReceivableService: service, persistReceivableChange } = await load('services/sellerReceivableService')
 const { settlementService: settlements } = await load('services/settlementService')
 const { salesDataService: sales } = await load('services/salesDataService')
 const { campaignService: campaigns } = await load('services/campaignService')
 const { STORAGE_KEYS: keys } = await load('services/storageService')
 const admin = { id:'test-admin', name:'안전 테스트', role:'대표' }
 const input = { id:'sales-a',campaignId:'a',sourceType:'manual',fileName:'',totalQuantity:1,totalSalesAmount:100000,totalCommissionRate:30,sellerCommissionRate:20,reviewStatus:'확정 완료',settlementStatus:'정산 가능',eventCosts:[] }
 const row = { id:'row-a',optionName:'안전 테스트 옵션',grossSales:100000,salesDataImportId:input.id,unitPrice:100000,quantity:1,canceledQuantity:0,refundedQuantity:0,netQuantity:1,netSales:100000,totalCommissionRate:30,sellerCommissionRate:20 }
 const deduction = { id:'deduct',settlementId:'a',campaignId:'a',type:'other',direction:'deduction',costOwner:'seller',applyLocation:'seller_payment',amount:35000,reflected:true,linkedData:'',title:'셀러 차감' }
 const calc = calculateSettlement(input,[row],[deduction],'tax_invoice')
 assert.equal(calc.finalSellerPaymentAmount,0); assert.equal(calc.sellerReceivableAmount,15000); assert.equal(validateSettlementCalculation(calc).valid,true)
 const a = reconcileReceivable({id:'a',campaignId:'a',salesDataImportId:'sales-a',status:'draft',settlementVersion:1,taxType:'tax_invoice',currentCalculation:calc},undefined,'seller-one')
 const b = {id:'b',campaignId:'b',status:'draft',currentCalculation:{...calc,sellerReceivableAmount:0,finalSellerPaymentAmount:50000},taxType:'tax_invoice'}
 const recalc = s => ({...s,currentCalculation:{...s.currentCalculation,...payout(50000,'general_business',(s.sellerReceivableOffsets??[]).reduce((n,o)=>n+o.amount,0),2,0,(s.sellerReceivableOffsets??[]).reduce((n,o)=>n+o.amount,0))}})
 const seller = s => s.campaignId === 'other' ? 'seller-two' : 'seller-one'
 let items = apply([a,b],'a',['b'],15000,admin.name,seller,recalc)
 assert.equal(items[1].currentCalculation.finalSellerPaymentAmount,35000);assert.equal(items[0].sellerReceivable.status,'상계 완료');assert.equal(receivableBalance(items,items[0].sellerReceivable),0)
 assert.throws(()=>apply(items,'a',['b'],15000,admin.name,seller,recalc))
 const restored = cancel(items,'b',items[1].sellerReceivableOffsets[0].id,admin.name,recalc)
 assert.equal(restored[1].currentCalculation.finalSellerPaymentAmount,50000);assert.equal(receivableBalance(restored,restored[0].sellerReceivable),15000)
 const planned = changeReceivableStatus([a,b],'a','계산서 발행 예정',admin.name,'청구')
 assert.throws(()=>apply(planned,'a',['b'],15000,admin.name,seller,recalc))
 const issued = changeReceivableStatus(planned,'a','계산서 발행 완료',admin.name,'청구','2026-09-22')
 const paid = changeReceivableStatus(issued,'a','계산서 발행 완료',admin.name,'입금 확인','2026-09-22','2026-09-23')
 assert.equal(receivableBalance(paid,paid[0].sellerReceivable),0)
 assert.throws(()=>changeReceivableStatus([a,b],'a','수동 처리 완료',admin.name,''))
 assert.throws(()=>apply([a,{...b,campaignId:'other'}],'a',['b'],15000,admin.name,seller,recalc))
 assert.throws(()=>apply([a,{...b,settlementConfirmed:true}],'a',['b'],15000,admin.name,seller,recalc))
 assert.throws(()=>apply([a,b],'a',['b'],15001,admin.name,seller,recalc))
 const splitCalc = s => ({...s,currentCalculation:{...s.currentCalculation,finalSellerPaymentAmount:10000-(s.sellerReceivableOffsets??[]).reduce((n,o)=>n+o.amount,0)}})
 const split = apply([a,{...b},{...b,id:'c'}],'a',['b','c'],15000,admin.name,seller,splitCalc)
 assert.equal(split[1].currentCalculation.finalSellerPaymentAmount,0);assert.equal(split[2].currentCalculation.finalSellerPaymentAmount,5000)
 const frozen = {...a,settlementConfirmed:true,calculationSnapshot:structuredClone(calc),originalSnapshot:structuredClone(calc)}
 const snapshots = JSON.stringify([frozen.calculationSnapshot,frozen.originalSnapshot])
 const frozenHandled = apply([frozen,b],'a',['b'],15000,admin.name,seller,recalc)
 assert.equal(JSON.stringify([frozenHandled[0].calculationSnapshot,frozenHandled[0].originalSnapshot]),snapshots)
 assert.equal(reconcileReceivable({...frozen},frozen,'seller-one').sellerReceivable.amount,15000)
 const freelancer = payout(343890,'freelancer',15000,2,0,15000)
 assert.equal(freelancer.withholdingTaxAmount,10300);assert.equal(freelancer.finalSellerPaymentAmount,287327)
 assert.equal(payout(20000,'general_business',35000).sellerReceivableAmount,15000)
 assert.throws(()=>payout(20000,'general_business',-1))
 assert.throws(()=>payout(20000,'general_business',35000,1))
 // Real settlement creation path using isolated storage; no production records.
 campaigns.saveCampaigns([{id:'a',sellerId:'seller-one',sellerName:'테스트셀러',supplyAudience:'seller',businessType:'법인사업자'}])
 sales.saveImports([{...input,eventCosts:[{id:'sample',name:'샘플 비용',direction:'deduction',owner:'seller',unitPrice:35000,quantity:1,amount:35000}]}]);sales.saveRows([row])
 localStorage.setItem(keys.settlements, JSON.stringify([{...b,id:'unrelated',salesDataImportId:'unrelated'}]))
 const created = settlements.createSettlementFromSalesData(input.id)
 const stored = service.getItems().find(s=>s.id===created.id)
 assert.equal(stored.currentCalculation.finalSellerPaymentAmount,0);assert.equal(stored.sellerReceivable.amount,15000)
 assert.equal(stored.sellerReceivable.sellerId,'seller-one')
 // Exercise the public service, persisted allocations, and reloaded settlement calculation.
 const inputB = {...input,id:'sales-b',campaignId:'b',totalSalesAmount:250000}
 const rowB = {...row,id:'row-b',salesDataImportId:'sales-b',unitPrice:250000,netSales:250000,grossSales:250000}
 campaigns.saveCampaigns([...campaigns.getCampaigns(),{id:'b',sellerId:'seller-one',sellerName:'테스트셀러',supplyAudience:'seller',businessType:'법인사업자'}])
 sales.saveImports([...sales.getSalesDataImports(),inputB]);sales.saveRows([...sales.getSalesDataRows(),rowB])
 const createdB = settlements.createSettlementFromSalesData(inputB.id)
 const serviceApplied = await service.apply(created.id,[createdB.id],15000,admin)
 assert.equal(serviceApplied.find(s=>s.id===createdB.id).currentCalculation.finalSellerPaymentAmount,35000)
 assert.equal(settlements.getSettlementById(createdB.id).currentCalculation.finalSellerPaymentAmount,35000)
 assert.equal(settlements.getDeductionsBySettlementId(createdB.id).filter(d=>d.linkedData.startsWith('receivable:')).length,1)
 const targetStored=serviceApplied.find(s=>s.id===createdB.id)
 await service.cancel(createdB.id,targetStored.sellerReceivableOffsets[0].id,admin)
 assert.equal(settlements.getSettlementById(createdB.id).currentCalculation.finalSellerPaymentAmount,50000)
 await service.setStatus(created.id,'계산서 발행 예정','청구 예정','','',admin)
 await assert.rejects(()=>service.apply(created.id,[createdB.id],15000,admin),/상계 가능한/)
 assert.equal(service.getItems().find(s=>s.id===created.id).sellerReceivable.invoiceAmount,15000)
 assert.throws(()=>settlements.saveSettlements(service.getItems().filter(s=>s.id!==created.id)),/삭제/)
 console.log('PASS A: actual createSettlementFromSalesData saves payout 0 / receivable 15,000; B: 50,000→35,000; C: invoice excluded')
 console.log('PASS partial/multiple settlement allocation, duplicate/cross-seller/confirmed blocking, cancellation, invoice dates/payment/manual history, freelancer post-tax offset, immutable snapshots')
 // CAS conflict must never replace local records or report success.
 const before=localStorage.getItem(keys.settlements)
 let stage='read';const query={select(){return this},eq(){return this},single:async()=>({data:{payload:[a,b],updated_at:'v1',deleted:false},error:null}),maybeSingle:async()=>({data:null,error:null}),update(){stage='write';return this}}
 const client={from:()=>query}
 await assert.rejects(()=>persistReceivableChange(xs=>apply(xs,'a',['b'],15000,admin.name,seller,recalc),admin,client),/다른 사용자/)
 assert.equal(stage,'write');assert.equal(localStorage.getItem(keys.settlements),before)
 await assert.rejects(()=>persistReceivableChange(xs=>xs,{...admin,role:'매니저'},client),/권한/)
 const {createElement}=await import('react');const {renderToStaticMarkup}=await import('react-dom/server')
 const {SellerReceivablePanel}=await server.ssrLoadModule('/src/pages/settlement/components/SellerReceivablePanel.tsx')
 const html=renderToStaticMarkup(createElement(SellerReceivablePanel,{settlement:stored,user:admin,onSaved(){}}))
 assert.match(html,/15,000원/);assert.match(html,/계산서 발행 예정/);assert.match(html,/미수금 처리 이력/)
 assert.equal(offsetDeductions(items[1])[0].amount,15000)
 console.log('PASS UI ledger/invoice/history, atomic write conflict and role rejection. All tests isolated; operating data unchanged.')
} finally { await server.close() }
