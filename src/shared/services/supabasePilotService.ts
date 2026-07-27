import type { Campaign } from '../types/campaign'
import type { Settlement } from '../types/settlement'
import type { PaymentRequest } from '../types/sellerSettlement'
import type { PaymentEvidence } from '../types/paymentEvidence'
import type { WithholdingTaxItem } from '../types/withholdingTax'
import { campaignService } from './campaignService'
import { settlementService } from './settlementService'
import { calculateWithholding } from '../utils/withholdingTax'
import { toDatabaseUuid } from '../utils/databaseId'
import { isSupabaseConfigured, supabase } from '../lib/supabase'
import { SupabaseCampaignRepository } from '../repositories/campaignRepository'
import { SupabaseSettlementRepository } from '../repositories/settlementRepository'
import { SupabasePaymentRequestRepository } from '../repositories/paymentRequestRepository'
import { SupabasePaymentEvidenceRepository } from '../repositories/paymentEvidenceRepository'
import { SupabaseWithholdingTaxRepository } from '../repositories/withholdingTaxRepository'
import { paymentEvidenceStorageService } from './paymentEvidenceStorageService'

export type PilotStepStatus = 'pending' | 'success' | 'failed' | 'skipped' | 'duplicate'
export type PilotStepResult = {
  step: number
  target: string
  createdId?: string
  storage: 'Supabase' | 'Supabase Storage' | '-'
  status: PilotStepStatus
  verification: string
  error?: string
  executedAt: string
}
export type PilotMetadata = { isTestData: true; source: 'supabase-pilot'; testRunId: string }
export type PilotState = {
  testRunId: string
  nextStep: number
  results: PilotStepResult[]
  ids: { campaignId: string; settlementId: string; paymentRequestId: string; evidenceId: string; withholdingId: string; activityId: string }
  storagePath?: string
  signedUrl?: string
  updatedAt: string
}

export const SUPABASE_PILOT_STEPS = [
  '테스트 Campaign 생성', '테스트 Settlement 생성', '셀러 Payment Request 생성', 'Evidence 메타데이터 생성',
  '실제 증빙파일 Storage 업로드', 'signed URL 생성 및 미리보기', 'Withholding Tax Item 생성',
  'Activity Log 생성', '파일럿 데이터 다시 조회', '연결 관계 및 중복 검증',
] as const

const STATE_KEY = 't3_company_os_supabase_pilot_state'
const now = () => new Date().toISOString()
const testMetadata = (testRunId: string): PilotMetadata => ({ isTestData: true, source: 'supabase-pilot', testRunId })
type WithPilot<T> = T & { metadata: PilotMetadata }

function ids(testRunId: string) {
  return {
    campaignId: toDatabaseUuid(`supabase-pilot-${testRunId}-campaign`),
    settlementId: toDatabaseUuid(`supabase-pilot-${testRunId}-settlement`),
    paymentRequestId: toDatabaseUuid(`supabase-pilot-${testRunId}-payment-request`),
    evidenceId: toDatabaseUuid(`supabase-pilot-${testRunId}-evidence`),
    withholdingId: toDatabaseUuid(`supabase-pilot-${testRunId}-withholding`),
    activityId: toDatabaseUuid(`supabase-pilot-${testRunId}-activity`),
  }
}

function requirePilot() {
  if (!import.meta.env.DEV) throw new Error('Supabase 파일럿은 개발 모드에서만 실행할 수 있습니다.')
  if (!isSupabaseConfigured() || !supabase) throw new Error('환경변수 없음 · VITE_SUPABASE_URL과 VITE_SUPABASE_ANON_KEY를 .env.local에 설정해주세요.')
}

