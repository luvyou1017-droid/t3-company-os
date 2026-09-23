import assert from 'node:assert/strict'
import {createServer} from 'vite'
const server=await createServer({envDir:false,server:{middlewareMode:true,hmr:false},appType:'custom'})
try {
 const {calculateSupplierPayment:calc}=await server.ssrLoadModule('/src/shared/utils/supplierPayment.ts')
 const {supplierDocumentAmounts:document}=await server.ssrLoadModule('/src/shared/utils/supplierRequestDocument.ts')
 const rows=[{id:'a',skuId:'existing',quantity:12,canceledQuantity:1,refundedQuantity:1,unitPrice:20000,totalCommissionRate:30,netSales:200000}]
 const terms={lines:[{rowId:'a',skuId:'existing',quantity:10,companySupplyPrice:7000}],shipping:{seller:88000,company:1000,supplier:4000},adjustments:[{direction:'subtract',amount:5000},{direction:'add',amount:2000}]}
 const source={fileAnalysis:{supplierPayableTotal:999999,supplierShippingCost:88000}}
 const original=JSON.stringify({terms,rows,source})
 assert.equal(calc(terms,rows).amount,71000)
 assert.equal(document(source,rows,'seller_checkout',terms).amount,71000)
 assert.equal(document(source,rows,'seller_checkout').amount,undefined)
 assert.equal(calc({...terms,shipping:{seller:88000}},rows).amount,undefined)
 assert.equal(calc({...terms,lines:[{...terms.lines[0],companySupplyPrice:undefined}]},rows).amount,undefined)
 assert.equal(calc(terms,[{...rows[0],skuId:'changed'}]).amount,undefined)
 assert.equal(calc(terms,[{...rows[0],quantity:13}]).amount,undefined)
 assert.equal(document(source,rows,'supplier_link',terms).amount,60000)
 assert.equal(document(source,rows,'seller_checkout',undefined,true).amount,999999)
 assert.equal(JSON.stringify({terms,rows,source}),original)
 const {settlementService}=await server.ssrLoadModule('/src/shared/services/settlementService.ts')
 settlementService.getSettlementById=()=>({id:'confirmed',settlementConfirmed:true})
 settlementService.saveSettlements=()=>{throw new Error('unexpected write')}
 assert.throws(()=>settlementService.saveSupplierPayment('confirmed',terms),/확정 정산/)
 console.log('PASS explicit company cost, net quantity, independent shipping, signed adjustments, missing/stale terms fail closed, supplier-link and historic legacy preserved; no input mutation')
}finally{await server.close()}
