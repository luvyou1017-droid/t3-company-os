import assert from 'node:assert/strict'
import { createServer } from 'vite'
globalThis.localStorage = { data: new Map(), getItem(k) { return this.data.get(k) ?? null }, setItem(k,v) { this.data.set(k,String(v)) }, removeItem(k) { this.data.delete(k) } }
const vite = await createServer({ configFile: false, server: { middlewareMode: true, hmr: false }, appType: 'custom' })
try {
 const { paymentRequestService: service } = await vite.ssrLoadModule('/src/shared/services/paymentRequestService.ts')
 const { campaignService } = await vite.ssrLoadModule('/src/shared/services/campaignService.ts')
 const { settlementService } = await vite.ssrLoadModule('/src/shared/services/settlementService.ts')
 campaignService.updatePaymentRequestStatus = () => undefined
 settlementService.updatePaymentRequestStatus = () => undefined
 const request = { id:'test', status:'approved', approvedBy:'original', approvedAt:'2026-09-01', recipientType:'seller' }
 service.getPaymentRequestById = () => request
 service.getPaymentRequests = () => [request]
 assert.throws(() => service.cancelApprovedPaymentRequest('test','reason','user','매니저'))
 assert.throws(() => service.cancelApprovedPaymentRequest('test',' ','user','대표'))
 for (const status of ['payment_completed','remittance_confirmed','sent','canceled']) {
  request.status=status
  assert.throws(() => service.cancelApprovedPaymentRequest('test','reason','user','대표'))
 }
 request.status='approved'; request.completedAt='2026-09-02'
 assert.throws(() => service.cancelApprovedPaymentRequest('test','reason','user','대표'))
 delete request.completedAt
 const result=service.cancelApprovedPaymentRequest('test',' correction ','허윤정','대표')
 assert.equal(result.status,'canceled'); assert.equal(result.previousStatusBeforeCancellation,'approved')
 assert.equal(result.approvedBy,'original'); assert.equal(result.cancellationReason,'correction')
 assert.equal(result.canceledBy,'허윤정'); assert.ok(result.canceledAt)
 console.log('Approved cancellation guards and audit fields passed')
} finally { await vite.close() }