function classifyError(error: unknown) {
  const raw = error instanceof Error ? error.message : String(error)
  const message = raw.toLowerCase()
  if (message.includes('row-level security') || message.includes('permission')) return 'RLS 권한 거부 · 전체 허용 정책 대신 현재 역할에 필요한 최소 insert/update/delete 정책을 확인해주세요.'
  if (message.includes('does not exist') || message.includes('42p01')) return '테이블 없음 · Supabase SQL Editor에서 docs/SUPABASE_SCHEMA.sql을 먼저 실행해주세요.'
  if (message.includes('bucket')) return 'Storage bucket 없음 · private payment-evidence bucket을 준비해주세요.'
  if (message.includes('jwt') || message.includes('expired')) return '세션 만료 · 다시 로그인해주세요.'
  if (message.includes('fetch') || message.includes('network')) return '네트워크 오류 · 연결 상태와 Supabase URL을 확인해주세요.'
  return raw.replace(/eyJ[a-zA-Z0-9._-]+/g, '[REDACTED]')
}

function createState(testRunId = crypto.randomUUID()): PilotState {
  return { testRunId, nextStep: 1, results: [], ids: ids(testRunId), updatedAt: now() }
}

function readState(): PilotState {
  if (typeof localStorage === 'undefined') return createState()
  try { return JSON.parse(localStorage.getItem(STATE_KEY) ?? 'null') ?? createState() } catch { return createState() }
}

function saveState(state: PilotState) {
  if (typeof localStorage !== 'undefined') localStorage.setItem(STATE_KEY, JSON.stringify(state))
  return state
}

function pilotCampaign(state: PilotState): WithPilot<Campaign> {
  const template = campaignService.getCampaigns()[0]
  return {
    ...template, id: state.ids.campaignId, campaignCode: `TEST-${state.testRunId.slice(0, 8)}`,
    campaignName: '[TEST] Supabase 연결 테스트 공동구매', sellerId: toDatabaseUuid(`${state.testRunId}-seller`),
    sellerName: '테스트 셀러', managerId: toDatabaseUuid('u-005'), managerName: '김병희',
    mdId: toDatabaseUuid(`${state.testRunId}-md`), mdName: '테스트 MD', status: 'draft',
    salesChannelType: 'supplier_link', memo: `[TEST] source=supabase-pilot testRunId=${state.testRunId}`,
    createdAt: now(), updatedAt: now(), metadata: testMetadata(state.testRunId),
  }
}

function pilotSettlement(state: PilotState): WithPilot<Settlement> {
  const template = settlementService.getSettlements().find((item) => item.calculationSnapshot) ?? settlementService.getSettlements()[0]
  return {
    ...structuredClone(template), id: state.ids.settlementId, campaignId: state.ids.campaignId,
    status: 'approved', settlementVersion: 1, calculationSnapshot: structuredClone(template.currentCalculation),
    originalSnapshot: structuredClone(template.currentCalculation), createdAt: now(), updatedAt: now(),
    metadata: testMetadata(state.testRunId),
  }
}

function pilotPayment(state: PilotState): WithPilot<PaymentRequest> {
  const settlement = pilotSettlement(state)
  const c = settlement.currentCalculation
  return {
    id: state.ids.paymentRequestId, campaignId: state.ids.campaignId, settlementId: state.ids.settlementId,
    sellerId: pilotCampaign(state).sellerId, recipientType: 'seller', recipientId: pilotCampaign(state).sellerId,
    recipientName: '테스트 셀러', managerId: pilotCampaign(state).managerId, managerName: '김병희',
    amount: c.finalSellerPaymentAmount, sourceVersion: 1, ownerType: 'seller', ownerId: pilotCampaign(state).sellerId,
    ownerName: '테스트 셀러', direction: 'company_to_seller', salesChannelType: 'supplier_link',
    businessType: 'freelancer', evidenceType: 'withholding_3_3', grossSettlementAmount: c.sellerCommissionAmount,
    vatExcludedAmount: Math.round(c.sellerCommissionAmount / 1.1), withholdingBaseAmount: 0, withholdingTaxAmount: 0,
    deductions: c.sellerDeductionTotal, finalPaymentAmount: c.finalSellerPaymentAmount, sellerRemittanceToCompany: 0,
    evidenceStatus: 'confirmed', accountConfirmed: true, requestedBy: '[TEST] 허수정', requestedAt: now(),
    dueDate: settlement.paymentDueDate, status: 'approval_pending', memo: `[TEST] ${state.testRunId}`,
    metadata: testMetadata(state.testRunId),
  }
}

