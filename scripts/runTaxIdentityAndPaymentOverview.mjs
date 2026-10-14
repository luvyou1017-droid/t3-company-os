import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import * as XLSX from 'xlsx'
import { createServer } from 'vite'
const vite=await createServer({envDir:false,server:{middlewareMode:true,hmr:false},appType:'custom'})
try {
 const {taxIdentityExportRows}=await vite.ssrLoadModule('/src/shared/utils/taxIdentityExport.ts')
 const {settlementPaymentOverview}=await vite.ssrLoadModule('/src/shared/utils/settlementPaymentOverview.ts')
 const row={id:'tax',ownerId:'seller',ownerType:'seller',paymentRequestId:'request',month:'2026-10',name:'닉네임',owner:'셀러',gross:100,base:100,incomeTax:3,localTax:0,net:97,paidAt:'2026-10-01',reportStatus:'ready',paymentStatus:'payment_completed'}
 // Explicitly invalid synthetic identifier, never a real person's number.
 const identity={ownerId:'seller',ownerType:'seller',requestId:'request',realName:'테스트 실명',number:'0'.repeat(13)}
 const before=JSON.stringify(row)
 const exported=taxIdentityExportRows([row],[identity])
 assert.equal(exported[0].이름,'테스트 실명');assert.equal(exported[0].실지급액,97)
 const book=XLSX.utils.book_new();XLSX.utils.book_append_sheet(book,XLSX.utils.json_to_sheet(exported),'원천세');const restored=XLSX.read(XLSX.write(book,{type:'buffer',bookType:'xlsx'}),{type:'buffer'})
 assert.equal(XLSX.utils.sheet_to_json(restored.Sheets['원천세'])[0].주민등록번호,exported[0].주민등록번호)
 for(const identities of [[],[identity,identity],[{...identity,ownerId:'other'}],[{...identity,requestId:'other'}],[{...identity,realName:''}],[{...identity,number:'short'}]])assert.throws(()=>taxIdentityExportRows([row],identities))
 assert.equal(JSON.stringify(row),before);assert(!JSON.stringify(row).includes(identity.number))
 const settlement={id:'s1',campaignId:'c1',status:'partially_paid',sellerPaymentCompleted:false,managerPaymentCompleted:false,currentCalculation:{finalSellerPaymentAmount:1000,finalPaymentAmount:500}}
 const campaigns=new Map([['c1',{id:'c1',managerId:'external',managerName:'외부 매니저'}]])
 const paid={id:'p1',settlementId:'s1',recipientType:'seller',status:'payment_completed',finalPaymentAmount:1000}
 const pending={id:'p2',settlementId:'s1',recipientType:'manager',status:'approval_pending',finalPaymentAmount:450,evidenceType:'tax_invoice',documentCheckStatus:'confirmed'}
 const outcome=settlementPaymentOverview([settlement],[paid,pending],campaigns)
 assert.equal(outcome.sellerDue,0);assert.equal(outcome.managerDue,450);assert.equal(outcome.approvalPending,1);assert.equal(outcome.unrequested.length,0);assert.equal(outcome.evidenceMissing,0)
 const unrequested=settlementPaymentOverview([settlement],[paid,{...pending,status:'rejected'}],campaigns)
 assert.equal(unrequested.unrequested.length,1);assert.equal(unrequested.unrequested[0].ownerType,'manager');assert.equal(unrequested.rejected,1);assert.equal(unrequested.unrequestedAmount,500)
 assert.equal(settlementPaymentOverview([{...settlement,managerPaymentCompleted:true}],[paid],campaigns).managerDue,0)
 assert.equal(settlementPaymentOverview([{...settlement,status:'completed'}],[],campaigns).unrequested.length,0)
 assert.equal(settlementPaymentOverview([{...settlement,status:'canceled'}],[],campaigns).sellerDue,0)
 assert.equal(settlementPaymentOverview([settlement],[paid,{...paid,status:'approved'}],campaigns).sellerDue,0)
 assert.equal(settlementPaymentOverview([settlement],[paid,{...pending,documentCheckStatus:'follow_up'}],campaigns).evidenceMissing,1)
 const sellerLink=settlementPaymentOverview([{...settlement,salesDataImportId:'link'}],[],new Map([['c1',{...campaigns.get('c1'),salesChannelType:'seller_checkout'}]]),new Map([['link',{id:'link',salesChannelType:'seller_checkout'}]]))
 assert.equal(sellerLink.unrequested.some(item=>item.ownerType==='seller'),false,'company receivable must not appear as seller payout')
 const sql=readFileSync('docs/SECURE_TAXPAYER_IDENTITY.sql','utf8')
 assert.match(sql,/vault\.create_secret/);assert.match(sql,/security invoker/);assert.match(sql,/Tax identity permission denied/)
 assert.match(sql,/enable row level security/);assert.match(sql,/Identity changed/);assert.match(sql,/export blocked/)
 assert.doesNotMatch(sql,/update\s+public\.(workspace_state|sellers|campaigns|settlements)/i)
 const ui=readFileSync('src/pages/settlement/components/AccountingManagement.tsx','utf8')
 assert(!/localStorage|sessionStorage/.test(ui));assert.match(ui,/identityMissing/)
 console.log('PASS recipient-ID-only identity export, missing/ambiguous identity blocking, legal name, leading zeros in XLSX, financial source unchanged; completed payouts excluded, partial payment, rejected resubmission, request evidence counts and duplicate-ID protection')
}finally{await vite.close()}
