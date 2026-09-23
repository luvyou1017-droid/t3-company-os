import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createServer } from 'vite'
const memory = new Map()
globalThis.localStorage = {getItem:k=>memory.get(k)??null,setItem:(k,v)=>memory.set(k,v)}
const server = await createServer({envDir:false,server:{middlewareMode:true,hmr:false},appType:'custom'})
try {
  const {persistManagerAccount,mergeManagerAccount}=await server.ssrLoadModule('/src/shared/services/managerAccountService.ts')
  const profiles=[{id:'a',name:'테스트A',businessType:'freelancer',realName:'보존',businessName:'보존',taxRegistrationNumber:'test-only',bankName:'전 은행',accountNumber:'1',accountHolder:'A'},{id:'b',name:'테스트B',bankName:'다른 은행',accountNumber:'2',extra:'보존'}]
  let state={payload:structuredClone(profiles),updated_at:'1',deleted:false}, writes=0,reads=0,conflict=true
  const client={from(table){assert.equal(table,'workspace_state');const filters={};let patch;return{
    select(){return this},eq(k,v){filters[k]=v;return this},update(p){patch=p;return this},
    async single(){reads++;return{data:structuredClone(state),error:null}},
    async maybeSingle(){writes++;assert.equal(filters.workspace_id,'wisevendor');assert.equal(filters.storage_key,'t3_company_os_manager_masters')
      if(conflict){conflict=false;state.updated_at='2';state.payload[1].extra='동시 수정 보존';return{data:null,error:null}}
      assert.equal(filters.updated_at,state.updated_at);state={...state,payload:patch.payload,updated_at:'3'};return{data:{payload:structuredClone(state.payload)},error:null}}
  }}}
  assert.equal(reads,0);assert.equal(writes,0)
  const saved=await persistManagerAccount('a',{bankName:' 새 은행 ',accountNumber:'123–456',accountHolder:' 테스트A '},client)
  assert.equal(saved[0].bankName,'새 은행');assert.equal(saved[0].accountNumber,'123-456');assert.equal(saved[0].realName,'보존');assert.equal(saved[0].taxRegistrationNumber,'test-only')
  assert.equal(saved[1].extra,'동시 수정 보존');assert.equal(saved[1].accountNumber,'2');assert.equal(writes,2);assert.equal(reads,2)
  const partial=mergeManagerAccount(saved,'a',{bankName:'은행만 변경'})
  assert.equal(partial[0].accountNumber,saved[0].accountNumber)
  assert.equal(partial[0].accountHolder,saved[0].accountHolder)
  assert.equal(partial[0].businessName,saved[0].businessName)
  assert.throws(()=>mergeManagerAccount(profiles,'missing',{bankName:'x',accountNumber:'1',accountHolder:'x'}))
  const before=JSON.stringify(state);await assert.rejects(persistManagerAccount('a',{bankName:'',accountNumber:'1',accountHolder:'x'},client));assert.equal(JSON.stringify(state),before)
  const failed={from(){return{select(){return this},eq(){return this},async single(){return{data:null,error:new Error('denied')}}}}}
  await assert.rejects(persistManagerAccount('a',{bankName:'x',accountNumber:'1',accountHolder:'x'},failed),/denied/)
  console.log('PASS account field merge, other profile preservation, conflict retry, validation and server failure')
  const {calculateSettlement}=await server.ssrLoadModule('/src/shared/utils/settlement.ts')
  const source={totalCommissionRate:29.3715,sellerCommissionRate:14.6858,commissionCalculationType:'campaign_total'}
  const rows=[{netSales:1000000,totalCommissionRate:29.3715,sellerCommissionRate:14.6858}]
  const cost={amount:30155,reflected:true,type:'event',applyLocation:'net_company_commission'}
  const payment={amount:3000,reflected:true,direction:'payment',type:'event',applyLocation:'company_payment'}
  const base=calculateSettlement(source,rows,[cost],'tax_invoice'),withPayment=calculateSettlement(source,rows,[cost,payment],'tax_invoice')
  assert.equal(base.distributableVendorCommission,116702);assert.equal(withPayment.distributableVendorCommission,119702);assert.equal(withPayment.managerBaseShareAmount,59851)
  assert.equal(calculateSettlement(source,rows,[cost],'tax_invoice').distributableVendorCommission,116702)
  const page=await readFile('src/pages/settlement/SettlementPage.tsx','utf8')
  assert.doesNotMatch(page,/<th>− 차감내역<\/th>/)
  const {SettlementPaymentRow}=await server.ssrLoadModule('/src/pages/settlement/components/SettlementAdjustmentRows.tsx')
  const {createElement}=await import('react')
  const {renderToStaticMarkup}=await import('react-dom/server')
  assert.equal(renderToStaticMarkup(createElement(SettlementPaymentRow,{amount:0})),'')
  assert.equal(renderToStaticMarkup(createElement(SettlementPaymentRow,{})),'')
  const markup=renderToStaticMarkup(createElement(SettlementPaymentRow,{amount:3000}))
  assert.match(markup,/settlement-payment-credit/);assert.match(markup,/3,000/);assert.match(markup,/\+ 지급내역/)
  const css=await readFile('src/pages/settlement/settlement-adjustments.css','utf8')
  assert.match(css,/#15803d/)

  console.log('PASS 293715 - 146858 - 30155 + 3000 = 119702; manager 59851; removal116702; summary guards')
} finally {await server.close()}
