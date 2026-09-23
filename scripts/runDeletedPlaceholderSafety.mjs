import assert from 'node:assert/strict'
import {createServer} from 'vite'
const memory=new Map();globalThis.localStorage={getItem:key=>memory.get(key)??null,setItem:(key,value)=>memory.set(key,value)}
const server=await createServer({envDir:false,server:{middlewareMode:true,hmr:false},appType:'custom'})
try{
 const {salesDataService:s}=await server.ssrLoadModule('/src/shared/services/salesDataService.ts')
 const {campaignService:c}=await server.ssrLoadModule('/src/shared/services/campaignService.ts')
 const {STORAGE_KEYS:k}=await server.ssrLoadModule('/src/shared/services/storageService.ts')
 const campaign={id:'c',deletedAt:'2026-09-21'}
 const placeholder={id:'p',campaignId:'c',reviewStatus:'업로드 대기',settlementStatus:'정산 전',totalQuantity:0,totalSalesAmount:0}
 c.saveCampaigns([campaign]);s.saveImports([placeholder]);s.saveRows([])
 assert.equal(s.isHiddenDeletedPlaceholder(placeholder),true)
 s.syncCampaigns([campaign]);assert.deepEqual(s.getSalesDataImports(),[placeholder])
 c.saveCampaigns([{...campaign,deletedAt:undefined}]);s.syncCampaigns(c.getCampaigns());assert.equal(s.isHiddenDeletedPlaceholder(placeholder),false);assert.equal(s.getSalesDataImports()[0].id,'p')
 c.saveCampaigns([campaign]);for(const patch of [{fileName:'uploaded.xlsx'},{totalQuantity:1},{totalSalesAmount:1},{fileAnalysis:{}},{manualSettlement:{}}])assert.equal(s.isHiddenDeletedPlaceholder({...placeholder,...patch}),false)
 s.saveRows([{salesDataImportId:'p'}]);assert.equal(s.isHiddenDeletedPlaceholder(placeholder),false);s.saveRows([])
 localStorage.setItem(k.settlements,JSON.stringify([{id:'historical',campaignId:'c',calculationSnapshot:{amount:100}}]));const before=localStorage.getItem(k.settlements)
 assert.equal(s.isHiddenDeletedPlaceholder(placeholder),false);s.syncCampaigns([]);assert.equal(localStorage.getItem(k.settlements),before);assert.equal(s.getSalesDataImports()[0].id,'p')
 console.log('PASS deleted empty placeholder hidden, same ID restored, uploaded files/rows/amounts/settlements preserved, missing campaign not destructive; isolated storage only')
}finally{await server.close()}
