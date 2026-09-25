import assert from 'node:assert/strict'
import { changedWorkspaceKeys, rememberWorkspaceRow } from '../src/shared/services/workspacePayloadCache.ts'

const local = new Map([['settlements', '{"amount":100}'], ['schedules', '[1]']])
const session = new Map()
globalThis.sessionStorage = { getItem: (key) => session.get(key) ?? null, setItem: (key, value) => session.set(key, value) }
const storage = { getItem: (key) => local.get(key) ?? null }
const versions = [
  { storage_key: 'settlements', updated_at: '2026-09-25T00:00:00Z', deleted: false },
  { storage_key: 'schedules', updated_at: '2026-09-25T00:00:00Z', deleted: false },
  { storage_key: 'removed', updated_at: '2026-09-25T00:00:00Z', deleted: true },
]

assert.deepEqual(await changedWorkspaceKeys(versions, storage), ['settlements', 'schedules', 'removed'])
await Promise.all(versions.map((row) => rememberWorkspaceRow(row.storage_key, row.updated_at, storage.getItem(row.storage_key))))
assert.deepEqual(await changedWorkspaceKeys(versions, storage), [])
local.set('settlements', '{"amount":200}')
assert.deepEqual(await changedWorkspaceKeys(versions, storage), ['settlements'])
local.set('settlements', '{"amount":100}')
assert.deepEqual(await changedWorkspaceKeys([{ ...versions[0], updated_at: '2026-09-25T00:01:00Z' }, ...versions.slice(1)], storage), ['settlements'])
local.set('removed', 'stale')
assert.deepEqual(await changedWorkspaceKeys(versions, storage), ['removed'])
local.delete('removed')
local.delete('schedules')
assert.deepEqual(await changedWorkspaceKeys(versions, storage), ['schedules'])
console.log('Workspace cache: unchanged, changed, deleted and missing data verified')
