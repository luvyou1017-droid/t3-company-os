import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import XLSX from 'xlsx'
import {accountingRows,accountingExportRows,remainingShareSeconds,ACCOUNTING_LINK_SECONDS} from '../src/shared/utils/accountingRows.ts'
import {runWithholdingAssertions} from '../src/shared/utils/withholdingTax.ts'
let count=0
function check(name,run){run();count++;console.log('PASS',name)}
const item={id:'tax1',settlementId:'set1',paymentRequestId:'pay1',ownerId:'seller1',ownerName:'테스트 셀러',ownerType:'seller',paymentMonth:'2026-09',incomeTaxAmount:14530,localIncomeTaxAmount:1450,status:'ready'}
const request={id:'pay1',settlementId:'set1',recipientId:'seller1',businessType:'freelancer',grossSettlementAmount:533120,finalPaymentAmount:468675,status:'approval_pending'}
check('existing tax assertions unchanged',()=>assert.equal(runWithholdingAssertions().passed,true))
check('freelancer request included',()=>assert.equal(accountingRows([item],[request]).length,1))
check('unrequested tax item excluded',()=>assert.equal(accountingRows([item],[]).length,0))
check('canceled request excluded',()=>assert.equal(accountingRows([item],[{...request,status:'canceled'}]).length,0))
check('other recipient not joined',()=>assert.equal(accountingRows([item],[{...request,recipientId:'other'}]).length,0))
check('other settlement not joined',()=>assert.equal(accountingRows([item],[{...request,settlementId:'other'}]).length,0))
check('actual paid snapshot preferred',()=>assert.equal(accountingRows([item],[{...request,actualPaidAmount:468670}])[0].net,468670))
check('manager reimbursement preserved from request',()=>assert.equal(accountingRows([{...item,ownerType:'manager'}],[{...request,finalPaymentAmount:500000}])[0].net,500000))
check('month kept distinct from actual payment date',()=>assert.equal(accountingRows([item],[{...request,completedAt:'2026-10-01T01:00:00Z'}])[0].month,'2026-09'))
check('XLSX same values as displayed rows',()=>{
 const rows=accountingExportRows(accountingRows([item],[request]));const book=XLSX.utils.book_new();XLSX.utils.book_append_sheet(book,XLSX.utils.json_to_sheet(rows),'원천세')
 const bytes=XLSX.write(book,{type:'buffer',bookType:'xlsx'});const decoded=XLSX.read(bytes,{type:'buffer'});assert.deepEqual(XLSX.utils.sheet_to_json(decoded.Sheets['원천세']),rows)
})
check('source and historical snapshot untouched',()=>{const before=JSON.stringify({item,request});accountingExportRows(accountingRows([item],[request]));assert.equal(JSON.stringify({item,request}),before)})
check('14 days exact duration',()=>assert.equal(ACCOUNTING_LINK_SECONDS,1209600))
check('active immediately before expiry',()=>assert.equal(remainingShareSeconds('2026-10-04T00:00:00Z',Date.parse('2026-10-03T23:59:59Z')),1))
check('expired at boundary',()=>assert.equal(remainingShareSeconds('2026-10-04T00:00:00Z',Date.parse('2026-10-04T00:00:00Z')),0))
check('expired remains expired',()=>assert.equal(remainingShareSeconds('2026-10-04T00:00:00Z',Date.parse('2026-10-05T00:00:00Z')),0))
const sql=readFileSync('docs/ACCOUNTING_WORKFLOW_6.sql','utf8')
check('new tables RLS enabled',()=>assert.equal((sql.match(/enable row level security/g)||[]).length,2))
check('no direct close writes granted',()=>assert.match(sql,/grant select on public.accounting_month_closes to authenticated/))
check('reopen requires administrator',()=>assert.match(sql,/p_action='reopen' and actor_role in \('ceo','admin'\)/))
check('close optimistic conflict guard',()=>assert.match(sql,/updated_at is distinct from p_expected/))
check('existing snapshots/tables not mutated by migration',()=>assert.doesNotMatch(sql,/update\s+(public\.)?(settlements|campaigns|workspace_state|payment_requests)\b/i))
check('private bucket verified server-side',()=>assert.match(sql,/id='seller-documents' and public=false/))
check('anonymous cannot execute accounting functions',()=>assert.equal((sql.match(/from public,anon/g)||[]).length,3))
check('single completion records actual paid amount',()=>assert.match(readFileSync('src/shared/services/paymentRequestService.ts','utf8'),/actualPaidAmount: current.finalPaymentAmount/))
console.log(`${count} local checks passed. SQL execution, RLS sessions and live signed URL expiry NOT verified.`)
