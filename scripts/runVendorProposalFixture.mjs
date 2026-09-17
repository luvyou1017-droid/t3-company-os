import assert from 'node:assert/strict'
import { createServer } from 'vite'
const v=await createServer({configFile:false,server:{middlewareMode:true,hmr:false},appType:'custom'})
try {
 const {buildInput,findExisting}=await v.ssrLoadModule('/src/pages/master/products/ProductBulkImportPanel.tsx')
 const candidate={fileName:'vendor.xlsx', productName:'수입치즈', settlementVendorName:'인벤토리',rows:[{'상품명':'아그리폼','구성명':'그라인더 150g','카테고리':'식품','정상가':14230,'공구판매가':12980,'총 매입가(VAT포함)':8800,'셀러 수수료율':20}],metadata:{brandName:'뉴월드',vendorName:'공급사',shippingFee:3000,draft:false,sampleSupportType:'협의'}}
 const input=buildInput(candidate)
 assert.equal(input.supplyAudience,'vendor');assert.equal(input.settlementVendorName,'인벤토리');assert.equal(input.sellerPortalVisible,false);assert.equal(input.skus[0].sellerCommissionRate,20)
 const seller={...input,id:'seller',supplyAudience:'seller',settlementVendorName:undefined}
 assert.equal(findExisting([seller],candidate),undefined)
 const vendor={...input,id:'vendor'}
 assert.equal(findExisting([seller,vendor],candidate).id,'vendor')
 assert.equal(findExisting([vendor],{...candidate,settlementVendorName:'다른벤더'}),undefined)
 const {getUploadConditions}=await v.ssrLoadModule('/src/shared/utils/uploadSettlementConditions.ts')
 const catalog=[{...seller,skus: seller.skus.map((sku,i)=>({...sku,id:'seller-'+i,active:true}))},{...vendor,skus:vendor.skus.map((sku,i)=>({...sku,id:'vendor-'+i,active:true}))}]
 const vendorConditions=getUploadConditions(catalog,{supplyAudience:'vendor',settlementVendorName:'인벤토리'}).all
 assert.equal(vendorConditions.find(item=>item.skuId==='seller-0').sellerCommissionRate,undefined,'Seller rate must not become an unagreed vendor rate')
 assert.equal(vendorConditions.find(item=>item.skuId==='vendor-0').sellerCommissionRate,20)
 assert.match(vendorConditions.find(item=>item.skuId==='vendor-0').supplyLabel,/인벤토리/)
 const sellerConditions=getUploadConditions(catalog,{supplyAudience:'seller'}).all
 assert.equal(sellerConditions.length,1)
 assert.equal(sellerConditions[0].sellerCommissionRate,20)
 const savedConditions=getUploadConditions(catalog,{supplyAudience:'vendor',settlementVendorName:'인벤토리'},{supplyAudience:'vendor',settlementVendorName:'인벤토리',settlementTerms:{skuConditions:[{skuId:'vendor-0',productId:'vendor',productName:'치즈',optionName:'치즈',groupBuyPrice:12980,sellerCommissionRate:19}]}}).all
 assert.equal(savedConditions.find(item=>item.skuId==='vendor-0').sellerCommissionRate,19,'Retain explicitly saved campaign terms')
 console.log('Vendor proposal recipient, rate, visibility and isolation checks passed')
} finally {await v.close()}