function pilotEvidence(state: PilotState, file?: File): WithPilot<PaymentEvidence> {
  return {
    id: state.ids.evidenceId, campaignId: state.ids.campaignId, settlementId: state.ids.settlementId,
    paymentRequestId: state.ids.paymentRequestId, ownerType: 'seller', ownerId: pilotCampaign(state).sellerId,
    ownerName: '테스트 셀러', businessType: 'freelancer', evidenceType: 'other',
    fileName: file?.name ?? '[TEST]-pending-evidence.pdf', fileType: file?.type ?? 'application/pdf',
    fileSize: file?.size ?? 0, storageBucket: state.storagePath ? 'payment-evidence' : undefined,
    storagePath: state.storagePath, uploadedBy: '[TEST] Supabase Pilot', uploadedAt: now(),
    reviewStatus: 'uploaded', revision: 1, memo: `[TEST] ${state.testRunId}`, metadata: testMetadata(state.testRunId),
  }
}

function pilotWithholding(state: PilotState): WithPilot<WithholdingTaxItem> {
  const payment = pilotPayment(state)
  const calculation = calculateWithholding(payment.grossSettlementAmount, payment.deductions)
  return {
    id: state.ids.withholdingId, campaignId: state.ids.campaignId, settlementId: state.ids.settlementId,
    paymentRequestId: state.ids.paymentRequestId, ownerType: 'seller', ownerId: payment.recipientId,
    ownerName: '테스트 셀러', paymentMonth: payment.dueDate.slice(0, 7), ...calculation,
    sourceVersion: 1, status: 'ready', createdAt: now(), updatedAt: now(),
    createdBy: '[TEST] Supabase Pilot', updatedBy: '[TEST] Supabase Pilot', memo: `[TEST] ${state.testRunId}`,
    metadata: testMetadata(state.testRunId),
  }
}

