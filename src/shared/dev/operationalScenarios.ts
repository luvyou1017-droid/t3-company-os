import { appUsers, type AppUser } from '../data/users.ts'
import { calculateWithholding } from '../utils/withholdingTax.ts'
import {
  assertActivityLogCreated,
  assertEvidenceStatus,
  assertNoDuplicatePaymentRequest,
  assertNoDuplicateWithholdingItem,
  assertOwnerIsolation,
  assertPaymentStatus,
  assertPermission,
  assertTimelineStep,
  assertValue,
  assertWithholdingItemCreated,
  type ScenarioAssertionResult,
} from './scenarioAssertions.ts'

export type OperationalScenarioId = 'scenario-a' | 'scenario-b' | 'scenario-c' | 'scenario-d' | 'scenario-e'
export type ScenarioRunStatus = 'not_run' | 'running' | 'passed' | 'failed'
export type ScenarioAction =
  | 'view_menu' | 'open_route' | 'upload_evidence' | 'review_evidence' | 'create_payment'
  | 'approve_payment' | 'complete_payment' | 'view_campaign'

export interface ScenarioStep {
  id: string
  label: string
  userId: string
  role: string
  availableAction: string
}

export interface OperationalScenarioDefinition {
  id: OperationalScenarioId
  name: string
  purpose: string
  expectedResult: string
  steps: ScenarioStep[]
}

interface ScenarioEvidence {
  id: string
  ownerType: 'seller' | 'manager'
  revision: number
  status: 'uploaded' | 'review_pending' | 'approved' | 'rejected'
  rejectionReason?: string
  previousEvidenceId?: string
}

interface ScenarioPayment {
  id: string
  ownerType: 'seller' | 'manager'
  amount: number
  status: 'approval_pending' | 'approved' | 'payment_completed'
}

export interface ScenarioRuntimeData {
  metadata: { isTestData: true; scenarioId: OperationalScenarioId }
  campaignId: string
  ownerManagerId: string
  currentUserId: string
  timelineStep: string
  checklistReady: boolean
  evidence: ScenarioEvidence[]
  payments: ScenarioPayment[]
  withholdingItems: Array<ReturnType<typeof calculateWithholding> & { id: string; paymentId: string }>
  workItems: Array<{ id: string; assigneeId: string; status: 'pending' | 'completed'; type: string }>
  activityLogs: Array<{ ownerType: 'seller' | 'manager'; action: string }>
  permissionChecks: Array<{ label: string; allowed: boolean; expected: boolean; detail: string }>
}

export interface OperationalScenarioSession {
  scenarioId: OperationalScenarioId
  status: ScenarioRunStatus
  currentStep: number
  data: ScenarioRuntimeData
  assertions: ScenarioAssertionResult[]
  updatedAt: string
}

const manager = appUsers.find((user) => user.name === '김병희')!
const reviewer = appUsers.find((user) => user.name === '허수정')!
const ceo = appUsers.find((user) => user.role === '대표')!
const otherManager = appUsers.find((user) => user.name === '서주희')!
const secondaryOperator: AppUser = { id: 'dev-u-009', name: '비지정 정산 담당', role: '정산 담당자' }
const scenarioUsers = [...appUsers, secondaryOperator]
const STORAGE_KEY = 't3_company_os_dev_operational_scenarios'

const roleActionMatrix: Record<AppUser['role'], ScenarioAction[]> = {
  대표: ['view_menu', 'open_route', 'approve_payment'],
  팀장: ['view_menu', 'open_route', 'view_campaign'],
  매니저: ['view_menu', 'open_route', 'upload_evidence', 'view_campaign'],
  MD: ['view_menu', 'open_route', 'view_campaign'],
  '정산 담당자': ['view_menu', 'open_route', 'review_evidence', 'create_payment', 'complete_payment', 'view_campaign'],
}

