import assert from 'node:assert/strict'
import { createServer } from 'vite'
const values = new Map()
globalThis.localStorage = { getItem: key => values.get(key) ?? null, setItem: (key,value) => values.set(key,value) }
const vite = await createServer({ envDir: false, server: { middlewareMode: true, hmr: false }, appType: 'custom' })
try {
 const { planPaymentBatchApproval, approvePlannedRequests } = await vite.ssrLoadModule('/src/shared/utils/paymentBatchApproval.ts')
 const { previewPaymentBatchApproval, approvePaymentBatch } = await vite.ssrLoadModule('/src/shared/services/paymentBatchApprovalService.ts')
 const { getSalesDisplayPeriod } = await vite.ssrLoadModule('/src/shared/utils/salesDisplayPeriod.ts')
 const { STORAGE_KEYS: K } = await vite.ssrLoadModule('/src/shared/services/storageService.ts')
 const good = { id:'good', status:'approval_pending', finalPaymentAmount:520400, accountNumberSnapshot:'account', settlementId:'stable', campaignId:'stable-campaign' }
 const bad = { ...good, id:'bad' }
 const paid = { ...good, id:'paid', status:'payment_completed' }
 const issues = r => r.id==='bad' ? ['계좌정보 변경','증빙 확인 필요'] : ['대표 승인 필요']
 const original = [good,bad,paid], json = JSON.stringify(original)
 const plan = planPaymentBatchApproval(['good','good','bad','paid','missing'],original,issues)
 assert.equal(plan.ready.length,1); assert.equal(plan.total,520400); assert.equal(plan.rows.length,4)
 assert.equal(plan.rows.find(r=>r.id==='bad').reasons.length,2)
 assert.throws(()=>planPaymentBatchApproval([],original,issues))
 assert.throws(()=>planPaymentBatchApproval(Array.from({length:101},(_,i)=>''+i),original,issues))
 assert.equal(planPaymentBatchApproval(['good'],[good,good],issues).ready.length,0)
 const approved = approvePlannedRequests(original,['good'],'허윤정','now')
 assert.equal(approved[0].status,'approved'); assert.equal(approved[0].finalPaymentAmount,520400)
 assert.deepEqual(approved[1],bad); assert.deepEqual(approved[2],paid); assert.equal(JSON.stringify(original),json)
 assert.deepEqual(approvePlannedRequests(approved,['good'],'another','later'),approved)
 let role='ceo', conflict=false, writes=0
 let rows = [K.paymentRequests,K.settlements,K.campaigns].map(key=>({storage_key:key,payload:key===K.paymentRequests?original:[],revision:1,updated_at:'before',deleted:false}))
 const snapshots = [{id:'snapshot', amount:123}], snapshotJson=JSON.stringify(snapshots)
 const client = { auth:{async getUser(){return {data:{user:{id:'user'}},error:null}}}, from(table){let patch; return {
 select(){return this}, eq(){return this}, in(){return this}, update(value){patch=value;return this},
 async maybeSingle(){if(table==='profiles')return {data:{role,display_name:'허윤정',active:true,approval_status:'approved'},error:null};
 if(conflict)return {data:null,error:null}; assert.deepEqual(Object.keys(patch),['payload']); writes++; const row=rows[0]; row.payload=patch.payload; row.revision++; row.updated_at='after'; return {data:{payload:row.payload,updated_at:row.updated_at},error:null}},
 then(resolve,reject){return Promise.resolve({data:structuredClone(rows),error:null}).then(resolve,reject)}
 }} }
 const refresh=async()=>{}
 role='manager'; await assert.rejects(()=>previewPaymentBatchApproval(['good'],issues,client,refresh),/대표·관리자/); assert.equal(writes,0)
 role='ceo'; let preview=await previewPaymentBatchApproval(['good','bad'],issues,client,refresh)
 rows[1].revision++; await assert.rejects(()=>approvePaymentBatch(preview,issues,client,refresh),/변경/); assert.equal(writes,0)
 preview=await previewPaymentBatchApproval(['good','bad'],issues,client,refresh); conflict=true
 await assert.rejects(()=>approvePaymentBatch(preview,issues,client,refresh),/다른 사용자/); assert.equal(writes,0)
 conflict=false; const result=await approvePaymentBatch(preview,issues,client,refresh)
 assert.equal(result.approved,1); assert.equal(result.skipped.length,1); assert.equal(writes,1)
 await assert.rejects(()=>approvePaymentBatch(preview,issues,client,refresh),/변경/); assert.equal(writes,1)
 assert.equal(JSON.stringify(snapshots),snapshotJson)
 const waiting={id:'sales-notion-89947961-73b4-459d-84c2-ef0cb53ca956',campaignId:'notion-89947961-73b4-459d-84c2-ef0cb53ca956',reviewStatus:'업로드 대기',settlementStatus:'정산 전',totalQuantity:0,totalSalesAmount:0,fileName:'',fileSize:0,uploadedAt:'',salesStartDate:'2026-08-31',salesEndDate:'2026-09-04'}
 const campaign={id:waiting.campaignId,startDate:'2026-10-05',endDate:'2026-10-08'}
 const before=JSON.stringify(waiting)
 assert.deepEqual(getSalesDisplayPeriod(waiting,campaign),{startDate:'2026-10-05',endDate:'2026-10-08'})
 for(const change of [{fileName:'source.xlsx'},{uploadedAt:'now'},{fileAnalysis:{}},{manualSettlement:{}},{manualCompletion:{}},{totalSalesAmount:100},{totalQuantity:1},{reviewStatus:'검수 완료'},{settlementStatus:'정산 완료'}]) assert.deepEqual(getSalesDisplayPeriod({...waiting,...change},campaign),{startDate:'2026-08-31',endDate:'2026-09-04'})
 assert.equal(JSON.stringify(waiting),before)
 assert.deepEqual(getSalesDisplayPeriod(waiting),{startDate:'2026-08-31',endDate:'2026-09-04'})
 console.log('PASS batch approval: permission, exclusions, duplicate IDs, concurrent revisions, CAS failure, repeated confirmation, amount/account preservation; latest waiting period; uploaded/manual/settled source dates preserved')
} finally {await vite.close()}
