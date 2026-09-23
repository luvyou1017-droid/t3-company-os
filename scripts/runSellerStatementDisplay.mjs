import assert from 'node:assert/strict'
import {createServer} from 'vite'
import {createElement} from 'react'
import {renderToStaticMarkup} from 'react-dom/server'
const server=await createServer({envDir:false,server:{middlewareMode:true,hmr:false},appType:'custom'})
try {
 const {SellerStatementAmountRows,sellerStatementAmount}=await server.ssrLoadModule('/src/pages/settlement/components/SellerStatementAmountRows.tsx')
 const {SettlementEventCostRow,SettlementPaymentRow}=await server.ssrLoadModule('/src/pages/settlement/components/SettlementAdjustmentRows.tsx')
 const {calculateFinalSellerPayment}=await server.ssrLoadModule('/src/shared/utils/sellerSettlement.ts')
 const snapshot={sellerCommissionAmount:21438,sellerDeductionTotal:58466,finalSellerPaymentAmount:0,sellerReceivableAmount:37028}
 const before=JSON.stringify(snapshot)
 const signed=sellerStatementAmount(snapshot.sellerCommissionAmount,snapshot.sellerDeductionTotal)
 const payout=calculateFinalSellerPayment(21438,'general_business',58466)
 assert.equal(signed,-37028);assert.equal(payout.finalSellerPaymentAmount,0);assert.equal(payout.sellerReceivableAmount,37028)
 const html=renderToStaticMarkup(createElement('table',null,createElement('tbody',null,createElement(SellerStatementAmountRows,{amount:signed,payout:payout.finalSellerPaymentAmount,receivable:payout.sellerReceivableAmount}))))
 assert.match(html,/-37,028원/);assert.match(html,/실제 지급액/);assert.match(html,/>0원</);assert.match(html,/미수금 발생/);assert.equal(JSON.stringify(snapshot),before)
 assert.equal(renderToStaticMarkup(createElement(SettlementEventCostRow,{amount:0})), '')
 assert.match(renderToStaticMarkup(createElement(SettlementEventCostRow,{amount:6199})),/6,199원/)
 assert.equal(renderToStaticMarkup(createElement(SettlementPaymentRow,{amount:0})), '')
 assert.equal(sellerStatementAmount(50000,15000),35000)
 assert.equal(sellerStatementAmount(21438,58466,3000),-34028)
 console.log('PASS provided 드발란트 amounts: signed −37,028 / payout 0 / receivable 37,028; rendered rows and zero-cost hiding; snapshots unchanged. Supplied-case reproduction, no production writes.')
} finally { await server.close() }
