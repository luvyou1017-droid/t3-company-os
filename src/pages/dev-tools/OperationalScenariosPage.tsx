import { useState } from 'react'
import {
  getOperationalScenarioUser,
  operationalScenarioDefinitions,
  operationalScenarioService,
  type OperationalScenarioId,
  type OperationalScenarioSession,
} from '../../shared/dev/operationalScenarios'

const statusLabels = { not_run: '미실행', running: '진행중', passed: '성공', failed: '실패' } as const

export function OperationalScenariosPage() {
  const [, setRevision] = useState(0)
  const [error, setError] = useState('')
  const sessions = operationalScenarioService.getSessions()
  const sessionById = (id: OperationalScenarioId) => sessions.find((item) => item.scenarioId === id)
  const run = (action: () => unknown) => {
    try { setError(''); action(); setRevision((value) => value + 1) }
    catch (caught) { setError(caught instanceof Error ? caught.message : '시나리오 실행에 실패했습니다.') }
  }
  const allAssertions = sessions.flatMap((session) => session.assertions)
  const passedCount = sessions.filter((session) => session.status === 'passed').length
  const failedCount = sessions.filter((session) => session.status === 'failed').length
  const passRate = allAssertions.length ? Math.round(allAssertions.filter((item) => item.passed).length / allAssertions.length * 100) : 0

  return <section className="operational-scenarios-page">
    <header className="workspace-hero scenario-hero">
      <div><p className="page-eyebrow">Development Only · Local Mode</p><h1>운영 시나리오 테스트</h1><p>역할별 지급 운영 흐름을 실제 데이터와 분리된 Mock 데이터로 단계별 검증합니다.</p></div>
      <div className="button-row"><button className="secondary-button" onClick={() => run(() => operationalScenarioService.resetAllResults())}>결과 초기화</button><button className="primary-button" onClick={() => run(() => operationalScenarioDefinitions.forEach((scenario) => operationalScenarioService.runAll(scenario.id)))}>전체 시나리오 실행</button></div>
    </header>
    {error && <p className="scenario-error" role="alert">⚠ {error}</p>}
    <section className="scenario-kpis" aria-label="시나리오 결과 요약">
      {[
        ['전체 시나리오', operationalScenarioDefinitions.length],
        ['성공', passedCount],
        ['실패', failedCount],
        ['미실행', operationalScenarioDefinitions.length - passedCount - failedCount],
        ['전체 검증 항목', allAssertions.length],
        ['통과율', `${passRate}%`],
      ].map(([label, value]) => <article key={label}><span>{label}</span><strong>{value}</strong></article>)}
    </section>
    <div className="scenario-list">
      {operationalScenarioDefinitions.map((definition) => <ScenarioCard key={definition.id} definition={definition} session={sessionById(definition.id)} onRun={run} />)}
    </div>
  </section>
}

function ScenarioCard({ definition, session, onRun }: {
  definition: (typeof operationalScenarioDefinitions)[number]
  session?: OperationalScenarioSession
  onRun: (action: () => unknown) => void
}) {
  const currentStep = session ? definition.steps[Math.min(session.currentStep, definition.steps.length - 1)] : definition.steps[0]
  const currentUser = getOperationalScenarioUser(currentStep.userId)
  const passed = session?.assertions.filter((item) => item.passed).length ?? 0
  return <article className={`workspace-card scenario-card is-${session?.status ?? 'not_run'}`}>
    <header><div><p className="page-eyebrow">{definition.id.toUpperCase()}</p><h2>{definition.name}</h2><p>{definition.purpose}</p></div><span className={`status-badge ${session?.status === 'passed' ? 'done' : session?.status === 'failed' ? 'error' : session?.status === 'running' ? 'progress' : 'waiting'}`}>{session?.status === 'passed' ? '✓ ' : session?.status === 'failed' ? '✕ ' : '● '}{statusLabels[session?.status ?? 'not_run']}</span></header>
    <div className="scenario-expected"><span>예상 결과</span><strong>{definition.expectedResult}</strong></div>
    <div className="scenario-user-strip"><div><span>현재 사용자</span><strong>{currentUser?.name}</strong></div><div><span>역할</span><strong>{currentStep.role}</strong></div><div><span>실행 가능 버튼</span><strong>{session?.currentStep === definition.steps.length ? '시나리오 완료' : currentStep.availableAction}</strong></div></div>
    <ol className="scenario-steps">{definition.steps.map((step, index) => <li className={session && index < session.currentStep ? 'is-complete' : session?.currentStep === index ? 'is-current' : ''} key={step.id}><span>{session && index < session.currentStep ? '✓' : index + 1}</span><div><strong>{step.label}</strong><small>{getOperationalScenarioUser(step.userId)?.name} · {step.role}</small></div></li>)}</ol>
    <div className="scenario-actions button-row">
      <button className="secondary-button" onClick={() => onRun(() => operationalScenarioService.createScenarioData(definition.id))}>시나리오 데이터 생성</button>
      <button className="secondary-button" disabled={session?.currentStep === definition.steps.length} title={session?.currentStep === definition.steps.length ? '모든 단계를 실행했습니다.' : undefined} onClick={() => onRun(() => operationalScenarioService.runNextStep(definition.id))}>단계별 실행</button>
      <button className="primary-button" onClick={() => onRun(() => operationalScenarioService.runAll(definition.id))}>전체 실행</button>
      <button className="text-button" onClick={() => onRun(() => operationalScenarioService.resetScenario(definition.id))}>초기화</button>
    </div>
    <section className="scenario-results">
      <div className="section-heading"><div><h3>실제 결과</h3><p>{session ? `${session.currentStep}/${definition.steps.length}단계 · 검증 ${passed}/${session.assertions.length} 통과` : '아직 실행하지 않았습니다.'}</p></div></div>
      {definition.id === 'scenario-c' && session && <div className="scenario-calculation-log">{operationalScenarioService.getCalculationLog().map((line) => <code key={line}>{line}</code>)}</div>}
      {session?.assertions.length ? <div className="scenario-assertions">{session.assertions.map((assertion) => <div className={assertion.passed ? 'is-passed' : 'is-failed'} key={`${assertion.stepId}-${assertion.name}`}><span>{assertion.passed ? '✓' : '✕'}</span><div><strong>{assertion.name}</strong><small>예상: {assertion.expected}</small><small>실제: {assertion.actual}</small>{assertion.message && <small>{assertion.message}</small>}</div><em>{assertion.stepId}</em></div>)}</div> : <p className="workspace-empty">단계를 실행하면 자동 검증 결과가 표시됩니다.</p>}
    </section>
  </article>
}