export const operationalScenarioDefinitions: OperationalScenarioDefinition[] = [
  {
    id: 'scenario-a', name: 'Scenario A · 정상 지급 흐름', purpose: '역할 전환에 따라 증빙부터 지급 완료까지 정상 연결되는지 검증합니다.',
    expectedResult: 'Timeline 전체 완료, 지급요청 1건, 역할별 My Work와 Activity Log 생성',
    steps: [
      ['a-1', '본인 Campaign 조회', manager.id, manager.role, 'Campaign 조회'],
      ['a-2', '증빙 업로드 및 검수 요청', manager.id, manager.role, '증빙 검수 요청'],
      ['a-3', '증빙 승인 및 My Work 완료', reviewer.id, reviewer.role, '증빙 승인'],
      ['a-4', '지급요청 생성', reviewer.id, reviewer.role, '지급요청 생성'],
      ['a-5', '대표 승인', ceo.id, ceo.role, '대표 승인'],
      ['a-6', '지급 완료', reviewer.id, reviewer.role, '지급 완료 처리'],
    ].map(([id, label, userId, role, availableAction]) => ({ id, label, userId, role, availableAction })),
  },
  {
    id: 'scenario-b', name: 'Scenario B · 증빙 반려 후 재업로드', purpose: '반려 사유와 revision 이력을 보존한 채 지급이 완료되는지 검증합니다.',
    expectedResult: 'Revision 1 보존, Revision 2 승인, 재업로드 Work Item과 지급 완료 기록',
    steps: [
      ['b-1', 'Revision 1 업로드 및 검수 요청', manager.id, manager.role, '증빙 검수 요청'],
      ['b-2', '증빙 반려', reviewer.id, reviewer.role, '반려 사유 저장'],
      ['b-3', 'Revision 2 재업로드', manager.id, manager.role, '재업로드'],
      ['b-4', 'Revision 2 승인', reviewer.id, reviewer.role, '증빙 승인'],
      ['b-5', '지급요청 생성', reviewer.id, reviewer.role, '지급요청 생성'],
      ['b-6', '대표 승인', ceo.id, ceo.role, '대표 승인'],
      ['b-7', '지급 완료', reviewer.id, reviewer.role, '지급 완료 처리'],
    ].map(([id, label, userId, role, availableAction]) => ({ id, label, userId, role, availableAction })),
  },
  {
    id: 'scenario-c', name: 'Scenario C · 프리랜서 원천세', purpose: '3%와 0.3%를 각각 10원 단위 절사하고 중복 없이 원천세 항목을 만드는지 검증합니다.',
    expectedResult: '기준금액 484,655원, 총 원천세 15,980원, 최종 지급액 468,675원',
    steps: [
      ['c-1', '원천세 계산', reviewer.id, reviewer.role, '원천세 계산'],
      ['c-2', '지급요청 및 원천세 리스트 생성', reviewer.id, reviewer.role, '지급요청 생성'],
      ['c-3', '대표 승인', ceo.id, ceo.role, '대표 승인'],
      ['c-4', '지급 완료 및 중복 방지 확인', reviewer.id, reviewer.role, '지급 완료 처리'],
    ].map(([id, label, userId, role, availableAction]) => ({ id, label, userId, role, availableAction })),
  },
  {
    id: 'scenario-d', name: 'Scenario D · 권한 차단', purpose: '메뉴, URL, 버튼, 저장 함수와 타인 데이터 접근을 역할별로 차단하는지 검증합니다.',
    expectedResult: '권한 없는 네 가지 실행과 타인 Campaign 접근이 모두 403 또는 차단',
    steps: [
      ['d-1', '타인 지급요청 직접 접근', otherManager.id, otherManager.role, '403 확인'],
      ['d-2', '정산 담당자의 대표 승인 시도', reviewer.id, reviewer.role, '저장 차단'],
      ['d-3', '대표의 지급 완료 시도', ceo.id, ceo.role, '저장 차단'],
      ['d-4', '비지정 정산 담당의 증빙 최종 검수 시도', secondaryOperator.id, secondaryOperator.role, '저장 차단'],
    ].map(([id, label, userId, role, availableAction]) => ({ id, label, userId, role, availableAction })),
  },
  {
    id: 'scenario-e', name: 'Scenario E · 셀러와 매니저 지급 분리', purpose: '같은 Campaign의 두 지급 대상이 증빙, 금액, 승인과 이력을 독립적으로 유지하는지 검증합니다.',
    expectedResult: 'evidenceId, paymentRequestId, 금액, 검수·승인·완료·Activity Log 완전 분리',
    steps: [
      ['e-1', '셀러·매니저 증빙 생성', manager.id, manager.role, '대상별 증빙 업로드'],
      ['e-2', '셀러 증빙만 승인', reviewer.id, reviewer.role, '셀러 검수 승인'],
      ['e-3', '대상별 지급요청 생성', reviewer.id, reviewer.role, '독립 요청 생성'],
      ['e-4', '셀러 요청만 대표 승인', ceo.id, ceo.role, '셀러 대표 승인'],
      ['e-5', '상태 격리 확인', reviewer.id, reviewer.role, '소유자 격리 검증'],
    ].map(([id, label, userId, role, availableAction]) => ({ id, label, userId, role, availableAction })),
  },
]

