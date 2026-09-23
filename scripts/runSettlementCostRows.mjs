import assert from 'node:assert/strict'
import { createServer } from 'vite'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
const server = await createServer({ envDir: false, server: { middlewareMode: true, hmr: false }, appType: 'custom' })
try {
 const { calculateDeductions, getSettlementCostBreakdown, calculateDistributableVendorCommission } = await server.ssrLoadModule('/src/shared/utils/settlement.ts')
 const { SettlementCostRows } = await server.ssrLoadModule('/src/pages/settlement/components/SettlementAdjustmentRows.tsx')
 const item = (type, amount, extra = {}) => ({ id: type, type, amount, title: type, costOwner: 'company', linkedData: '', reflected: true, applyLocation: 'net_company_commission', ...extra })
 const fee = item('purchase', 6285, { linkedData: 'sales_data:test:srookpay' })
 const event = item('event', 5000)
 for (const [items, eventVisible, feeVisible] of [[[fee],false,true],[[event,fee],true,true],[[event],true,false],[[],false,false]]) {
  const totals = calculateDeductions(items)
  const snapshot = { deductions: items, companySampleDeduction: totals.companySampleTotal, companyEventDeduction: totals.companyEventTotal, companyOtherDeduction: totals.companyOtherTotal, managerReimbursementTotal: totals.managerReimbursementTotal, distributionDeductionTotal: totals.distributionDeductionTotal }
  const before = JSON.stringify(snapshot)
  const split = getSettlementCostBreakdown(snapshot)
  const html = renderToStaticMarkup(createElement('table',null,createElement('tbody',null,createElement(SettlementCostRows,{ calculation: snapshot }))))
  assert.equal(html.includes('이벤트 비용'),eventVisible)
  assert.equal(html.includes('스룩페이 결제 수수료'),feeVisible)
  assert(!html.includes('− 0원'))
  assert.equal(JSON.stringify(snapshot),before)
  const prior = calculateDistributableVendorCommission(100000, totals.companySampleTotal, totals.companyEventTotal, totals.companyOtherTotal + totals.distributionDeductionTotal, totals.managerReimbursementTotal)
  const next = calculateDistributableVendorCommission(100000,0,split.eventCost,split.srookPayFee+split.otherCost)
  assert.equal(next,prior)
  assert.equal(100000-next,items.reduce((sum,row)=>sum+row.amount,0))
 }
 for (const row of [item('event',3000,{direction:'deduction',applyLocation:'company_payment'}),item('sample',3000,{direction:'deduction',applyLocation:'manager_reimbursement'})]) {
  assert.equal(calculateDeductions([row]).costBreakdown.eventCost,3000)
 }
 assert.deepEqual(calculateDeductions([item('event',3000,{direction:'payment',applyLocation:'company_payment'}),item('event',3000,{applyLocation:'seller_payment'})]).costBreakdown,{eventCost:0,srookPayFee:0,otherCost:0})
 assert.equal(calculateDeductions([item('shipping',3000)]).costBreakdown.otherCost,3000)
 console.log('PASS A–D rendered cost rows; prepaid/distribution adjustments; no double deduction; immutable legacy snapshots. 딸세끼 condition reproduced, no live DB access.')
} finally { await server.close() }
