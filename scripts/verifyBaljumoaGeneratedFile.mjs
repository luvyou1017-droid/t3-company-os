import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import XLSX from 'xlsx'
import {createServer} from 'vite'
const server=await createServer({envDir:false,server:{middlewareMode:true,hmr:false},appType:'custom'})
try {
 const {buildBaljumoaWorkbook,BALJUMOA_COLUMNS}=await server.ssrLoadModule('/src/features/samples/baljumoaExport.ts')
 const template=new Uint8Array(await fs.readFile('public/templates/baljumoa-manual.xlsx'))
 const order={id:'SAMPLE-TEST-0001',requestedAt:'2026-09-21T00:00:00Z',status:'발주대기',recipient:'테스트 수령인',phone:'01000000000',address:'테스트 주소',productName:'테스트 상품',optionName:'민트',detailOption:'대형',quantity:1}
 const folder=await fs.mkdtemp(path.join(os.tmpdir(),'t3-baljumoa-verification-'))
 const file=path.join(folder,'TEST-ONLY-not-for-dispatch.xlsx')
 await fs.writeFile(file,buildBaljumoaWorkbook(template,[order,{...order,id:'SAMPLE-TEST-0002',quantity:2}]))
 const bytes=await fs.readFile(file),book=XLSX.read(bytes,{type:'buffer'})
 assert.deepEqual(book.SheetNames,['Supply'])
 assert.deepEqual(XLSX.utils.sheet_to_json(book.Sheets.Supply,{header:1})[0],BALJUMOA_COLUMNS)
 assert.equal(book.Sheets.Supply.A3.v,'SAMPLE-TEST-0002')
 assert.equal(book.Sheets.Supply.M3.v,2)
 assert.equal(book.Sheets.Supply.E2.v,'01000000000')
 assert.equal(book.Sheets.Supply.H2?.v,undefined)
 console.log('PASS disk XLSX generated and reopened: exact 28 columns, Supply sheet, two orders, text phone and blank postcode.')
 console.log('Temporary test file: '+file)
 console.log('Not sent to Baljumoa. Actual importer acceptance remains unverified.')
}finally{await server.close()}