function emptyData(scenarioId: OperationalScenarioId): ScenarioRuntimeData {
  return {
    metadata: { isTestData: true, scenarioId }, campaignId: `DEV-${scenarioId.toUpperCase()}`,
    ownerManagerId: manager.id, currentUserId: manager.id, timelineStep: '정산 완료', checklistReady: false,
    evidence: [], payments: [], withholdingItems: [], workItems: [], activityLogs: [], permissionChecks: [],
  }
}

function can(userId: string, action: ScenarioAction, ownerManagerId = manager.id) {
  const user = scenarioUsers.find((candidate) => candidate.id === userId)
  if (!user || !roleActionMatrix[user.role].includes(action)) return false
  if (action === 'view_campaign' && user.role === '매니저') return user.id === ownerManagerId
  if (action === 'review_evidence') return user.id === reviewer.id
  return true
}

export function getOperationalScenarioUser(userId: string) {
  return scenarioUsers.find((user) => user.id === userId)
}

function requireAction(data: ScenarioRuntimeData, userId: string, action: ScenarioAction) {
  if (!can(userId, action, data.ownerManagerId)) throw new Error('403 · 이 작업을 실행할 권한이 없습니다.')
}

function addPayment(data: ScenarioRuntimeData, ownerType: 'seller' | 'manager', amount: number) {
  if (!data.payments.some((item) => item.ownerType === ownerType)) {
    data.payments.push({ id: `${data.metadata.scenarioId}-${ownerType}-payment`, ownerType, amount, status: 'approval_pending' })
    data.activityLogs.push({ ownerType, action: 'payment_requested' })
  }
}

