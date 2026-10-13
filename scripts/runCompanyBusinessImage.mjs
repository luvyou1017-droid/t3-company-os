import assert from 'node:assert/strict'
import {createServer} from 'vite'
const v=await createServer({envDir:false,server:{middlewareMode:true,hmr:false},appType:'custom'})
try {
const {decodeCompanyBusinessImage,copyCompanyBusinessImage}=await v.ssrLoadModule('/src/shared/services/companyBusinessImageService.ts')
const bytes=Uint8Array.from([137,80,78,71,13,10,26,10])
const blob=decodeCompanyBusinessImage({mime_type:'image/png',image_base64:Buffer.from(bytes).toString('base64'),byte_size:bytes.length})
assert.equal(blob.type,'image/png');assert.deepEqual(new Uint8Array(await blob.arrayBuffer()),bytes)
assert.throws(()=>decodeCompanyBusinessImage({mime_type:'image/jpeg',image_base64:'',byte_size:0}));assert.throws(()=>decodeCompanyBusinessImage({mime_type:'image/png',image_base64:'AA==',byte_size:2}))
let resolve;const png=new Promise(r=>{resolve=r});let written=false
Object.defineProperty(globalThis,'navigator',{configurable:true,value:{clipboard:{write:async items=>{written=true;assert(items[0].values['image/png']===png);assert.equal((await items[0].values['image/png']).type,'image/png')}}}})
globalThis.window={isSecureContext:true};globalThis.ClipboardItem=class{constructor(values){this.values=values}}
const operation=copyCompanyBusinessImage(()=>png);assert(written,'clipboard starts during click, before image loads');resolve(blob);await operation
navigator.clipboard.write=async()=>{throw Error('permission denied')};await assert.rejects(()=>copyCompanyBusinessImage(()=>Promise.resolve(blob)),/permission denied/)
window.isSecureContext=false;assert.throws(()=>copyCompanyBusinessImage(()=>Promise.resolve(blob)),/미지원/)
console.log('PASS original PNG bytes/type, size validation, promise-based clipboard gesture, permission failure and unsupported browser')
}finally{await v.close()}
