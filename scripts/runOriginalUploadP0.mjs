import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import { createServer } from 'vite'
class MemoryStorage { data=new Map(); getItem(k){return this.data.get(k)??null} setItem(k,v){this.data.set(k,String(v))} removeItem(k){this.data.delete(k)} clear(){this.data.clear()} }
globalThis.localStorage=new MemoryStorage()
const server=await createServer({server:{middlewareMode:true},appType:'custom'})
try {
 const {supabase}=await server.ssrLoadModule('/src/shared/lib/supabase.ts')
 const {sellerSettlementFileService: files}=await server.ssrLoadModule('/src/shared/services/sellerSettlementFileService.ts')
 const {parseSalesDataFile}=await server.ssrLoadModule('/src/shared/utils/salesDataFileParser.ts')
 const {salesDataService:sales}=await server.ssrLoadModule('/src/shared/services/salesDataService.ts')
 const {settlementService:settlements}=await server.ssrLoadModule('/src/shared/services/settlementService.ts')
 const {STORAGE_KEYS}=await server.ssrLoadModule('/src/shared/services/storageService.ts')
 const input='/workspace/scratch/82bb77d539fa/upload/■정산서_팁끌모아살림_오토모 소닉붐2차_26년08월 - 복사본.xlsx'
 const file=new File([await fs.readFile(input)],'existing-orders.xlsx',{type:'application/zip'})
 const source={id:'p0-isolated',campaignId:'p0-test-campaign',fileName:file.name,fileSize:file.size,sourceType:'file',reviewStatus:'업로드 완료',settlementStatus:'정산 전',totalQuantity:0,totalSalesAmount:0,notes:'',uploadedBy:'test',uploadedAt:'2026-09-21',totalCommissionRate:30,sellerCommissionRate:20}
 const parsed=await parseSalesDataFile(file,source)
 assert.ok(parsed.rows.length>0)
 const before=JSON.stringify(parsed.rows)
 let rejectUpload=false, signCalls=0, savedBytes
 const originalFrom=supabase.storage.from
 supabase.storage.from=bucket=>{
  assert.equal(bucket,'seller-documents')
  return {upload:async(path,body,options)=>{
   assert.ok(path.startsWith('settlement-exports/campaigns/'))
   assert.equal(options.contentType,'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
   if(rejectUpload)return {error:new Error('mime type not supported')}
   savedBytes=Buffer.from(await body.arrayBuffer()); return {error:null}
  }, createSignedUrl:async()=>{signCalls++;throw new Error('link unavailable')}}
 }
 try {
  const success=await files.storeOriginalForImport(file,{campaignId:source.campaignId,salesDataImportId:source.id})
  assert.ok(success.originalSalesFileStoragePath)
  assert.deepEqual(savedBytes,Buffer.from(await file.arrayBuffer()))
  rejectUpload=true
  const pending=await files.storeOriginalForImport(file,{campaignId:source.campaignId,salesDataImportId:source.id,previousPath:'old-original'})
  assert.equal(pending.originalSalesFileStoragePath,undefined)
  assert.ok(pending.originalSalesFileStorageError)
  assert.equal(signCalls,0)
  const historical={id:'historical-fixed',calculationSnapshot:{amount:12345},originalSnapshot:{amount:12345}}
  localStorage.setItem(STORAGE_KEYS.settlements,JSON.stringify([historical]))
  sales.createSalesDataImport({...source,...pending})
  sales.addSalesDataRows(source.id,parsed.rows)
  const validation=sales.validateSalesData(source.id)
  assert.notEqual(validation.status,'error',JSON.stringify(validation))
  assert.ok(sales.confirmSalesData(source.id))
  const settlement=settlements.createSettlementFromSalesData(source.id)
  assert.ok(settlement,'Settlement drafting must remain reachable')
  assert.ok(Number.isFinite(settlement.currentCalculation.grossSales))
  assert.equal(settlement.currentCalculation.grossSales,parsed.rows.reduce((sum,row)=>sum+row.grossSales,0))
  assert.deepEqual(JSON.parse(localStorage.getItem(STORAGE_KEYS.settlements)).find(x=>x.id===historical.id),historical)
  await assert.rejects(files.generateSellerExcel({...source,...pending},parsed.rows,settlement.id,1),/보관이 미완료/)
  assert.equal(JSON.stringify(parsed.rows),before)
  console.log('PASS existing Excel parse; original bytes preserved on successful mocked upload; canonical XLSX MIME')
  console.log('PASS MIME rejection does not block sales validation/confirmation or settlement draft; no signing during upload')
  console.log('PASS no stale original path, no false aggregate link, original rows/historical Snapshot unchanged')
  console.log('Production Storage and authenticated UI NOT tested (admin login unavailable).')
 } finally {supabase.storage.from=originalFrom}
} finally {await server.close()}
