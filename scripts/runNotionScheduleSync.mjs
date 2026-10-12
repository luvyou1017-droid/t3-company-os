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
const pages = [page('old-1', '일정 A', '2026-08-02', '2026-08-05'), page('old-2', '일정 B', '2026-08-03', '2026-08-06'), page('new-1', '새 일정', '2026-08-04', '2026-08-07'), page('new-2', '일정 A', '2026-08-09', '2026-08-10'), page('new-3', '취소 일정(취소)', '2026-08-08', '2026-08-09'), page('july', '지난 일정', '2026-07-31', '2026-08-02', 'out-of-scope-seller')]
const missingManager = page('new-4', '신규 일정', '2026-08-11', '2026-08-12')
missingManager.properties['담당매니저'] = { relation: [] }
pages.splice(5, 0, missingManager)
let handler, finished
let cursor = null
let prior = []
let returnedPages = pages
const requestedRelations = []
let queryBody
let fakeNow = Date.now()
class TestDate extends Date { static now() { return fakeNow } }
const client = { auth: { async getUser() { return { data: { user: { id: 'admin' } }, error: null } } }, from(table) { if (table === 'profiles') return { select() { return this }, eq() { return this }, async maybeSingle() { return { data: { role: 'admin', active: true, approval_status: 'approved' }, error: null } } }; if (table === 'automatic_sync_runs') return { select() { return this }, eq() { return this }, order() { return this }, limit() { return this }, async maybeSingle() { return { data: { changes: prior }, error: null } } }; if (table === 'notion_schedule_exclusions') return { async select() { return { data: [], error: null } } }; assert.equal(table, 'workspace_state'); return { select() { return this }, eq() { return this }, async maybeSingle() { return { data: { payload: existing }, error: null } } } }, async rpc(name, args) { if (name === 'claim_automatic_sync') return { data: { cursor, run: { id: 'test', started_at: '2026-09-23T00:00:00Z' } }, error: null }; if (name === 'finish_automatic_sync') { finished = args; return { error: null } } throw Error(name) } }
vm.runInNewContext(source, { createClient: () => client, Deno: { env: { get: key => ({ SUPABASE_URL: 'test', SUPABASE_SERVICE_ROLE_KEY: 'test', AUTOMATIC_SYNC_CRON_TOKEN: 'test', NOTION_API_TOKEN: 'test', NOTION_CAMPAIGN_DATA_SOURCE_ID: 'test', NOTION_CAMPAIGN_FIELD_MAP: JSON.stringify({ title: '이름', period: '일정', manager: '이전 필드 이름' }) })[key] }, serve(fn) { handler = fn } }, fetch: async (url, init) => { if (url.includes('/data_sources/')) { queryBody = JSON.parse(init.body); return { ok: true, json: async () => ({ results: returnedPages, has_more: false }) } }; const id = url.split('/').at(-1); requestedRelations.push(id); return { ok: true, json: async () => ({ properties: { 제목: { type: 'title', title: [{ plain_text: id === 'seller-1' ? '셀러 A' : id === 'manager-1' ? '매니저 A' : '' }] } } }) } }, setTimeout: fn => { fn(); return 1 }, Response, Request, AbortSignal, Date: TestDate, JSON, String, Object, Boolean, Array, Number, Error, console })
const response = await handler(new Request('https://example.test', { method: 'POST', headers: { 'x-sync-token': 'test' }, body: JSON.stringify({ action: 'run', kind: 'campaign' }) }))
assert.equal(response.status, 200)
assert.deepEqual(Array.from(finished.p_changes, x => x.state), ['기존', '조건변경', '신규', '확인필요', '확인필요', '신규'])
assert.equal(finished.p_counts.checked, 6)
assert.equal(finished.p_changes[5].reason, '담당 매니저 확인 필요')
assert.equal(finished.p_counts.scopeApplied, 1)
assert.equal(finished.p_changes[1].scheduleId, 'schedule-2')
assert.equal(finished.p_changes[2].source.startDate, '2026-08-04')
assert.ok(queryBody.filter.and.some(filter => filter.timestamp === 'last_edited_time' && filter.last_edited_time?.on_or_before === '2026-09-23T00:00:00Z'))
assert.ok(!requestedRelations.includes('out-of-scope-seller'))
assert.equal(requestedRelations.filter(id => id === 'seller-1').length, 1)
assert.equal(requestedRelations.filter(id => id === 'manager-1').length, 1)
console.log('Notion 일정 동기화: 8월 범위, 4분류, 기존 ID, 취소/유사 일정 보호 통과')

