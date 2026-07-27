import { useState } from 'react'
import { getDataProviderMode } from '../../shared/lib/dataProvider'
import { isSupabaseConfigured } from '../../shared/lib/supabase'
import { SUPABASE_PILOT_STEPS, supabasePilotService, type PilotStepResult } from '../../shared/services/supabasePilotService'

export function SupabasePilotPage() {
  const [state, setState] = useState(() => supabasePilotService.getState())
  const [file, setFile] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const [cleanupReport, setCleanupReport] = useState<Array<{ target: string; deleted: boolean; message: string }>>([])
  const run = async (action: () => Promise<typeof state>) => { setBusy(true); try { setState(await action()) } finally { setBusy(false) } }
  const success = state.results.filter((item) => item.status === 'success' || item.status === 'duplicate').length
  const failed = state.results.filter((item) => item.status === 'failed').length
  const skipped = state.results.filter((item) => item.status === 'skipped').length
  const dbRecords = state.results.filter((item) => item.storage === 'Supabase' && (item.status === 'success' || item.status === 'duplicate') && item.createdId).length
  const finalStatus = !isSupabaseConfigured() ? '실행 불가' : failed ? '일부 실패' : state.results.length === SUPABASE_PILOT_STEPS.length && !skipped ? '파일럿 성공' : '진행 전'
  return <section className="supabase-pilot-page">
    <header className="workspace-hero scenario-hero"><div><p className="page-eyebrow">Development only · Supabase Pilot</p><h1>Supabase 파일럿 테스트</h1><p>소량의 `[TEST]` 데이터만 실제 Supabase에 저장하고 다시 조회합니다.</p></div><span className={`status-badge ${finalStatus === '파일럿 성공' ? 'done' : failed ? 'error' : 'waiting'}`}>{finalStatus}</span></header>
    <section className="workspace-card pilot-safety-card"><strong>현재 데이터 모드: {getDataProviderMode()}</strong><span>testRunId: {state.testRunId}</span><p>전체 localStorage 마이그레이션과 SQL 자동 실행은 하지 않습니다. 실제 저장 결과는 아래 단계별 `Supabase` 표시로 구분합니다.</p></section>
    <section className="scenario-kpis">{[
      ['전체 단계', SUPABASE_PILOT_STEPS.length], ['성공', success], ['실패', failed], ['건너뜀', skipped],
      ['생성된 DB 레코드', dbRecords], ['업로드된 파일', state.storagePath ? 1 : 0], ['정리 대상 데이터', dbRecords + (state.storagePath ? 1 : 0)],
    ].map(([label, value]) => <article key={label}><span>{label}</span><strong>{value}</strong></article>)}</section>
    <section className="workspace-card">
      <div className="section-heading"><div><h2>실제 증빙파일</h2><p>PNG, JPEG, WebP, PDF · 최대 10MB. 파일을 선택하지 않으면 업로드 단계는 성공 처리하지 않습니다.</p></div></div>
      <input accept="image/png,image/jpeg,image/webp,application/pdf" onChange={(event) => setFile(event.target.files?.[0] ?? null)} type="file" />
      {file && <p>{file.name} · {(file.size / 1024 / 1024).toFixed(2)}MB · {file.type}</p>}
      {state.signedUrl && <PilotPreview url={state.signedUrl} fileType={file?.type} />}
    </section>
    <section className="workspace-card">
      <div className="button-row">
        <button className="primary-button" disabled={busy || !isSupabaseConfigured()} onClick={() => run(() => supabasePilotService.runAll(file ?? undefined))}>전체 파일럿 실행</button>
        <button className="secondary-button" disabled={busy || !isSupabaseConfigured()} onClick={() => run(() => supabasePilotService.runNext(state.nextStep === 5 ? file ?? undefined : undefined))}>다음 단계 실행</button>
        <button className="secondary-button" onClick={() => setState(supabasePilotService.createNewRun())}>새 testRunId</button>
        <button className="secondary-button" disabled={busy || !isSupabaseConfigured()} onClick={() => run(async () => { await supabasePilotService.runStep(9); return supabasePilotService.refreshSignedUrl() })}>파일럿 데이터 조회</button>
        <button className="danger-button" disabled={busy || !isSupabaseConfigured()} onClick={async () => { if (!window.confirm(`현재 testRunId(${state.testRunId})의 파일럿 데이터만 삭제합니다. 계속할까요?`)) return; setBusy(true); try { setCleanupReport(await supabasePilotService.cleanup()) } finally { setBusy(false) } }}>파일럿 데이터 정리</button>
      </div>
      {!isSupabaseConfigured() && <p className="payment-notice">환경변수 없음 · `.env.local` 설정 전에는 실제 네트워크 테스트를 실행할 수 없습니다.</p>}
    </section>
    <section className="workspace-card">
      <h2>단계별 실행</h2><div className="pilot-step-buttons">{SUPABASE_PILOT_STEPS.map((label, index) => <button className="secondary-button" disabled={busy || !isSupabaseConfigured()} key={label} onClick={() => run(() => supabasePilotService.runStep(index + 1, index === 4 ? file ?? undefined : undefined))}>{index + 1}. {label}</button>)}</div>
    </section>
    <section className="workspace-card"><h2>파일럿 결과</h2><div className="responsive-table"><table><thead><tr><th>단계</th><th>대상</th><th>생성 ID</th><th>저장 위치</th><th>실행 상태</th><th>검증 결과</th><th>오류</th><th>실행 시간</th></tr></thead><tbody>{SUPABASE_PILOT_STEPS.map((label, index) => <ResultRow key={label} step={index + 1} label={label} result={state.results.find((item) => item.step === index + 1)} />)}</tbody></table></div></section>
    {cleanupReport.length > 0 && <section className="workspace-card"><h2>정리 결과</h2>{cleanupReport.map((item) => <p className={item.deleted ? 'success-panel' : 'payment-notice'} key={item.target}>{item.deleted ? '✓' : '⚠'} {item.target} · {item.message}</p>)}</section>}
  </section>
}

function ResultRow({ step, label, result }: { step: number; label: string; result?: PilotStepResult }) {
  return <tr><td>{step}</td><td>{label}</td><td>{result?.createdId ?? '-'}</td><td>{result?.storage ?? '-'}</td><td><span className={`status-badge ${result?.status === 'success' || result?.status === 'duplicate' ? 'done' : result?.status === 'failed' ? 'error' : 'waiting'}`}>{result?.status ?? 'pending'}</span></td><td>{result?.verification ?? '미실행'}</td><td className="danger-text">{result?.error ?? '-'}</td><td>{result ? new Date(result.executedAt).toLocaleString('ko-KR') : '-'}</td></tr>
}

function PilotPreview({ url, fileType }: { url: string; fileType?: string }) {
  if (fileType === 'application/pdf') return <iframe className="pilot-preview" src={url} title="Supabase 파일럿 PDF 미리보기" />
  return <img className="pilot-preview" src={url} alt="Supabase signed URL 파일럿 미리보기" />
}
