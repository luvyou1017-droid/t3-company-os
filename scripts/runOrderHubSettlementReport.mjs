import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import XLSX from 'xlsx'
import { createServer } from 'vite'
const server=await createServer({server:{middlewareMode:true},appType:'custom'})
try {
 const {parseSalesDataFile}=await server.ssrLoadModule('/src/shared/utils/salesDataFileParser.ts')
 const {sanitizeSellerWorkbook}=await server.ssrLoadModule('/src/shared/utils/sellerOrderExcel.ts')
 const path=process.argv[2]??'/workspace/scratch/82bb77d539fa/upload/정산서_주왕산가든_2026-04-01_2026-09-03_20260921015401310.xlsx'
 const bytes=await fs.readFile(path); const file=new File([bytes],'order-hub.xlsx')
 await assert.rejects(parseSalesDataFile(file,{id:'test',campaignId:'test'}),/수수료율/)
 const result=await parseSalesDataFile(file,{id:'test',campaignId:'test',sellerCommissionRate:18})
 assert.equal(result.analysis.sheetName,'일별 상품요약')
 assert.equal(result.rows.length,3)
 assert.equal(result.rows.reduce((s,r)=>s+r.quantity,0),31)
 assert.equal(result.analysis.supplierSettlementAmount,883386)
 assert.equal(result.rows.reduce((s,r)=>s+r.grossSales,0),1077300)
 const safe=XLSX.read(sanitizeSellerWorkbook(await file.arrayBuffer()),{type:'array'})
 assert.equal(safe.SheetNames.length,1)
 const rows=XLSX.utils.sheet_to_json(safe.Sheets[safe.SheetNames[0]],{header:1})
 assert.ok(rows[0].includes('주문번호'));assert.ok(rows[0].includes('수취인명'))
 assert.ok(!rows[0].some(x=>/가격|금액|단가|공급|수수료/.test(x)))
 assert.ok(rows.length>=29)
 console.log('PASS actual workbook: one summary only, 3 options/31 units/883386 supplier amount; explicit TEST 18% yields1077300')
 console.log('PASS missing rate requires confirmation; safe buyer-detail export omits supplier pricing and internal sheets')
} finally {await server.close()}