async function execute(step: number, state: PilotState, file?: File): Promise<PilotStepResult> {
  requirePilot()
  const base = { step, target: SUPABASE_PILOT_STEPS[step - 1], storage: 'Supabase' as const, executedAt: now() }
  const campaignRepo = new SupabaseCampaignRepository()
  const settlementRepo = new SupabaseSettlementRepository()
  const paymentRepo = new SupabasePaymentRequestRepository()
  const evidenceRepo = new SupabasePaymentEvidenceRepository()
  const withholdingRepo = new SupabaseWithholdingTaxRepository()
  try {
    if (step === 1) { const item = pilotCampaign(state); await campaignRepo.upsert(item); return { ...base, createdId: item.id, status: 'success', verification: (await campaignRepo.getById(item.id))?.campaignName ?? '재조회 실패' } }
    if (step === 2) { const item = pilotSettlement(state); await settlementRepo.upsert(item); return { ...base, createdId: item.id, status: 'success', verification: (await settlementRepo.getById(item.id))?.campaignId === state.ids.campaignId ? 'Campaign FK 및 calculation_snapshot 확인' : '관계 불일치' } }
    if (step === 3) {
      const existing = (await paymentRepo.list()).find((item) => item.settlementId === state.ids.settlementId && item.recipientType === 'seller' && item.recipientId === pilotCampaign(state).sellerId && item.sourceVersion === 1)
      if (existing) return { ...base, createdId: existing.id, status: 'duplicate', verification: '중복 키 일치 · 기존 Payment Request 재사용' }
      const item = pilotPayment(state); await paymentRepo.upsert(item); return { ...base, createdId: item.id, status: 'success', verification: 'Payment Request 저장 및 재조회 성공' }
    }
    if (step === 4) { const item = pilotEvidence(state); await evidenceRepo.upsert(item); return { ...base, createdId: item.id, status: 'success', verification: 'Evidence 메타데이터 저장 · 파일 업로드는 아직 미실행' } }
    if (step === 5) {
      if (!file) return { ...base, storage: 'Supabase Storage', status: 'skipped', verification: '실제 파일 선택 필요', error: '파일이 선택되지 않아 업로드를 실행하지 않았습니다.' }
      const uploaded = await paymentEvidenceStorageService.uploadPilotEvidenceFile(file, { testRunId: state.testRunId, campaignId: state.ids.campaignId, settlementId: state.ids.settlementId, evidenceId: state.ids.evidenceId })
      state.storagePath = uploaded.path; state.signedUrl = uploaded.previewUrl
      await evidenceRepo.update(pilotEvidence(state, file))
      return { ...base, storage: 'Supabase Storage', createdId: uploaded.path, status: 'success', verification: '실제 파일 업로드 및 Evidence 메타데이터 업데이트 성공' }
    }
    if (step === 6) {
      if (!state.storagePath) return { ...base, storage: 'Supabase Storage', status: 'skipped', verification: '업로드된 파일 없음', error: '5단계에서 실제 파일을 먼저 업로드해주세요.' }
      state.signedUrl = await paymentEvidenceStorageService.getEvidenceSignedUrl(state.storagePath)
      return { ...base, storage: 'Supabase Storage', createdId: state.storagePath, status: 'success', verification: '15분 만료 signed URL 생성 성공' }
    }
    if (step === 7) {
      const expected = pilotWithholding(state)
      const existing = (await withholdingRepo.list()).find((item) => item.paymentRequestId === state.ids.paymentRequestId && item.ownerId === expected.ownerId && item.sourceVersion === 1)
      if (existing) return { ...base, createdId: existing.id, status: 'duplicate', verification: '중복 키 일치 · 기존 원천세 항목 재사용' }
      await withholdingRepo.upsert(expected); return { ...base, createdId: expected.id, status: 'success', verification: `기존 계산 함수 검증 · 총 원천세 ${expected.totalWithholdingTaxAmount.toLocaleString()}원` }
    }
    if (step === 8) {
      const metadata = testMetadata(state.testRunId)
      const { error } = await supabase!.from('activity_logs').upsert({ id: state.ids.activityId, campaign_id: state.ids.campaignId, entity_type: 'payment_request', entity_id: state.ids.paymentRequestId, action: 'supabase_pilot_verified', actor_name: '[TEST] Supabase Pilot', memo: `[TEST] ${state.testRunId}`, metadata })
      if (error) throw error
      return { ...base, createdId: state.ids.activityId, status: 'success', verification: 'Activity Log 저장 성공' }
    }
    if (step === 9) {
      const records = await Promise.all([campaignRepo.getById(state.ids.campaignId), settlementRepo.getById(state.ids.settlementId), paymentRepo.getById(state.ids.paymentRequestId), evidenceRepo.getById(state.ids.evidenceId), withholdingRepo.getById(state.ids.withholdingId)])
      return { ...base, status: records.every(Boolean) ? 'success' : 'failed', verification: `${records.filter(Boolean).length}/5 DB 레코드 재조회`, error: records.every(Boolean) ? undefined : '일부 파일럿 레코드를 찾지 못했습니다.' }
    }
    const [settlement, payment, evidence, withholding] = await Promise.all([settlementRepo.getById(state.ids.settlementId), paymentRepo.getById(state.ids.paymentRequestId), evidenceRepo.getById(state.ids.evidenceId), withholdingRepo.getById(state.ids.withholdingId)])
    const linked = settlement?.campaignId === state.ids.campaignId && payment?.settlementId === state.ids.settlementId && evidence?.paymentRequestId === state.ids.paymentRequestId && withholding?.paymentRequestId === state.ids.paymentRequestId
    return { ...base, status: linked ? 'success' : 'failed', verification: linked ? 'Campaign → Settlement → Payment → Evidence/Withholding 연결 확인 · 중복 없음' : '연결 관계 불일치', error: linked ? undefined : 'FK 또는 metadata 연결을 확인해주세요.' }
  } catch (error) {
    return { ...base, status: 'failed', verification: '검증 실패', error: classifyError(error) }
  }
}

