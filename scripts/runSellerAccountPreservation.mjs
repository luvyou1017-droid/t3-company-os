import assert from 'node:assert/strict'
import {createServer} from 'vite'
const memory=new Map();globalThis.localStorage={getItem:key=>memory.get(key)??null,setItem:(key,value)=>memory.set(key,value)}
const server=await createServer({envDir:false,server:{middlewareMode:true,hmr:false},appType:'custom'})
try{
 const {sellerMasterService:s}=await server.ssrLoadModule('/src/shared/services/sellerMasterService.ts')
 const original={id:'seller-test',name:'테스트',contact:'01012345678',shippingAddress:'기존 주소',notionPageId:'existing-page',defaultMdId:'m',defaultManagerId:'m',bankName:'기존은행',accountNumber:'original',accountHolder:'본점',businesses:[{id:'one',isPrimary:true,certificatePath:'keep',bankName:'기존은행',accountNumber:'original',accountHolder:'본점'},{id:'two',isPrimary:false,certificatePath:'keep2',accountNumber:'second'}]}
 await s.saveSellerProfile(original)
 await s.saveSellerProfile({id:original.id,name:original.name,defaultMdId:'m',defaultManagerId:'m',realName:'실명'})
 assert.equal(s.getSellerById(original.id).contact,original.contact)
 await s.saveBusinessAccount(original.id,'two',{bankName:'새은행',accountNumber:'000-222',accountHolder:'지점'})
 const current=s.getSellerById(original.id)
 assert.deepEqual(current.businesses[0],original.businesses[0])
 assert.equal(current.accountNumber,'original');assert.equal(current.businesses[1].certificatePath,'keep2')
 assert.equal(current.businesses[1].accountNumber,'000-222');assert.equal(current.shippingAddress,original.shippingAddress)
 assert.equal(current.notionPageId,original.notionPageId)
 assert.equal(s.getSettlementProfile(original.id,'two').accountNumber,'000-222')
 assert.equal(s.getSettlementProfile(original.id,'missing').accountNumber,undefined)
 await assert.rejects(()=>s.saveBusinessAccount(original.id,'missing',{bankName:'x',accountNumber:'x',accountHolder:'x'}))
 console.log('PASS partial profile preservation; only selected business account changed; primary/contact/address/Notion/certificate preserved; missing business rejected. Isolated local storage, not production.')
}finally{await server.close()}