// Incremental run must keep unprocessed candidates, replace a modified page once,
// discard a page moved out of scope, and fetch no relation for unchanged pages.
cursor = '2026-09-22T00:00:00Z'
prior = Array.from(finished.p_changes)
returnedPages = [page('new-1', '새 일정 수정', '2026-08-04', '2026-08-08'), page('new-4', '범위 밖으로 수정', '2026-07-01', '2026-07-02')]
requestedRelations.length = 0
const requestRun = full => handler(new Request('https://example.test', { method: 'POST', headers: { 'x-sync-token': 'test' }, body: JSON.stringify({ action: 'run', kind: 'campaign', full }) }))
assert.equal((await requestRun(false)).status, 200)
assert.equal(queryBody.filter.and[0].last_edited_time.on_or_after, '2026-09-21T23:59:00.000Z')
assert.equal(finished.p_counts.checked, 1)
assert.equal(finished.p_changes.filter(x => x.id === 'new-1').length, 1)
assert.equal(finished.p_changes.find(x => x.id === 'new-1').name, '새 일정 수정')
assert.ok(finished.p_changes.some(x => x.id === 'old-2'))
assert.ok(!finished.p_changes.some(x => x.id === 'new-4'))
prior = Array.from(finished.p_changes)
returnedPages = []
requestedRelations.length = 0
assert.equal((await requestRun(false)).status, 200)
assert.equal(finished.p_counts.checked, 0)
assert.equal(finished.p_changes.length, prior.length)
assert.equal(requestedRelations.length, 0)
// The scheduler cannot request a costly full comparison via its payload.
assert.equal((await requestRun(true)).status, 200)
assert.equal(queryBody.filter.and.length, 2)
assert.equal((await handler(new Request('https://example.test', { method: 'POST', headers: { Authorization: 'Bearer test' }, body: JSON.stringify({ action: 'run', kind: 'campaign', full: true }) }))).status, 200)
assert.equal(queryBody.filter.and.length, 1)
assert.equal(finished.p_changes.length, 0)
console.log('PASS incremental timestamp window; retained pending candidates; page-ID deduplication; moved-out-of-scope removal; no-change run avoids relation calls')

finished = undefined
let deadlineHandler
vm.runInNewContext(source, { createClient: () => client, Deno: { env: { get: key => ({ SUPABASE_URL: 'test', SUPABASE_SERVICE_ROLE_KEY: 'test', AUTOMATIC_SYNC_CRON_TOKEN: 'test', NOTION_API_TOKEN: 'test', NOTION_CAMPAIGN_DATA_SOURCE_ID: 'test', NOTION_CAMPAIGN_FIELD_MAP: JSON.stringify({ title: '이름', period: '일정' }) })[key] }, serve(fn) { deadlineHandler = fn } }, fetch: async () => { fakeNow += 110001; return { ok: true, json: async () => ({ results: returnedPages, has_more: false }) } }, setTimeout: fn => { fn(); return 1 }, Response, Request, AbortSignal, Date: TestDate, JSON, String, Object, Boolean, Array, Number, Error, console })
const expired = await deadlineHandler(new Request('https://example.test', { method: 'POST', headers: { 'x-sync-token': 'test' }, body: JSON.stringify({ action: 'run', kind: 'campaign' }) }))
assert.equal(expired.status, 502)
assert.match(finished.p_error, /제한시간/)
assert.equal(finished.p_changes.length, 0)
console.log('PASS scoped server query; out-of-scope relations skipped; cached relation fetched once; deadline recorded as failure with no partial candidates/cursor success')
