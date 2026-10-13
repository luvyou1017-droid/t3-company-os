import assert from 'node:assert/strict'
import {createServer} from 'vite'
const v=await createServer({envDir:false,server:{middlewareMode:true,hmr:false},appType:'custom'})
try {
const {skuConditionLabel,skuConditionProductLabel,groupSkuConditions}=await v.ssrLoadModule('/src/pages/sales-data/skuConditionLabel.ts')
const one={productId:'p1',skuId:'sku1',productName:'[정리함] 화이트',skuOptionName:'화이트',optionName:'화이트',supplyLabel:'셀러공급',sellerCommissionRate:17,groupBuyPrice:10000}
const two={...one,productId:'p2',skuId:'sku2',productName:'[그라인더] 화이트',detailOption:'2종 세트'}
const products=[{id:'p1',brandName:'아우라',productName:'장난감 정리함'},{id:'p2',brandName:'매직쉐프',productName:'그라인더'}]
const original=JSON.stringify([one,two]);const a=skuConditionLabel(one,products),b=skuConditionLabel(two,products)
assert(a.includes('아우라 · 장난감 정리함'));assert(b.includes('매직쉐프 · 그라인더'));assert(b.includes('2종 세트'));assert.notEqual(a,b);assert(a.includes('17%'))
assert.equal(skuConditionProductLabel(one,[]),'정리함')
const groups=groupSkuConditions([one,two,{...one,skuId:'sku3',skuOptionName:'블랙'}]);assert.equal(groups.length,2);assert.deepEqual(groups[0].conditions.map(x=>x.skuId),['sku1','sku3']);assert.equal(groups[1].conditions[0],two);assert.equal(JSON.stringify([one,two]),original)
console.log('PASS product/brand identity for identical SKU names, per-product groups, detail option, saved-name fallback and original IDs/rates/prices preserved')
}finally{await v.close()}
