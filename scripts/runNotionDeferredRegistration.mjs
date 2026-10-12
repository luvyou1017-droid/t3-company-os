import assert from 'node:assert/strict'
import { createServer } from 'vite'
const memory = new Map()
globalThis.localStorage = { getItem: key => memory.get(key) ?? null, setItem: (key, value) => memory.set(key, value), removeItem: key => memory.delete(key) }
const vite = await createServer({ envDir: false, server: { middlewareMode: true, hmr: false }, appType: 'custom' })
try {
  const { prepareCandidate, separateSourceKey } = await vite.ssrLoadModule('/src/features/automaticSync/candidateOperations.ts')
  const { scheduleRequiredErrors, settlementReadinessErrors, mergeNotionCampaign } = await vite.ssrLoadModule('/src/shared/utils/campaignReadiness.ts')
  const { SupabaseCampaignRepository } = await vite.ssrLoadModule('/src/shared/repositories/campaignRepository.ts')
  const change = { id: 'b60c9d8c-1277-4a2d-9050-d061c089ad19', name: '혜링 × 빈투움 리뉴얼 1차', state: '확인필요', entity: '일정', differences: [], source: { title: '혜링 × 빈투움 리뉴얼 1차', startDate: '2026-10-21', endDate: '2026-10-25', sellerName: '현브로맘', managerName: '허윤정', supplyAudience: 'seller' } }
  const context = { campaigns: [], sellers: [], products: [], managers: [{ id: 'u-001', name: '허윤정' }] }
  const pending = prepareCandidate(change, context).candidate
  assert.equal(pending.sellerLinkPending, true)
  assert.equal(pending.sellerId, '')
  assert.equal(pending.sellerName, '현브로맘')
  assert.equal(pending.settlementVendorName, '')
  assert.deepEqual(scheduleRequiredErrors(pending), [])
  assert(settlementReadinessErrors(pending, []).includes('셀러 Master 연결 필요'))
  assert(scheduleRequiredErrors({ ...pending, sellerName: '' }).length)
  const old = { ...pending, id: 'old-schedule-id', startDate: '2026-08-31', endDate: '2026-09-03', deletedAt: '2026-09-23', proposalSnapshots: [{ id: 'protected-snapshot' }] }
  const before = JSON.stringify(old)
  context.campaigns = [old]
  assert.throws(() => prepareCandidate(change, context), /삭제\/확정/)
  const fork = prepareCandidate(change, context, undefined, true).candidate
  assert.notEqual(fork.id, old.id)
  assert.equal(fork.notionImportMetadata, undefined)
  assert.equal(fork.notionSeparateSource.signature, separateSourceKey(change))
  assert.equal(fork.id, prepareCandidate(change, context, undefined, true).candidate.id)
  assert.equal(fork.proposalSnapshots, undefined)
  assert.equal(JSON.stringify(old), before)
  assert.throws(() => prepareCandidate({ ...change, source: { ...change.source, title: old.campaignName, startDate: old.startDate, endDate: old.endDate } }, context, undefined, true), /登録|등록 이력/)
  const repo = Object.create(SupabaseCampaignRepository.prototype)
  repo.table = 'campaigns'
  let saved, inserts = 0, write
  repo.getById = async () => saved ?? null
  repo.client = { from() { return { insert(row) { inserts++; saved = row.metadata; return { select() { return { async single() { return { data: row, error: null } } } } } }, update(row) { write = row; return { eq() { return this }, is() { return this }, select() { return this }, async maybeSingle() { saved = row.metadata; return { data: row, error: null } } } } } } }
  const once = await repo.registerSeparateNotionSchedule(fork)
  const twice = await repo.registerSeparateNotionSchedule(fork)
  assert.equal(inserts, 1)
  assert.equal(once.id, twice.id)
  const linked = await repo.linkPendingSeller(fork.id, { id: 'seller-master', name: '현브로맘' })
  assert.equal(linked.id, fork.id)
  assert.equal(linked.sellerLinkPending, false)
  assert.equal(linked.sellerId, 'seller-master')
  assert.deepEqual(Object.keys(write).sort(), ['metadata','seller_id','seller_name','updated_at'])
  assert.equal(linked.notionSeparateSource.signature, fork.notionSeparateSource.signature)
  await assert.rejects(() => repo.linkPendingSeller(fork.id, { id: 'another', name: '다른 셀러' }), /기존 연결/)
  saved = { ...fork, status: 'settled' }
  await assert.rejects(() => repo.linkPendingSeller(fork.id, { id: 'seller-master', name: '현브로맘' }), /기존 연결/)
  const merged = mergeNotionCampaign({ ...pending, sellerId: 'existing-seller', sellerLinkPending: false }, pending)
  assert.equal(merged.sellerId, 'existing-seller')
  assert.equal(merged.sellerLinkPending, false)
  console.log('PASS deferred seller schedule creation; settlement guard; separate new ID; deleted history and Snapshots preserved; repeated creation deduped; later link retains ID; existing/settled links protected')
} finally { await vite.close() }
