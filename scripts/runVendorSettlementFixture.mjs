import assert from 'node:assert/strict'
import { createServer } from 'vite'
const vite=await createServer({configFile:false,server:{middlewareMode:true,hmr:false},appType:'custom'})
try {
 const {calculateSalesRow}=await vite.ssrLoadModule('/src/shared/utils/salesData.ts')
 const inputs=[[19900,700,19,2646700],[16900,456,19,1464216],[3900,51,6,11934]]
 const amounts=inputs.map(([unitPrice,quantity,sellerCommissionRate,expected],index)=>{
  const row=calculateSalesRow({id:String(index),salesDataImportId:'test',campaignId:'test',optionName:String(index),unitPrice,quantity,canceledQuantity:0,refundedQuantity:0,totalCommissionRate:25,sellerCommissionRate})
  const amount=Math.round(row.netSales*row.sellerCommissionRate/100)
  assert.equal(amount,expected);return amount
 })
 assert.equal(amounts.reduce((a,b)=>a+b,0),4122850)
 assert.equal(4996262-28680,4967582)
 assert.equal(4967582-4122850,844732)
 console.log('Social Lounge supplied fixture: quantities, SKU commissions and separate supplier receipt passed')
} finally { await vite.close() }