function executeStep(session: OperationalScenarioSession, stepIndex: number) {
  const data = structuredClone(session.data)
  const id = session.scenarioId
  const step = operationalScenarioDefinitions.find((item) => item.id === id)!.steps[stepIndex]
  data.currentUserId = step.userId

  if (id === 'scenario-a') {
    if (stepIndex === 0) { requireAction(data, manager.id, 'view_campaign'); data.activityLogs.push({ ownerType: 'manager', action: 'campaign_viewed' }) }
    if (stepIndex === 1) { requireAction(data, manager.id, 'upload_evidence'); data.evidence.push({ id: 'scenario-a-manager-evidence-r1', ownerType: 'manager', revision: 1, status: 'review_pending' }); data.workItems.push({ id: 'scenario-a-review-work', assigneeId: reviewer.id, status: 'pending', type: 'evidence_review' }); data.timelineStep = '증빙 검수' }
    if (stepIndex === 2) { requireAction(data, reviewer.id, 'review_evidence'); data.evidence[0].status = 'approved'; data.workItems[0].status = 'completed'; data.activityLogs.push({ ownerType: 'manager', action: 'evidence_approved' }); data.timelineStep = '지급 요청' }
    if (stepIndex === 3) { requireAction(data, reviewer.id, 'create_payment'); addPayment(data, 'manager', 468_675); data.timelineStep = '대표 승인' }
    if (stepIndex === 4) { requireAction(data, ceo.id, 'approve_payment'); data.payments[0].status = 'approved'; data.activityLogs.push({ ownerType: 'manager', action: 'payment_approved' }); data.timelineStep = '지급 예정'; data.checklistReady = true }
    if (stepIndex === 5) { requireAction(data, reviewer.id, 'complete_payment'); data.payments[0].status = 'payment_completed'; data.activityLogs.push({ ownerType: 'manager', action: 'payment_completed' }); data.timelineStep = '지급 완료' }
  }
  if (id === 'scenario-b') {
    if (stepIndex === 0) { data.evidence.push({ id: 'scenario-b-manager-evidence-r1', ownerType: 'manager', revision: 1, status: 'review_pending' }) }
    if (stepIndex === 1) { data.evidence[0].status = 'rejected'; data.evidence[0].rejectionReason = '발행 금액을 확인할 수 없습니다.'; data.workItems.push({ id: 'scenario-b-reupload-work', assigneeId: manager.id, status: 'pending', type: 'evidence_reupload' }); data.activityLogs.push({ ownerType: 'manager', action: 'evidence_rejected' }) }
    if (stepIndex === 2) { data.evidence.push({ id: 'scenario-b-manager-evidence-r2', ownerType: 'manager', revision: 2, status: 'review_pending', previousEvidenceId: data.evidence[0].id }); data.workItems[0].status = 'completed' }
    if (stepIndex === 3) { data.evidence[1].status = 'approved'; data.activityLogs.push({ ownerType: 'manager', action: 'evidence_approved' }) }
    if (stepIndex === 4) addPayment(data, 'manager', 468_675)
    if (stepIndex === 5) { data.payments[0].status = 'approved'; data.activityLogs.push({ ownerType: 'manager', action: 'payment_approved' }) }
    if (stepIndex === 6) { data.payments[0].status = 'payment_completed'; data.activityLogs.push({ ownerType: 'manager', action: 'payment_completed' }); data.timelineStep = '지급 완료'; data.checklistReady = true }
  }
  if (id === 'scenario-c') {
    const calculation = calculateWithholding(533_120)
    if (stepIndex === 0) data.activityLogs.push({ ownerType: 'manager', action: 'withholding_calculated' })
    if (stepIndex === 1) { addPayment(data, 'manager', calculation.finalPaymentAmount); if (!data.withholdingItems.length) data.withholdingItems.push({ id: 'scenario-c-withholding', paymentId: data.payments[0].id, ...calculation }) }
    if (stepIndex === 2) { data.payments[0].status = 'approved'; data.activityLogs.push({ ownerType: 'manager', action: 'payment_approved' }) }
    if (stepIndex === 3) { data.payments[0].status = 'payment_completed'; if (!data.withholdingItems.some((item) => item.paymentId === data.payments[0].id)) data.withholdingItems.push({ id: 'scenario-c-withholding', paymentId: data.payments[0].id, ...calculation }); data.activityLogs.push({ ownerType: 'manager', action: 'payment_completed' }); data.timelineStep = '지급 완료' }
  }
  if (id === 'scenario-d') {
    const attempts: Array<[string, string, ScenarioAction, boolean]> = [
      ['타인 지급요청 메뉴·Route Guard', otherManager.id, 'view_campaign', false],
      ['허수정 대표 승인 저장 함수', reviewer.id, 'approve_payment', false],
      ['대표 지급 완료 저장 함수', ceo.id, 'complete_payment', false],
      ['비지정 정산 담당 증빙 최종 검수 저장 함수', secondaryOperator.id, 'review_evidence', false],
    ]
    const [label, userId, action, expected] = attempts[stepIndex]
    let allowed = true
    try { requireAction(data, userId, action) } catch { allowed = false }
    data.permissionChecks.push({ label, allowed, expected, detail: allowed ? '실행 함수 통과' : '403 · 메뉴/버튼 숨김 및 저장 호출 차단' })
    if (stepIndex === 0) {
      data.permissionChecks.push(
        { label: '타인 지급요청 메뉴 숨김', allowed, expected, detail: '담당 Campaign이 아니므로 메뉴 액션 미노출' },
        { label: '타인 지급요청 URL 직접 접근 403', allowed, expected, detail: 'Route 소유권 검사에서 차단' },
        { label: '타인 지급 데이터 미노출', allowed, expected, detail: 'ownerManagerId 범위 밖 데이터 필터링' },
      )
    }
  }
  if (id === 'scenario-e') {
    if (stepIndex === 0) data.evidence.push(
      { id: 'scenario-e-seller-evidence', ownerType: 'seller', revision: 1, status: 'review_pending' },
      { id: 'scenario-e-manager-evidence', ownerType: 'manager', revision: 1, status: 'review_pending' },
    )
    if (stepIndex === 1) { data.evidence.find((item) => item.ownerType === 'seller')!.status = 'approved'; data.activityLogs.push({ ownerType: 'seller', action: 'evidence_approved' }) }
    if (stepIndex === 2) { addPayment(data, 'seller', 533_120); addPayment(data, 'manager', 468_675) }
    if (stepIndex === 3) { data.payments.find((item) => item.ownerType === 'seller')!.status = 'approved'; data.activityLogs.push({ ownerType: 'seller', action: 'payment_approved' }) }
    if (stepIndex === 4) data.timelineStep = '독립 상태 확인'
  }
  return data
}

