import assert from 'node:assert/strict'
import { createServer } from 'vite'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
const server = await createServer({ envDir:false, server:{ middlewareMode:true, hmr:false }, appType:'custom' })
try {
 const { SettlementCostRows, SettlementPaymentRow } = await server.ssrLoadModule('/src/pages/settlement/components/SettlementAdjustmentRows.tsx')
 const { namedAdjustmentRows } = await server.ssrLoadModule('/src/shared/utils/settlementAdjustmentLabels.ts')
 const { getSellerSettlementSchedule } = await server.ssrLoadModule('/src/shared/utils/settlementDocument.ts')
 const item = { id:'test', type:'event', title:'지엠 스룩페이 수수료', amount:2065, reflected:true, direction:'deduction', applyLocation:'net_company_commission', costOwner:'company' }
 const snapshot = { deductions:[item], companySampleDeduction:0, companyEventDeduction:0, companyOtherDeduction:0, managerReimbursementTotal:0, distributionDeductionTotal:2065, grossCommission:10450, sellerCommissionAmount:7600, distributableVendorCommission:785 }
 const before = JSON.stringify(snapshot)
 const render = component => renderToStaticMarkup(React.createElement('table',null,React.createElement('tbody',null,component)))
 const html = render(React.createElement(SettlementCostRows,{calculation:snapshot}))
 assert(html.includes('지엠 스룩페이 수수료')); assert(html.includes('2,065')); assert(!html.includes('이벤트 비용'))
 assert.equal(10450-7600-2065,785)
 for (const title of ['택배비 1건','셀러 부담 샘플']) assert.deepEqual(namedAdjustmentRows([{...item,title}],2065,'차감'),[{id:'test',label:title,amount:2065}])
 const payment = render(React.createElement(SettlementPaymentRow,{amount:3000,items:[{...item,title:'추가 지급 택배비',direction:'payment',amount:3000}]}))
 assert(payment.includes('+ 추가 지급 택배비')); assert(payment.includes('3,000'))
 assert.equal(JSON.stringify(snapshot),before)
 assert.deepEqual(namedAdjustmentRows([],2065,'차감·조정비용'),[{id:'stored-total',label:'차감·조정비용',amount:2065}])
 assert.deepEqual(namedAdjustmentRows([],0,'차감'),[])
 const event = {...item,id:'event-actual',title:'이벤트 비용',amount:5000}
 const fee = {...item,id:'srookpay',type:'purchase',title:'스룩페이 결제 수수료',linkedData:'sales_data:import:srookpay',amount:6285}
 const both = render(React.createElement(SettlementCostRows,{calculation:{...snapshot,deductions:[event,fee],companyEventDeduction:5000,companyOtherDeduction:6285,distributionDeductionTotal:0}}))
 assert(both.includes('− 이벤트 비용') && both.includes('− 스룩페이 결제 수수료') && !both.includes('이벤트 비용·링크 수수료'))
 const feeOnly = render(React.createElement(SettlementCostRows,{calculation:{...snapshot,deductions:[fee],companyEventDeduction:0,companyOtherDeduction:6285,distributionDeductionTotal:0}}))
 assert(feeOnly.includes('스룩페이 결제 수수료') && !feeOnly.includes('이벤트 비용'))
 const createdSchedule = getSellerSettlementSchedule(new Date('2026-09-18T01:00:00.000Z'))
 const copiedSchedule = getSellerSettlementSchedule(new Date('2026-09-23T01:00:00.000Z'))
 assert.notEqual(createdSchedule.evidenceDeadline.toISOString(), copiedSchedule.evidenceDeadline.toISOString())
 assert.notEqual(createdSchedule.paymentDate.toISOString(), copiedSchedule.paymentDate.toISOString())
 console.log('PASS: provided-case rendered label and amount; individual credits/debits; historical totals and snapshot unchanged. Not a live DB test.')
} finally { await server.close() }
