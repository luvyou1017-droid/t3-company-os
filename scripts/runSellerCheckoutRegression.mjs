import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import {createServer} from 'vite'
const server=await createServer({envDir:false,server:{middlewareMode:true,hmr:false},appType:'custom'})
try {
 const load=p=>server.ssrLoadModule('/src/shared/utils/'+p+'.ts')
 const {parseSalesDataFile}=await load('salesDataFileParser')
 const {captureUploadTerms,applyReviewedUpload}=await load('uploadSettlementConditions')
 const {calculateVendorDocument}=await load('vendorSettlementDocument')
 const file=new File([await fs.readFile('../seller-checkout-original/정산서_주왕산가든_2026-04-01_2026-09-03_20260921015401310(1).xlsx')],'actual.xlsx')
 const source={id:'isolated',campaignId:'isolated',sellerCommissionRate:18}
 const parsed=await parseSalesDataFile(file,source,[],'seller_checkout')
 assert.equal(parsed.analysis.supplierSettlementAmount,883386)
 assert.equal(parsed.analysis.supplierShippingCost,88000)
 assert.equal(parsed.analysis.supplierPayableTotal,971386)
 const qty={one:12,three:13,six:6}, price={one:8674,three:24812,six:49624}
 const reviewed=parsed.rows.map(r=>{const k=r.optionName.includes('3+3팩')?'six':r.optionName.includes('3팩')?'three':'one';assert.equal(r.netQuantity,qty[k]);return {...r,skuId:k,productId:'existing',agreedUnitPrice:r.unitPrice,sellerSupplyPrice:price[k],sellerCommissionRate:18,totalCommissionRate:30}})
 const applied=applyReviewedUpload(parsed,reviewed)
 const terms=captureUploadTerms('seller_checkout',applied.rows,true)
 const input={...source,settlementTerms:terms,fileAnalysis:parsed.analysis}
 const before=JSON.stringify({reviewed,input})
 const report=calculateVendorDocument(applied.rows,input)
 assert.equal(report.supplyTotal,724388);assert.equal(report.shipping,88000);assert.equal(report.finalAmount,812388)
 assert.equal(report.commissionTotal,0)
 assert.equal(JSON.stringify({reviewed,input}),before)
 const changedRate=reviewed.map(r=>({...r,sellerCommissionRate:40}))
 assert.equal(calculateVendorDocument(changedRate,input).finalAmount,812388)
 const derived=reviewed.map(r=>({...r,sellerSupplyPrice:undefined}))
 assert.throws(()=>captureUploadTerms('seller_checkout',derived,true),/셀러 적용 공급가/)
 const legacyInput={...input,settlementTerms:{...terms,sellerCheckoutPricingVersion:undefined}}
 const legacy=calculateVendorDocument(reviewed,legacyInput)
 assert.equal(legacy.supplyTotal,reviewed.reduce((s,r)=>s+r.netSales-Math.round(r.netSales*r.sellerCommissionRate/100),0))
 const supplierParsed=await parseSalesDataFile(file,source,[],'supplier_link')
 assert.equal(supplierParsed.rows.reduce((s,r)=>s+r.netSales,0),1077300)
 const supplier=calculateVendorDocument(reviewed,{...input,settlementTerms:{...terms,salesChannelType:'supplier_link'}})
 assert.equal(supplier.finalAmount,reviewed.reduce((s,r)=>s+Math.round(r.netSales*r.sellerCommissionRate/100),0))
 const returns=reviewed.map((r,i)=>i? r:{...r,refundedQuantity:1})
 assert.equal(calculateVendorDocument(returns,input).finalAmount,812388-reviewed[0].sellerSupplyPrice)
 assert.equal(calculateVendorDocument(reviewed,{...input,shippingDetails:[{label:'confirmed',quantity:1,unitPrice:1234}]}).shipping,1234)
 console.log('PASS actual (1).xlsx: summary883386/shipping88000/total971386; quantities12/13/6; reviewed SKU prices8674/24812/49624 ->724388+88000=812388; no second commission; returns/manual shipping; unchanged legacy and supplier-link calculations; inputs not mutated')
 console.log('Production record and saved SKU values not accessed; user-provided supply conditions tested against actual workbook.')
} finally {await server.close()}
