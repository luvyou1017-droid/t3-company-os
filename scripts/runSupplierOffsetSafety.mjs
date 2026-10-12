import assert from 'node:assert/strict'
import { createServer } from 'vite'

const server = await createServer({ envDir: false, server: { middlewareMode: true, hmr: false }, appType: 'custom' })
try {
  const { supplierOffsetSummary } = await server.ssrLoadModule('/src/shared/utils/supplierRequestDocument.ts')
  const source = {
    supplierCollectionOffset: { amount: 22400, receivedAmount: 520400, memo: '샘플 회사 실제원가 상계', recordedAt: '2026-10-06', recordedBy: 'manager' },
    eventCosts: [{ amount: 23406, companyUnitCost: 22400, owner: 'seller' }],
  }
  assert.deepEqual(supplierOffsetSummary(source, 542800, true), { offset: 22400, finalAmount: 520400, needsReview: false })
  assert.equal(source.eventCosts[0].amount, 23406)
  assert.equal(supplierOffsetSummary({ supplierCollectionOffset: { ...source.supplierCollectionOffset, amount: 23406 } }, 542800, true).finalAmount, undefined)
  assert.equal(supplierOffsetSummary(source, 542800, false).needsReview, true)
  assert.deepEqual(supplierOffsetSummary({ manualSettlement: { reportedOffsetAmount: 22400, reportedCommissionAmount: 542800 } }, 542800, true), { offset: 22400, finalAmount: 520400, needsReview: false })
  console.log('PASS supplier receipt 520400, seller deduction preserved, mismatch blocked, legacy offset preserved')
} finally { await server.close() }
