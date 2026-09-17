import assert from 'node:assert/strict'
import { createServer } from 'vite'
const vite = await createServer({ configFile: false, server: { middlewareMode: true, hmr: false }, appType: 'custom' })
try {
 const { buildSalesReferences, referenceBandIndex } = await vite.ssrLoadModule('/src/shared/utils/salesReferences.ts')
 assert.deepEqual([9999999,10000000,19999999,20000000,30000000,50000000,100000000].map(referenceBandIndex),[0,1,1,2,3,4,5])
 const campaigns=[{ id:'c', productName:'상품', sellerName:'셀러', brandName:'브랜드',startDate:'2026-08-01',endDate:'2026-08-04' }]
 const base={id:'s', campaignId:'c',status:'approved',settlementConfirmed:true,updatedAt:'2026-09-01',settlementVersion:1,calculationSnapshot:{netSales:20000000},currentCalculation:{netSales:99000000}}
 const build=rows=>buildSalesReferences(rows,campaigns,row=>row.settlementConfirmed)
 assert.equal(build([base])[0].amount,20000000)
 assert.equal(build([base,{...base,id:'s2',updatedAt:'2026-09-02',calculationSnapshot:{netSales:30000000}}]).length,1)
 assert.equal(build([base,{...base,id:'s2',updatedAt:'2026-09-02',settlementConfirmed:false}]).length,0)
 for (const patch of [{status:'canceled'},{hasSourceChanged:true},{calculationSnapshot:undefined},{calculationSnapshot:{netSales:NaN}},{calculationSnapshot:{netSales:0}}]) assert.equal(build([{...base,...patch}]).length,0)
 console.log('Reference boundaries, frozen revenue, deduplication and exclusion checks passed')
} finally { await vite.close() }
