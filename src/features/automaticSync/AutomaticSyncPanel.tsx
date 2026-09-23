import { useEffect, useState } from 'react'
import { useCompanyAuth } from '../auth/AuthGate'
import { automaticSyncService } from './service'
import { ScheduleCandidateReview } from './ScheduleCandidateReview'
import { candidateContext, prepareCandidate, saveCandidate } from './candidateOperations'
import type { Change, SyncJob } from './model'
import './automaticSync.css'

const date = (value?: string) => value ? new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)) : '기록 없음'
const stateLabel: Record<Change['state'], string> = { 기존: '기존 일치', 조건변경: '기존 변경 있음', 신규: '신규 일정', 확인필요: '확인 필요', 등록제외: '등록 제외' }
export function AutomaticSyncPanel() {
  const { profile } = useCompanyAuth()
  const allowed = profile.role === 'ceo' || profile.role === 'admin'
  const [job, setJob] = useState<SyncJob | undefined>()
  const [busy, setBusy] = useState<'status' | 'run' | 'apply' | 'exclude' | null>(null)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [filter, setFilter] = useState<Change['state'] | null>(null)
  const [selected, setSelected] = useState<string[]>([])
  const lastRun = job?.runs[0]
  const latest = lastRun?.counts.scopeApplied === 1 ? lastRun : undefined
  async function refresh() {
    setBusy('status')
    try { setJob((await automaticSyncService.status()).find(x => x.kind === 'campaign')); setError('') }
    catch (e) { setError(e instanceof Error ? e.message : '현황 조회 실패') }
    finally { setBusy(null) }
  }
  useEffect(() => { if (allowed) void Promise.resolve().then(refresh) }, [allowed])
  if (!allowed) return null
  async function run() {
    setBusy('run'); setError(''); setMessage(''); setFilter(null); setSelected([])
    try {
      await automaticSyncService.run('campaign')
      setMessage('Notion 일정 조회 및 후보 분류가 완료됐습니다. 일정은 저장되지 않았습니다.')
      try { setJob((await automaticSyncService.status()).find(x => x.kind === 'campaign')) }
      catch { setError('동기화 실행은 완료됐지만 현황 갱신에 실패했습니다. 현황 새로고침을 눌러주세요.') }
    } catch (e) {
      setError(e instanceof Error ? e.message : '동기화 실패')
      try { setJob((await automaticSyncService.status()).find(x => x.kind === 'campaign')) } catch { /* keep last result */ }
    } finally { setBusy(null) }
  }
  const count = (state: Change['state']) => latest?.changes.filter(change => change.entity === '일정' && change.state === state).length ?? 0
  const visible = latest?.changes.filter(change => change.entity === '일정' && (!filter || change.state === filter)) ?? []
  const actionable = visible.filter(change => ['신규', '조건변경', '확인필요'].includes(change.state))
  const selectedChanges = actionable.filter(change => selected.includes(change.id))
  const toggle = (id: string) => setSelected(current => current.includes(id) ? current.filter(x => x !== id) : [...current, id])
  async function applySelected(state: '신규' | '조건변경') {
    const targets = selectedChanges.filter(change => change.state === state)
    if (!targets.length) return
    setBusy('apply'); setError(''); setMessage('')
    let done = 0; const skipped: string[] = []
    try {
      const context = await candidateContext()
      for (const change of targets) {
        try {
          const prepared = prepareCandidate(change, context)
          if (!prepared.safe) { skipped.push(`${change.name}: 필수 연결/충돌 확인 필요`); continue }
          await saveCandidate(change, prepared.candidate)
          done++
          context.campaigns.push(prepared.candidate)
        } catch (error) { skipped.push(`${change.name}: ${error instanceof Error ? error.message : '반영 실패'}`) }
      }
      setMessage(`${state === '조건변경' ? '변경 반영' : '신규 등록'} ${done}건 · 확인 필요 ${skipped.length}건${skipped.length ? ` · ${skipped.join(' / ')}` : ''}`)
      setSelected([])
      if (done) setJob((await automaticSyncService.status()).find(x => x.kind === 'campaign'))
    } catch (error) { setError(error instanceof Error ? error.message : '일괄 반영 실패') }
    finally { setBusy(null) }
  }
  async function excludeSelected() {
    const targets = selectedChanges.filter(change => change.state === '확인필요')
    if (!targets.length) return
    const reason = window.prompt(`선택한 ${targets.length}건을 T3에 등록하지 않습니다. 제외 사유(선택):`, '')
    if (reason === null) return
    setBusy('exclude'); setError(''); setMessage('')
    try {
      await automaticSyncService.exclude(targets.map(change => change.id), reason)
      setSelected([]); setMessage(`${targets.length}건 등록 제외 완료 · 처리 이력이 보존됩니다.`)
      setJob((await automaticSyncService.status()).find(x => x.kind === 'campaign'))
    } catch (error) { setError(error instanceof Error ? error.message : '등록 제외 실패') }
    finally { setBusy(null) }
  }
  return <section className="auto-sync-panel">
    <div className="auto-sync-heading"><div><h2>Notion 일정 동기화</h2><p>2026년 8월 1일 이후 시작 일정만 조회 → 기존 일정 비교 → 후보 검토. 수동 실행과 월요일 09:00(한국시간) 자동 실행은 같은 서버 로직을 사용합니다.</p></div><button type="button" className="secondary-button" disabled={Boolean(busy)} onClick={() => void refresh()}>{busy === 'status' ? '현황 확인 중…' : '현황 새로고침'}</button><button className="primary-button" disabled={Boolean(busy) || job?.configured === false} onClick={() => void run()}>{busy === 'run' ? '동기화 중…' : 'Notion 일정 동기화'}</button></div>
    {error && <p role="alert" className="auto-sync-error">{error}</p>}
    {message && <p role="status">{message}</p>}
    {job?.configuration_error && <p role="alert">{job.configuration_error}</p>}
    {lastRun && !latest && <p role="status">이전 실행 기록은 8월 이후 범위가 적용되기 전 자료입니다. 새 범위로 다시 동기화하면 분류 결과가 표시됩니다.</p>}
    <dl><dt>최근 실행일시</dt><dd>{date(latest?.started_at)}</dd><dt>실행 방식</dt><dd>{latest ? latest.trigger === 'manual' ? '수동' : '자동' : '기록 없음'}</dd><dt>마지막 결과</dt><dd>{latest ? { running: '진행 중', succeeded: '성공', failed: '실패' }[latest.status] : '기록 없음'}{latest?.error && ` · ${latest.error}`}</dd><dt>마지막 성공</dt><dd>{date(job?.last_success_at)}</dd><dt>다음 실행 예정</dt><dd>{job?.scheduled && job.configured ? date(job.next_run) : '자동 실행 미확인'}</dd></dl>
    {latest && <><p>Notion 조회: {latest.counts.checked ?? 0}건 · 기존 일치: {count('기존')}건 · 기존 변경 있음: {count('조건변경')}건 · 신규 일정: {count('신규')}건 · 확인 필요: {count('확인필요')}건 · 등록 제외: {count('등록제외')}건</p>
      <p>실제 반영 대상: 변경 {count('조건변경')}건 · 신규 {count('신규')}건. 조회만으로는 일정이 저장되지 않습니다.</p>
      <div className="notion-import-actions"><button type="button" disabled={!count('신규')} onClick={() => { setFilter('신규'); setSelected([]) }}>신규 {count('신규')}건</button><button type="button" disabled={!count('조건변경')} onClick={() => { setFilter('조건변경'); setSelected([]) }}>변경 {count('조건변경')}건</button><button type="button" disabled={!count('확인필요')} onClick={() => { setFilter('확인필요'); setSelected([]) }}>확인 필요 {count('확인필요')}건</button><button type="button" disabled={!count('등록제외')} onClick={() => { setFilter('등록제외'); setSelected([]) }}>등록 제외 {count('등록제외')}건</button>{filter && <button type="button" onClick={() => { setFilter(null); setSelected([]) }}>전체 보기</button>}</div>
      <div className="notion-import-actions"><button type="button" disabled={Boolean(busy) || !selectedChanges.some(change => change.state === '신규')} onClick={() => void applySelected('신규')}>선택 신규 일정 등록</button><button type="button" disabled={Boolean(busy) || !selectedChanges.some(change => change.state === '조건변경')} onClick={() => void applySelected('조건변경')}>선택 변경 일정 반영</button><button type="button" disabled={Boolean(busy) || !selectedChanges.some(change => change.state === '확인필요')} onClick={() => void excludeSelected()}>선택 일정 등록 안 함</button>{busy === 'apply' && <span role="status">안전 조건 확인 및 반영 중…</span>}{busy === 'exclude' && <span role="status">제외 이력 저장 중…</span>}</div>
      <p>애매한 후보는 개별 검토 후 등록합니다. 일치 일정과 등록 제외 일정은 반영 대상이 아닙니다.</p>
      <div className="auto-sync-table"><table><thead><tr><th><input aria-label="현재 표시된 처리 대상 전체 선택" type="checkbox" checked={actionable.length > 0 && actionable.every(change => selected.includes(change.id))} onChange={e => setSelected(e.target.checked ? actionable.map(change => change.id) : [])} /></th><th>분류</th><th>일정</th><th>변경 전 → 변경 후 / 후속 업무</th><th>검토</th></tr></thead><tbody>{visible.map(change => <tr key={change.id}><td>{['신규', '조건변경', '확인필요'].includes(change.state) && <input aria-label={`${change.name} 선택`} type="checkbox" checked={selected.includes(change.id)} onChange={() => toggle(change.id)} />}</td><td>{stateLabel[change.state]}</td><td>{change.name}{change.source?.cancelled && <p>등록 제외 후보 · 취소 표시</p>}</td><td>{change.reason}{change.differences.map((diff, index) => <div key={index}>{({ campaignName: '일정명', startDate: '시작일', endDate: '종료일' } as Record<string, string>)[diff.label] ?? diff.label}: {String(diff.before ?? '없음')} → {String(diff.after ?? '없음')}</div>)}</td><td>{!['기존', '등록제외'].includes(change.state) && <ScheduleCandidateReview change={change} />}</td></tr>)}</tbody></table></div>
    </>}
  </section>
}
