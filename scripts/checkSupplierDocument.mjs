import assert from 'node:assert/strict'
import {createServer} from 'vite'
import {createElement} from 'react'
import {renderToStaticMarkup} from 'react-dom/server'
const v=await createServer({configFile:false,server:{middlewareMode:true,hmr:false},appType:'custom'})
try {
 const {SupplierSettlementDocument}=await v.ssrLoadModule('/src/pages/settlement/components/SupplierSettlementDocument.tsx')
 const source={fileName:'공급사.xlsx',settlementTerms:{salesChannelType:'seller_checkout'},fileAnalysis:{supplyTotal:1084050,supplierShippingCost:186000,supplierPayableTotal:1270050}}
 const rows=[{id:'1',optionName:'치즈',quantity:43,canceledQuantity:0,refundedQuantity:0,unitPrice:12980,netSales:558140,sellerCommissionRate:20,totalCommissionRate:32.2}]
 const html=renderToStaticMarkup(createElement(SupplierSettlementDocument,{source,rows,campaign:{campaignName:'치즈 공구',brandName:'뉴월드'},documentRef:{current:null}}))
 assert.match(html,/1,270,050/);assert.match(html,/1,084,050/);assert.match(html,/186,000/)
 assert.ok(!html.includes('20%'));assert.ok(!html.includes('벤더 측 보유'))
 const missing=renderToStaticMarkup(createElement(SupplierSettlementDocument,{source:{...source,fileAnalysis:undefined},rows,documentRef:{current:null}}))
 assert.match(missing,/원본 청구액 확인 필요/)
 console.log('Supplier document source amounts, missing-data and vendor rate isolation checks passed')
}finally{await v.close()}
