import assert from 'node:assert/strict'
import { createServer } from 'vite'
const vite = await createServer({ configFile:false, server:{middlewareMode:true,hmr:false}, appType:'custom' })
try {
 const { getSalesEventCosts } = await vite.ssrLoadModule('/src/shared/utils/salesEventCosts.ts')
 const { calculateDeductions, calculateDistributableVendorCommission, calculateManagerAmount } = await vite.ssrLoadModule('/src/shared/utils/settlement.ts')
 const [event] = getSalesEventCosts({eventCosts:[{id:'advance',name:'페이백',owner:'company_manager_prepaid',unitPrice:29400,quantity:1,amount:29400}]})
 assert.equal(event.amount,29400); assert.equal(event.owner,'company_manager_prepaid')
 const totals=calculateDeductions([{amount:event.amount,costOwner:'company',applyLocation:'manager_reimbursement',reflected:true,type:'event'}])
 assert.equal(totals.managerReimbursementTotal,29400); assert.equal(totals.companyEventTotal,0); assert.equal(totals.sellerTotal,0)
 const pool=calculateDistributableVendorCommission(100000,0,0,0,totals.managerReimbursementTotal)
 assert.equal(pool,70600); assert.equal(calculateManagerAmount(pool,50,0,totals.managerReimbursementTotal),64700)
 console.log('Manager prepaid normalization, no double deduction, and reimbursement calculations passed')
} finally { await vite.close() }
