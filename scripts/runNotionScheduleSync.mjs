import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import assert from 'node:assert/strict'
import ts from 'typescript'

const input = readFileSync(new URL('../supabase/functions/automatic-sync/index.ts', import.meta.url), 'utf8').replace(/^import .*\n/, '')
const source = ts.transpileModule(input, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } }).outputText
const existing = [
  { id: 'schedule-1', notionImportMetadata: { sourceId: 'old-1' }, campaignName: '일정 A', sellerId: 'seller-1', sellerName: '셀러 A', startDate: '2026-08-02', endDate: '2026-08-05' },
  { id: 'schedule-2', notionImportMetadata: { sourceId: 'old-2' }, campaignName: '일정 B', sellerId: 'seller-1', sellerName: '셀러 A', startDate: '2026-08-03', endDate: '2026-08-05' },
]
const page = (id, name, start, end, seller = 'seller-1') => ({ id, properties: { 이름: { title: [{ plain_text: name }] }, 일정: { date: { start, end } }, 셀러명: { relation: [{ id: seller }] }, 담당매니저: { relation: [{ id: 'manager-1' }] } } })
const pages = [page('old-1', '일정 A', '2026-08-02', '2026-08-05'), page('old-2', '일정 B', '2026-08-03', '2026-08-06'), page('new-1', '새 일정', '2026-08-04', '2026-08-07'), page('new-2', '일정 A', '2026-08-09', '2026-08-10'), page('new-3', '취소 일정(취소)', '2026-08-08', '2026-08-09'), page('july', '지난 일정', '2026-07-31', '2026-08-02')]
let handler, finished
const client = { from(table) { assert.equal(table, 'workspace_state'); return { select() { return this }, eq() { return this }, async maybeSingle() { return { data: { payload: existing }, error: null } } } }, async rpc(name, args) { if (name === 'claim_automatic_sync') return { data: { cursor: null, run: { id: 'test', started_at: '2026-09-23T00:00:00Z' } }, error: null }; if (name === 'finish_automatic_sync') { finished = args; return { error: null } } throw Error(name) } }
vm.runInNewContext(source, { createClient: () => client, Deno: { env: { get: key => ({ SUPABASE_URL: 'test', SUPABASE_SERVICE_ROLE_KEY: 'test', AUTOMATIC_SYNC_CRON_TOKEN: 'test', NOTION_API_TOKEN: 'test', NOTION_CAMPAIGN_DATA_SOURCE_ID: 'test', NOTION_CAMPAIGN_FIELD_MAP: JSON.stringify({ title: '이름', period: '일정' }) })[key] }, serve(fn) { handler = fn } }, fetch: async () => ({ ok: true, json: async () => ({ results: pages, has_more: false }) }), Response, Request, AbortSignal, Date, JSON, String, Object, Boolean, Array, Number, Error, console })
const response = await handler(new Request('https://example.test', { method: 'POST', headers: { 'x-sync-token': 'test' }, body: JSON.stringify({ action: 'run', kind: 'campaign' }) }))
assert.equal(response.status, 200)
assert.deepEqual(Array.from(finished.p_changes, x => x.state), ['기존', '조건변경', '신규', '확인필요', '확인필요'])
assert.equal(finished.p_counts.checked, 5)
assert.equal(finished.p_counts.scopeApplied, 1)
assert.equal(finished.p_changes[1].scheduleId, 'schedule-2')
assert.equal(finished.p_changes[2].source.startDate, '2026-08-04')
console.log('Notion 일정 동기화: 8월 범위, 4분류, 기존 ID, 취소/유사 일정 보호 통과')
