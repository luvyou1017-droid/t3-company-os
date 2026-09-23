import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { supplierDocumentAmounts, supplierOffsetSummary } from '../src/shared/utils/supplierRequestDocument.ts'
import { settlementWorkflowLabel } from '../src/shared/utils/settlementWorkflowStatus.ts'

let count = 0
function test(name, fn) { fn(); count++; console.log('PASS', name) }
// Compare against the actual v194 component arithmetic, not a second rewritten formula.
const previous = execFileSync('git', ['show', '5a7e452:src/pages/settlement/components/SupplierSettlementDocument.tsx'], {encoding:'utf8'})
const oldBody = previous.slice(previous.indexOf('  const file ='), previous.indexOf('  return <')).replace('const channel = campaignChannel(campaign,source)', 'const channel = selectedChannel').replace(/row\.totalCommissionRate!(?!=)/g, 'row.totalCommissionRate')
const legacy = new Function('source','rows','selectedChannel', oldBody + 'return {supplierCollects,knownChannel,supply,shipping,commission,amount}')
const row = {id:'row-1',optionName:'기존 SKU',quantity:10,canceledQuantity:1,refundedQuantity:1,unitPrice:10000,netSales:80000,totalCommissionRate:30}
for (const channel of ['supplier_link','wise_shop_link','seller_checkout',undefined]) {
  for (const source of [{}, {shippingRevenue:0}, {fileAnalysis:{supplyTotal:54321,supplierPayableTotal:58000,supplierShippingCost:3679}}, {shippingDetails:[{quantity:2,unitPrice:3500}]}]) {
    test(`v194 unchanged ${channel} ${JSON.stringify(source)}`, () => {
      const before = JSON.stringify({source,row})
      assert.deepEqual(supplierDocumentAmounts(source,[row],channel),legacy(source,[row],channel))
      assert.equal(JSON.stringify({source,row}),before)
    })
  }
}
test('explicit settlement price overrides file total',()=>{
  const rows=[{...row,settlementSupplyPrice:6500}]; const source={shippingRevenue:0,fileAnalysis:{supplyTotal:1,supplierPayableTotal:1}}
  assert.deepEqual(supplierDocumentAmounts(source,rows,'wise_shop_link'),legacy(source,rows,'wise_shop_link'))
  assert.equal(supplierDocumentAmounts(source,rows,'wise_shop_link').amount,52000)
})
test('known offset applied once',()=>assert.deepEqual(supplierOffsetSummary({manualSettlement:{reportedOffsetAmount:28680,reportedCommissionAmount:4996262}},4996262,true),{offset:28680,finalAmount:4967582,needsReview:false}))
test('already-net amount never deducted twice',()=>assert.equal(supplierOffsetSummary({manualSettlement:{reportedOffsetAmount:28680,reportedCommissionAmount:4996262}},4967582,true).finalAmount,undefined))
test('other direction not guessed',()=>assert.equal(supplierOffsetSummary({manualSettlement:{reportedOffsetAmount:100,reportedCommissionAmount:1000}},1000,false).needsReview,true))
test('missing base not zero',()=>assert.equal(supplierOffsetSummary({},undefined,true).finalAmount,undefined))
test('negative offset not silently credited',()=>assert.equal(supplierOffsetSummary({manualSettlement:{reportedOffsetAmount:-1,reportedCommissionAmount:1000}},1000,true).needsReview,true))
test('approval state label',()=>assert.equal(settlementWorkflowLabel({sellerPaymentRequestStatus:'approval_pending'},'정산 준비'),'대표 승인 대기'))
test('partial payment remains partial',()=>assert.equal(settlementWorkflowLabel({sellerPaymentRequestStatus:'payment_completed',managerPaymentRequestStatus:'approved'},'정산 준비'),'일부 지급 완료'))
test('one completed request does not complete all settlement',()=>assert.equal(settlementWorkflowLabel({sellerPaymentRequestStatus:'payment_completed'},'정산 준비'),'요청 건 지급 완료 · 나머지 정산 확인'))
test('approved label',()=>assert.equal(settlementWorkflowLabel({managerPaymentRequestStatus:'approved'},'정산 준비'),'승인 완료 · 지급 대기'))
test('pure rendering does not write records',()=>{
  for(const path of ['src/pages/settlement/components/SupplierRequestModal.tsx','src/shared/utils/supplierRequestDocument.ts','src/shared/utils/settlementWorkflowStatus.ts']) {
    const code=readFileSync(path,'utf8'); assert.doesNotMatch(code,/\.upsert\(|\.update\(|setItem\(|\.insert\(|\.delete\(/)
  }
})
console.log(`${count} checks passed; no production reads or writes`)