function buildAssertions(session: OperationalScenarioSession): ScenarioAssertionResult[] {
  const data = session.data
  if (session.currentStep === 0) return []
  const lastStepId = operationalScenarioDefinitions.find((item) => item.id === session.scenarioId)!.steps[Math.min(session.currentStep - 1, operationalScenarioDefinitions.find((item) => item.id === session.scenarioId)!.steps.length - 1)].id
  let checks: ScenarioAssertionResult[] = []
  if (session.scenarioId === 'scenario-a') checks = [
    assertPermission('본인 Campaign 접근', true, can(manager.id, 'view_campaign', data.ownerManagerId), '메뉴 및 Route 접근 범위'),
    assertEvidenceStatus(data.evidence[0]?.status ?? '미생성', session.currentStep < 2 ? '미생성' : session.currentStep < 3 ? 'review_pending' : 'approved'),
    assertPaymentStatus(data.payments[0]?.status ?? '미생성', session.currentStep < 4 ? '미생성' : session.currentStep < 5 ? 'approval_pending' : session.currentStep < 6 ? 'approved' : 'payment_completed'),
    assertNoDuplicatePaymentRequest(data.payments.length),
  ]
  if (session.scenarioId === 'scenario-a' && session.currentStep === 6) checks.push(
    assertTimelineStep(data.timelineStep, '지급 완료'),
    assertValue('지급 가능 체크리스트', data.checklistReady, true),
    assertActivityLogCreated(data.activityLogs.map((item) => item.action), ['campaign_viewed', 'evidence_approved', 'payment_requested', 'payment_approved', 'payment_completed']),
    assertValue('허수정 My Work 완료', data.workItems[0]?.status, 'completed'),
  )
  if (session.scenarioId === 'scenario-b') checks = [
    assertValue('Revision 1 유지', data.evidence.some((item) => item.revision === 1), true),
    assertValue('Revision 증가', data.evidence.at(-1)?.revision ?? 0, session.currentStep < 3 ? 1 : 2),
  ]
  if (session.scenarioId === 'scenario-b' && session.currentStep >= 2) checks.push(assertValue('반려 사유 저장', data.evidence[0]?.rejectionReason ?? '미저장', '발행 금액을 확인할 수 없습니다.'))
  if (session.scenarioId === 'scenario-b' && session.currentStep === 7) checks.push(
    assertEvidenceStatus(data.evidence[1]?.status, 'approved'), assertPaymentStatus(data.payments[0]?.status, 'payment_completed'),
    assertValue('재업로드 Work Item 생성', data.workItems[0]?.type, 'evidence_reupload'),
  )
  if (session.scenarioId === 'scenario-c') {
    const calculation = calculateWithholding(533_120)
    checks = [
      assertValue('기준금액', calculation.withholdingBaseAmount, 484_655),
      assertValue('소득세 3% · 10원 미만 절사', calculation.incomeTaxAmount, 14_530),
      assertValue('지방소득세 0.3% · 10원 미만 절사', calculation.localIncomeTaxAmount, 1_450),
      assertValue('총 원천세', calculation.totalWithholdingTaxAmount, 15_980),
      assertValue('최종 지급액', calculation.finalPaymentAmount, 468_675),
    ]
    if (session.currentStep >= 2) checks.push(assertWithholdingItemCreated(data.withholdingItems.length), assertNoDuplicateWithholdingItem(data.withholdingItems.length))
  }
  if (session.scenarioId === 'scenario-d') checks = data.permissionChecks.map((item) => assertPermission(item.label, item.allowed, item.expected, item.detail))
  if (session.scenarioId === 'scenario-e' && session.currentStep === 5) {
    const sellerEvidence = data.evidence.find((item) => item.ownerType === 'seller')!
    const managerEvidence = data.evidence.find((item) => item.ownerType === 'manager')!
    const sellerPayment = data.payments.find((item) => item.ownerType === 'seller')!
    const managerPayment = data.payments.find((item) => item.ownerType === 'manager')!
    checks = [
      assertOwnerIsolation('evidenceId 분리', sellerEvidence.id !== managerEvidence.id, `${sellerEvidence.id} / ${managerEvidence.id}`),
      assertOwnerIsolation('검수 상태 분리', sellerEvidence.status !== managerEvidence.status, `${sellerEvidence.status} / ${managerEvidence.status}`),
      assertOwnerIsolation('paymentRequestId 분리', sellerPayment.id !== managerPayment.id, `${sellerPayment.id} / ${managerPayment.id}`),
      assertOwnerIsolation('지급금액 분리', sellerPayment.amount !== managerPayment.amount, `${sellerPayment.amount}원 / ${managerPayment.amount}원`),
      assertOwnerIsolation('대표 승인 상태 분리', sellerPayment.status !== managerPayment.status, `${sellerPayment.status} / ${managerPayment.status}`),
      assertOwnerIsolation('Activity Log 분리', data.activityLogs.some((item) => item.ownerType === 'seller') && data.activityLogs.some((item) => item.ownerType === 'manager'), 'ownerType별 로그 존재'),
    ]
  }
  return checks.map((check) => ({ ...check, stepId: lastStepId }))
}