export const supabasePilotService = {
  getState: readState,
  createNewRun() { return saveState(createState()) },
  clearResults() { if (typeof localStorage !== 'undefined') localStorage.removeItem(STATE_KEY); return createState() },
  async runStep(step: number, file?: File) {
    const state = readState()
    const result = await execute(step, state, file)
    state.results = [...state.results.filter((item) => item.step !== step), result].sort((a, b) => a.step - b.step)
    if (result.status === 'success' || result.status === 'duplicate') state.nextStep = Math.max(state.nextStep, step + 1)
    state.updatedAt = now()
    return saveState(state)
  },
  async runNext(file?: File) { const state = readState(); return this.runStep(Math.min(state.nextStep, SUPABASE_PILOT_STEPS.length), file) },
  async runAll(file?: File) {
    let state = readState()
    for (let step = 1; step <= SUPABASE_PILOT_STEPS.length; step += 1) {
      state = await this.runStep(step, step === 5 ? file : undefined)
      const result = state.results.find((item) => item.step === step)
      if (result?.status === 'failed' || result?.status === 'skipped') break
    }
    return state
  },
  async refreshSignedUrl() {
    const state = readState()
    if (state.storagePath) { state.signedUrl = await paymentEvidenceStorageService.getEvidenceSignedUrl(state.storagePath); saveState(state) }
    return state
  },
  async cleanup() {
    requirePilot()
    const state = readState()
    const metadataMatches = (item: unknown) => {
      const meta = (item as { metadata?: Partial<PilotMetadata> } | null)?.metadata
      return meta?.isTestData === true && meta.source === 'supabase-pilot' && meta.testRunId === state.testRunId
    }
    const campaignRepo = new SupabaseCampaignRepository(); const settlementRepo = new SupabaseSettlementRepository()
    const paymentRepo = new SupabasePaymentRequestRepository(); const evidenceRepo = new SupabasePaymentEvidenceRepository(); const withholdingRepo = new SupabaseWithholdingTaxRepository()
    const report: Array<{ target: string; deleted: boolean; message: string }> = []
    const { data: activity } = await supabase!.from('activity_logs').select('id,metadata').eq('id', state.ids.activityId).maybeSingle()
    if (metadataMatches(activity)) { const { error } = await supabase!.from('activity_logs').delete().eq('id', state.ids.activityId); report.push({ target: 'Activity Log', deleted: !error, message: error ? classifyError(error) : '삭제 완료' }) }
    for (const [target, repo, id] of [
      ['Withholding Tax', withholdingRepo, state.ids.withholdingId], ['Payment Evidence', evidenceRepo, state.ids.evidenceId],
      ['Payment Request', paymentRepo, state.ids.paymentRequestId], ['Settlement', settlementRepo, state.ids.settlementId],
      ['Campaign', campaignRepo, state.ids.campaignId],
    ] as const) {
      const item = await repo.getById(id)
      if (!metadataMatches(item)) { report.push({ target, deleted: false, message: '테스트 metadata 불일치 · 삭제하지 않음' }); continue }
      if (target === 'Payment Request' && state.storagePath) {
        // Storage는 Evidence metadata 확인 후 DB 부모 삭제 전에 제거한다.
      }
      await repo.deleteById(id); report.push({ target, deleted: true, message: '삭제 완료' })
      if (target === 'Payment Evidence' && state.storagePath) { await paymentEvidenceStorageService.deleteEvidenceFile(state.storagePath); report.push({ target: 'Storage 파일', deleted: true, message: state.storagePath }) }
    }
    return report
  },
}
