import assert from 'node:assert/strict'
import * as XLSX from 'xlsx'
import { createServer } from 'vite'
const server = await createServer({envDir:false,server:{middlewareMode:true,hmr:false},appType:'custom'})
try {
 const {matchFlavorPack,parseFlavorPack}=await server.ssrLoadModule('/src/shared/utils/flavorPackMatching.ts')
 const {parseSalesDataFile}=await server.ssrLoadModule('/src/shared/utils/salesDataFileParser.ts')
 const {captureUploadTerms,applyReviewedUpload,getUploadConditions}=await server.ssrLoadModule('/src/shared/utils/uploadSettlementConditions.ts')
 const {productSkuMatchScore}=await server.ssrLoadModule('/src/shared/utils/productSkuMatching.ts')
 const labels=['딩동쭈꾸미 1개','딩동쭈꾸미 3개','딩동쭈꾸미 5개','닭갈비 1개','닭갈비 3개']
 // Synthetic prices and IDs: only the provided SKU structure/options are real-case inputs.
 const candidates=labels.map((optionName,i)=>({skuId:`existing-${i}`,productId:'product',productName:'딩동쭈꾸미',optionName,groupBuyPrice:(i+1)*10000,sellerSupplyPrice:(i+1)*7000,totalCommissionRate:30,sellerCommissionRate:20,exactMatchOnly:true}))
 const before=JSON.stringify(candidates)
 const options=['매운맛5개','매운맛2개+순한맛3개','순한맛5개','매운맛1개','매운맛1개+순한맛2개']
 const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet([['상품명','옵션명','수량','주문상태'],...options.map(option=>['딩동쭈꾸미',option,1,'배송완료'])]),'주문')
 const file=new File([XLSX.write(wb,{bookType:'xlsx',type:'array'})],'test-orders.xlsx')
 const parsed=await parseSalesDataFile(file,{id:'import',campaignId:'campaign'},candidates)
 assert.equal(parsed.rows.length,5)
 assert.deepEqual(parsed.rows.map(r=>r.skuId),['existing-2','existing-2','existing-2','existing-0','existing-1'])
 assert.deepEqual(parsed.rows.slice(0,3).map(r=>r.detailOption),['매운맛','매운맛 2개 + 순한맛 3개','순한맛'])
 assert.deepEqual(parsed.rows.map(r=>r.optionName),options)
 assert(parsed.rows.every(r=>r.quantity===1&&r.sellerCommissionRate===20))
 assert.equal(parsed.rows[0].unitPrice,30000)
 const reviewed=applyReviewedUpload(parsed,parsed.rowsIncludingPending)
 const terms=captureUploadTerms('supplier_link',reviewed.rows)
 assert.equal(terms.skuConditions[1].detailOption,'매운맛 2개 + 순한맛 3개')
 assert.equal(terms.skuConditions[1].sellerSupplyPrice,21000)
 const catalog=[{id:'product',productName:'딩동쭈꾸미',skus:candidates.map(c=>({...c,id:c.skuId,active:true}))}]
 const restored=getUploadConditions(catalog,{id:'campaign',productId:'product'},{settlementTerms:terms})
 const reparsed=await parseSalesDataFile(file,{id:'import',campaignId:'campaign'},restored.candidates)
 assert.deepEqual(reparsed.rows.map(r=>r.detailOption),parsed.rows.map(r=>r.detailOption))
 assert.deepEqual(reparsed.rows.map(r=>r.skuId),parsed.rows.map(r=>r.skuId))
 assert.equal(JSON.stringify(candidates),before)
 for(const raw of options){const scored=candidates.map(sku=>productSkuMatchScore({optionName:raw,unitPrice:0},{productName:'딩동쭈꾸미'},sku,false));assert.equal(scored.filter(s=>s>=80).length,1)}
 assert.equal(matchFlavorPack('매운맛5개','닭갈비 3개'),undefined)
 assert.equal(matchFlavorPack('매운맛5개','딩동쭈꾸미 3개'),undefined)
 assert.equal(matchFlavorPack('매운맛15개','딩동쭈꾸미 5개'),undefined)
 assert.equal(parseFlavorPack('매운맛2개+알수없는구성3개'),undefined)
 assert.equal(matchFlavorPack('매운맛5개','5개','','딩동쭈꾸미').count,5)
 assert.equal(matchFlavorPack('닭갈비 매운맛1개','닭갈비 1개').count,1)
 const legacy = { ...terms.skuConditions[0], productName:'쭈꾸미 5개', optionName:'매운맛5개', skuOptionName:undefined, sellerCommissionRate:17 }
 const oldSource = {settlementTerms:{...terms,skuConditions:[legacy]}}
 const oldBefore = JSON.stringify(oldSource)
 const master = [{id:'product',productName:'딩동쭈꾸미',skus:[{id:legacy.skuId,optionName:'쭈꾸미 5개',active:true,groupBuyPrice:99999,sellerCommissionRate:99}]}]
 const choices=getUploadConditions(master,undefined,oldSource)
 assert.equal(choices.all[0].optionName,'쭈꾸미 5개')
 assert.equal(choices.all[0].skuOptionName,'쭈꾸미 5개')
 assert.equal(choices.all[0].sellerCommissionRate,17)
 assert.equal(choices.all[0].groupBuyPrice,legacy.groupBuyPrice)
 assert.equal(choices.candidates[0].optionName,legacy.salesOptionName)
 assert.equal(JSON.stringify(oldSource),oldBefore)
 const duplicate=[...candidates,{...candidates[2],skuId:'ambiguous'}]
 await assert.rejects(()=>parseSalesDataFile(file,{id:'import',campaignId:'campaign'},duplicate),/연결하지 못했습니다/)
 console.log('PASS: XLSX → existing pack SKU → separate flavour rows → settlement terms; prices/IDs unchanged; no quantity multiplication; ambiguous SKU blocked. Provided-case reconstruction, not a live settlement test.')
}finally{await server.close()}