function assertRunnable() {
  if (!import.meta.env.DEV) throw new Error('운영 시나리오는 개발 모드에서만 실행할 수 있습니다.')
  const supabaseMode = Boolean(import.meta.env.VITE_SUPABASE_URL?.trim() && import.meta.env.VITE_SUPABASE_ANON_KEY?.trim())
  if (supabaseMode) throw new Error('Supabase 모드에서는 테스트 데이터를 생성하지 않습니다. Local 모드에서 실행해주세요.')
}

function readSessions() {
  if (typeof localStorage === 'undefined') return [] as OperationalScenarioSession[]
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]') as OperationalScenarioSession[] } catch { return [] }
}

function saveSession(session: OperationalScenarioSession) {
  if (typeof localStorage !== 'undefined') {
    const sessions = readSessions()
    localStorage.setItem(STORAGE_KEY, JSON.stringify([session, ...sessions.filter((item) => item.scenarioId !== session.scenarioId)]))
  }
  return session
}

export function runOperationalScenarioRegression(scenarioId: OperationalScenarioId) {
  const definition = operationalScenarioDefinitions.find((item) => item.id === scenarioId)!
  let session: OperationalScenarioSession = {
    scenarioId, status: 'running', currentStep: 0, data: emptyData(scenarioId), assertions: [], updatedAt: new Date().toISOString(),
  }
  definition.steps.forEach((_, index) => {
    session = { ...session, data: executeStep(session, index), currentStep: index + 1 }
    session.assertions = buildAssertions(session)
  })
  session.status = session.assertions.every((item) => item.passed) ? 'passed' : 'failed'
  return session
}

export const operationalScenarioService = {
  definitions: operationalScenarioDefinitions,
  getSessions: readSessions,
  createScenarioData(scenarioId: OperationalScenarioId) {
    assertRunnable()
    return saveSession({ scenarioId, status: 'not_run', currentStep: 0, data: emptyData(scenarioId), assertions: [], updatedAt: new Date().toISOString() })
  },
  runNextStep(scenarioId: OperationalScenarioId) {
    assertRunnable()
    const definition = operationalScenarioDefinitions.find((item) => item.id === scenarioId)!
    const session = readSessions().find((item) => item.scenarioId === scenarioId) ?? this.createScenarioData(scenarioId)
    if (session.currentStep >= definition.steps.length) return session
    const next: OperationalScenarioSession = { ...session, status: 'running', data: executeStep(session, session.currentStep), currentStep: session.currentStep + 1, updatedAt: new Date().toISOString() }
    next.assertions = buildAssertions(next)
    if (next.currentStep === definition.steps.length) next.status = next.assertions.every((item) => item.passed) ? 'passed' : 'failed'
    return saveSession(next)
  },
  runAll(scenarioId: OperationalScenarioId) {
    this.createScenarioData(scenarioId)
    const definition = operationalScenarioDefinitions.find((item) => item.id === scenarioId)!
    let session: OperationalScenarioSession | undefined
    definition.steps.forEach(() => { session = this.runNextStep(scenarioId) })
    return session!
  },
  resetScenario(scenarioId: OperationalScenarioId) {
    if (typeof localStorage !== 'undefined') localStorage.setItem(STORAGE_KEY, JSON.stringify(readSessions().filter((item) => item.scenarioId !== scenarioId)))
  },
  resetAllResults() {
    if (typeof localStorage !== 'undefined') localStorage.removeItem(STORAGE_KEY)
  },
  getCalculationLog() { return calculateWithholding(533_120).log },
}
