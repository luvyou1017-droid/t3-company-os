import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import ts from 'typescript'
import {createServer} from 'vite'
const vite=await createServer({envDir:false,server:{middlewareMode:true,hmr:false},appType:'custom'})
try{
 const {nextMonday,notionWindow,driveWindow,summarizeChanges}=await vite.ssrLoadModule('/src/features/automaticSync/model.ts')
 assert.equal(nextMonday(new Date('2026-09-20T23:59:00Z')),'2026-09-21T00:00:00.000Z')
 assert.equal(nextMonday(new Date('2026-09-21T00:00:00Z')),'2026-09-28T00:00:00.000Z')
 assert.equal(nextMonday(new Date('2026-09-26T01:00:00Z')),'2026-09-28T00:00:00.000Z')
 const from='2026-09-14T00:00:00Z',until='2026-09-21T00:00:00Z'
 assert.equal(notionWindow(from,until).and[0].last_edited_time.after,from)
 assert.equal(notionWindow(undefined,until).and.length,1)
 const query=driveWindow('folder-known',from,until)
 assert.match(query,/modifiedTime > '2026-09-14/);assert.match(query,/modifiedTime <= '2026-09-21/);assert.match(query,/'folder-known' in parents/)
 const counts=summarizeChanges([{state:'신규',entity:'상품'},{state:'신규',entity:'SKU'},{state:'조건변경',entity:'SKU'},{state:'확인필요',entity:'SKU'},{state:'기존',entity:'일정'}],3)
 assert.equal(counts.newProducts,1);assert.equal(counts.newSkus,1);assert.equal(counts.terms,1);assert.equal(counts.review,1);assert.equal(counts.unchanged,1)
 const edge=await readFile('supabase/functions/automatic-sync/index.ts','utf8')
 const compiled=ts.transpileModule(edge,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext},reportDiagnostics:true})
 assert.equal(compiled.diagnostics?.filter(d=>d.category===ts.DiagnosticCategory.Error).length??0,0)
 assert.match(edge,/admin.auth.getUser/);assert.match(edge,/\['ceo','admin'\]/)
 assert.doesNotMatch(edge,/from\('(?:products|campaigns|settlements)'\)\.(?:update|upsert|delete|insert)/)
 const sql=await readFile('docs/AUTOMATIC_SYNC.sql','utf8')
 assert.match(sql,/cursor=case when p_error is null then p_cursor else cursor end/)
 assert.match(sql,/for update/);assert.match(sql,/lock_until>now\(\)/)
 assert.match(sql,/revoke all on function/);assert.match(sql,/to service_role/)
 assert.doesNotMatch(sql,/(delete from|truncate|drop table)\s+public\.(products|campaigns|settlements)/i)
 console.log('PASS Monday KST boundary; incremental lower/upper bounds; candidate counts; Edge syntax; admin auth guard; lock/cursor failure guards; no master/Snapshot writes')
 console.log('LIMIT: no production cron/RLS/Notion/Drive runtime execution verified')
}finally{await vite.close()}
