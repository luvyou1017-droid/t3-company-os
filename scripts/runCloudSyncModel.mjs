import assert from 'node:assert/strict'

const values = new Map()
globalThis.localStorage = {
  getItem: (key) => values.has(key) ? values.get(key) : null,
  setItem: (key, value) => values.set(key, String(value)),
  removeItem: (key) => values.delete(key),
}

const { STORAGE_KEYS, storageService } = await import('../src/shared/services/storageService.ts')
const { countWorkspaceRecords, createWorkspaceBackup, SYNCHRONIZED_STORAGE_KEYS } = await import('../src/shared/services/cloudSyncModel.ts')

storageService.setItem(STORAGE_KEYS.csCases, [{ id: 'cs-1' }])
storageService.setItem(STORAGE_KEYS.samples, [{ id: 'sample-1' }, { id: 'sample-2' }])
storageService.setItem(STORAGE_KEYS.campaignListState, { activeTab: '전체' })

const backup = createWorkspaceBackup(localStorage, 'test-device', '2026-09-09T00:00:00.000Z')
assert.equal(backup.format, 't3-company-os-workspace-backup')
assert.equal(backup.version, 1)
assert.deepEqual(backup.data[STORAGE_KEYS.csCases], [{ id: 'cs-1' }])
assert.deepEqual(backup.data[STORAGE_KEYS.samples], [{ id: 'sample-1' }, { id: 'sample-2' }])
assert.equal(backup.data[STORAGE_KEYS.campaignListState], undefined)
assert.equal(countWorkspaceRecords(backup.data), 3)
assert.equal(SYNCHRONIZED_STORAGE_KEYS.includes(STORAGE_KEYS.csCases), true)
assert.equal(SYNCHRONIZED_STORAGE_KEYS.includes(STORAGE_KEYS.campaignListState), false)

console.log('Cloud sync backup model tests passed.')
