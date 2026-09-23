import assert from 'node:assert/strict'
import {createServer} from 'vite'
const memory=new Map();globalThis.localStorage={getItem:k=>memory.get(k)??null,setItem:(k,v)=>memory.set(k,v)}
const server=await createServer({envDir:false,server:{middlewareMode:true,hmr:false},appType:'custom'})
try{
 const load=p=>server.ssrLoadModule('/src/shared/'+p+'.ts')
 const {calculateSettlement,validateSettlementCalculation}=await load('utils/settlement')
 const {salesDataService:sales}=await load('services/salesDataService')
 const {settlementService:s}=await load('services/settlementService')
 const {campaignService:c}=await load('services/campaignService')
 const {STORAGE_KEYS:k}=await load('services/storageService')
 const {sellerAdditionalPayments}=await load('utils/settlementAdjustments')
 const source={id:'test-sales',campaignId:'test-campaign',sourceType:'manual',fileName:'',totalQuantity:10,totalSalesAmount:1000000,totalCommissionRate:30,sellerCommissionRate:20,reviewStatus:'확정 완료',settlementStatus:'정산 가능',eventCosts:[]}
 const rows=[{id:'r',salesDataImportId:source.id,unitPrice:100000,quantity:10,canceledQuantity:0,refundedQuantity:0,netQuantity:10,netSales:1000000,totalCommissionRate:30,sellerCommissionRate:20}]
 c.saveCampaigns([{id:source.campaignId,supplyAudience:'seller'}]);sales.saveImports([source]);sales.saveRows(rows)
 const base=calculateSettlement(source,rows,[],'tax_invoice')
 const draft={id:'test-settlement',campaignId:source.campaignId,salesDataImportId:source.id,status:'draft',taxType:'tax_invoice',settlementVersion:1,currentCalculation:base}
 const fields={seller:'finalSellerPaymentAmount',manager:'managerAmount',company:'companyAmount'}
 for(const direction of ['payment','deduction'])for(const owner of ['seller','manager','company']){
  s.saveSettlements([structuredClone(draft)]);s.saveDeductions([])
  sales.saveImports([{...source,eventCosts:[{id:'adjust',name:'택배비',direction,owner,unitPrice:3000,quantity:1,amount:3000}]}])
  const next=s.syncSalesEventDeduction(source.id)
  const calculated=next.currentCalculation
  const delta=direction==='payment'?3000:-3000
  const direct=direction==='deduction' && owner!=='company'
  assert.equal(calculated.distributableVendorCommission-base.distributableVendorCommission,direct?0:delta)
  assert.equal(calculated.managerBaseShareAmount-base.managerBaseShareAmount,direct?0:delta/2)
  assert.equal(calculated.companyAmount-base.companyAmount,direct?0:delta/2)
  assert.equal(calculated.finalSellerPaymentAmount-base.finalSellerPaymentAmount,direct&&owner==='seller'?-3000:0)
  if(direct&&owner==='manager')assert.equal(calculated.managerAmount-base.managerAmount,-3000)
  assert.equal(validateSettlementCalculation(calculated).valid,true,JSON.stringify(validateSettlementCalculation(calculated)))
  const stored=s.getDeductionsBySettlementId(draft.id)
  assert.equal(stored[0].direction,direction);assert.equal(stored[0].amount,3000);assert.equal(stored[0].unitPrice,3000);assert.equal(stored[0].quantity,1)
  assert.equal(sellerAdditionalPayments(stored,calculated.adjustmentCalculationVersion),0)
  console.log('PASS saved→synchronized→calculated',owner,direction,calculated[fields[owner]]-base[fields[owner]])
 }

 // Manager advance is a company expense AND reimbursement, not a generic adjustment.
 s.saveSettlements([structuredClone(draft)]);s.saveDeductions([])
 sales.saveImports([{...source,eventCosts:[{id:'prepaid',name:'택배비',direction:'deduction',owner:'company_manager_prepaid',unitPrice:3000,quantity:1,amount:3000}]}])
 const prepaid=s.syncSalesEventDeduction(source.id).currentCalculation
 assert.equal(prepaid.managerReimbursementTotal,3000)
 assert.equal(prepaid.distributionDeductionTotal,0)
 assert.equal(prepaid.distributableVendorCommission,base.distributableVendorCommission-3000)
 assert.equal(prepaid.managerAmount,prepaid.managerBaseShareAmount+3000)
 assert.equal(prepaid.managerDeductionTotal,0)
 assert.equal(prepaid.finalSellerPaymentAmount,base.finalSellerPaymentAmount)
 assert.equal(s.getDeductionsBySettlementId(draft.id)[0].costOwner,'company')
 assert.equal(s.getDeductionsBySettlementId(draft.id)[0].applyLocation,'manager_reimbursement')
 assert.equal(validateSettlementCalculation(prepaid).valid,true)
 console.log('PASS saved manager advance: company cost 3,000 once; reimbursement +3,000 after allocation; no manager deduction or seller change')
 sales.saveImports([{...source,eventCosts:[]}])
 const removed=s.syncSalesEventDeduction(source.id)
 assert.equal(removed.currentCalculation.distributableVendorCommission,base.distributableVendorCommission)
 assert.equal(removed.currentCalculation.managerBaseShareAmount,base.managerBaseShareAmount)
 const {createElement}=await import('react')
 const {renderToStaticMarkup}=await import('react-dom/server')
 const {SettlementAdjustmentRows}=await server.ssrLoadModule('/src/pages/settlement/components/SettlementAdjustmentRows.tsx')
 const html=renderToStaticMarkup(createElement(SettlementAdjustmentRows,{items:[{id:'detail',title:'택배비',direction:'payment',costOwner:'company',reflected:true,unitPrice:3000,quantity:1,amount:3000}]}))
 assert.match(html,/<details>/);assert.doesNotMatch(html,/<details[^>]+open/);assert.match(html,/상세보기/);assert.match(html,/<th>단가<\/th>/);assert.match(html,/<th>수량<\/th>/)
 const exampleSource={...source,totalCommissionRate:60.175,sellerCommissionRate:29.738,commissionCalculationType:'campaign_total'}
 const exampleRows=[{...rows[0],netSales:100000,totalCommissionRate:60.175,sellerCommissionRate:29.738}]
 const costs={id:'cost',type:'event',costOwner:'company',applyLocation:'net_company_commission',amount:6199,reflected:true}
 const credit={...costs,id:'credit',direction:'payment',applyLocation:'company_payment',amount:3000}
 const example=calculateSettlement(exampleSource,exampleRows,[costs,credit],'tax_invoice')
 assert.equal(example.grossCommission,60175);assert.equal(example.sellerCommissionAmount,29738)
 assert.equal(example.distributableVendorCommission,27238);assert.equal(example.managerBaseShareAmount,13619)
 assert.equal(calculateSettlement(exampleSource,exampleRows,[costs],'tax_invoice').distributableVendorCommission,24238)
 assert.equal(calculateSettlement(exampleSource,exampleRows,[costs,{...credit,direction:'deduction'}],'tax_invoice').distributableVendorCommission,21238)
 assert.equal(validateSettlementCalculation(example).valid,true)
 console.log('PASS provided example 24,238 → 27,238; manager 13,619; removal 24,238; deduction 21,238')
 const legacy={id:'legacy',type:'event',costOwner:'company',applyLocation:'net_company_commission',amount:3000,reflected:true}
 const old=calculateSettlement(source,rows,[legacy],'tax_invoice');assert.equal(old.distributableVendorCommission,base.distributableVendorCommission-3000)
 const promotion={...legacy,type:'promotion',costOwner:'seller',applyLocation:'seller_payment'}
 assert.equal(calculateSettlement(source,rows,[promotion],'tax_invoice').finalSellerPaymentAmount,base.finalSellerPaymentAmount+3000)
 const confirmed={...draft,settlementConfirmed:true,calculationSnapshot:base,originalSnapshot:base}
 s.saveSettlements([confirmed]);s.saveDeductions([legacy]);const before=localStorage.getItem(k.settlements),costBefore=localStorage.getItem(k.settlementDeductions)
 s.syncSalesEventDeduction(source.id);s.syncSalesCostDeductions(source.id);s.recalculateSettlement(confirmed.id)
 assert.equal(localStorage.getItem(k.settlements),before);assert.equal(localStorage.getItem(k.settlementDeductions),costBefore)
 console.log('PASS explicit legacy seller promotion only adds; old company pre-distribution preserved; confirmed snapshots and deductions unchanged. Isolated data, not production.')
}finally{await server.close()}
