import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import { createServer } from 'vite'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
class MemoryStorage { data=new Map(); getItem(k){return this.data.get(k)??null} setItem(k,v){this.data.set(k,String(v))} removeItem(k){this.data.delete(k)} }
globalThis.localStorage=new MemoryStorage()
const server=await createServer({server:{middlewareMode:true,hmr:false},appType:'custom'})
try {
 const load=p=>server.ssrLoadModule(`/src/${p}.ts`)
 const {parseSalesDataFile}=await load('shared/utils/salesDataFileParser')
 const {salesDataService:sales}=await load('shared/services/salesDataService')
 const {settlementService:settlements}=await load('shared/services/settlementService')
 const {STORAGE_KEYS}=await load('shared/services/storageService')
 const {productService}=await load('features/productMaster/services/productService')
 const {manuallyMatchSalesRow}=await load('shared/services/productCommissionSyncService')
 const {salesSourceLabel}=await load('shared/utils/salesSourceLabel')
 const {resolveSupplyAudience}=await load('shared/utils/supplyAudience')
 const {managerShareCalculated,getShareRates,canMoveToApproval}=await load('shared/utils/settlement')
 const file=new File([await fs.readFile('/workspace/scratch/82bb77d539fa/upload/정산서_주왕산가든_2026-04-01_2026-09-03_20260921015401310.xlsx')],'order-hub-real.xlsx')
 const source={id:'orderhub-isolated',campaignId:'orderhub-test-campaign',fileName:file.name,fileSize:file.size,sourceType:'file',reviewStatus:'업로드 완료',settlementStatus:'정산 전',totalQuantity:0,totalSalesAmount:0,notes:'',uploadedBy:'test',uploadedAt:'2026-09-21',totalCommissionRate:30,sellerCommissionRate:18}
 const parsed=await parseSalesDataFile(file,source)
 assert.equal(parsed.rows.length,3); assert.equal(parsed.rows.reduce((s,r)=>s+r.quantity,0),31)
 const historical={id:'historical-fixed',calculationSnapshot:{amount:12345},originalSnapshot:{amount:12345}}
 localStorage.setItem(STORAGE_KEYS.settlements,JSON.stringify([historical]))
 sales.createSalesDataImport({...source,fileAnalysis:parsed.analysis})
 sales.addSalesDataRows(source.id,parsed.rows)
 const product={id:'test-existing-product',brandName:'TEST',name:'TEST',totalCommissionRate:30,sellerCommissionRate:18,commissionCalculationType:'sku',skus:parsed.rows.map((row,i)=>({id:`test-existing-sku-${i}`,active:true,optionName:row.optionName,groupBuyPrice:row.unitPrice,totalCommissionRate:30,sellerCommissionRate:18}))}
 const productBefore=JSON.stringify(product)
 productService.listProducts=async()=>[product]
 for(let i=0;i<parsed.rows.length;i++)await manuallyMatchSalesRow(source.id,parsed.rows[i].id,product.skus[i].id)
 const linked=sales.getSalesDataImportById(source.id)
 assert.equal(linked.commissionSyncMatchedRows,3); assert.equal(linked.commissionSyncUnmatchedRows,0)
 assert.ok(Object.values(linked.commissionManualMatches).includes(product.skus[0].id))
 assert.equal(JSON.stringify(product),productBefore)
 const validation=sales.validateSalesData(source.id)
 assert.notEqual(validation.status,'error',JSON.stringify(validation))
 assert.ok(sales.confirmSalesData(source.id))
 const settlement=settlements.createSettlementFromSalesData(source.id)
 assert.ok(settlement)
 assert.equal(settlement.currentCalculation.grossSales,1077300)
 assert.equal(JSON.stringify(JSON.parse(localStorage.getItem(STORAGE_KEYS.settlements)).find(x=>x.id===historical.id)),JSON.stringify(historical))
 assert.equal(salesSourceLabel(linked),'발주모아')
 assert.equal(salesSourceLabel({...source,sourceType:'manual'}),'수기 입력')
 assert.equal(salesSourceLabel({...source,fileOrigin:'srookpay'}),'스룩페이')
 assert.equal(resolveSupplyAudience({settlementVendorName:'업체'}),'vendor')
 assert.equal(resolveSupplyAudience({}),'unknown')
 assert.equal(resolveSupplyAudience({supplyAudience:'seller'}),'seller')
 assert.equal(resolveSupplyAudience({supplyAudience:'seller'},{supplyAudience:'vendor'}),'unknown')
 for(const gross of [9999999,10000000,19999999,20000000]) {
  const rate=getShareRates(gross)
  const calc={managerShareRate:rate.managerRate,companyShareRate:rate.companyRate}
  assert.ok(managerShareCalculated(calc))
  assert.ok(canMoveToApproval({status:'manager_reviewed',evidenceStatus:'confirmed',reviewChecklist:{managerShareConfirmed:false,salesMatches:true},currentCalculation:calc}))
 }
 assert.ok(!managerShareCalculated({managerShareRate:NaN,companyShareRate:50}))
 const {SupplierRequestModal}=await server.ssrLoadModule('/src/pages/settlement/components/SupplierRequestModal.tsx')
 const markup=renderToStaticMarkup(React.createElement(SupplierRequestModal,{source:linked,rows:parsed.rows,deductions:[{id:'internal',title:'INTERNAL_MARGIN_SENTINEL',amount:321,reflected:true}],onClose(){},createPng:async()=>new Blob()}))
 const external=markup.split('supplier-external-document')[1].split('관리자 확인')[0]
 assert.ok(external.includes('주식회사 솔루션파트너스'));assert.ok(external.includes('wisevendor.tax@gmail.com'));assert.ok(external.includes('100-038-387940'))
 assert.ok(!external.includes('INTERNAL_MARGIN_SENTINEL'));assert.ok(!external.includes('현재 상품DB'))
 assert.ok(markup.includes('이미지 복사'));assert.ok(markup.includes('PNG 저장'))
 console.log('PASS actual OrderHub workbook -> 3 matched synthetic existing SKUs -> 31 units -> sales confirmation -> settlement draft 1077300 (explicit TEST 18%); historical snapshot/SKU IDs preserved')
 console.log('PASS two KPI types with unresolved retained; source labels; auto-share thresholds and no manual confirmation gate; supplier external company/bank rendered without internal reference amounts')
 console.log('Live DB, live 이다솔 payment, browser clipboard/PNG and production Storage not exercised.')
} finally {await server.close()}
