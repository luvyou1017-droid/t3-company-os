import { useEffect, useState } from 'react'
import { useCompanyAuth } from '../auth/AuthGate'
import { automaticSyncService } from './service'
import { ScheduleCandidateReview } from './ScheduleCandidateReview'
import type { Change, SyncJob } from './model'
import './automaticSync.css'

const date = (value?: string) => value ? new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)) : '기록 없음'
const stateLabel: Record<Change['state'], string> = { 기존: '기존 일치', 조건변경: '기존 변경 있음', 신규: '신규 일정', 확인필요: '확인 필요' }
export function AutomaticSyncPanel() {
  const { profile } = useCompanyAuth()
  const allowed = profile.role === 'ceo' || profile.role === 'admin'
  const [job, setJob] = useState<SyncJob | undefined>()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [filter, setFilter] = useState<'신규' | '조건변경' | '확인필요' | null>(null)
  const lastRun = job?.runs[0]
  const latest = lastRun?.counts.scopeApplied === 1 ? lastRun : undefined
  async function refresh() {
    setBusy(true)
    try { setJob((await automaticSyncService.status()).find(x => x.kind === 'campaign')); setError('') }
    catch (e) { setError(e instanceof Error ? e.message : '현황 조회 실패') }
    finally { setBusy(false) }
  }
  useEffect(() => { if (allowed) void refresh() }, [allowed])
  if (!allowed) return null
  async function run() {
    setBusy(true); setError(''); setFilter(null)
    try { await automaticSyncService.run('campaign'); setJob((await automaticSyncService.status()).find(x => x.kind === 'campaign')) }
    catch (e) { setError(e instanceof Error ? e.message : '동기화 실패'); try { setJob((await automaticSyncService.status()).find(x => x.kind === 'campaign')) } catch { /* keep last result */ } }
    finally { setBusy(false) }
  }
  const count = (state: Change['state']) => latest?.changes.filter(change => change.entity === '일정' && change.state === state).length ?? 0
  const visible = latest?.changes.filter(change => change.entity === '일정' && (!filter || change.state === filter)) ?? []
  return <section className="auto-sync-panel">
    <div className="auto-sync-heading"><div><h2>Notion 일정 동기화</h2><p>2026년 8월 1일 이후 시작 일정만 조회 → 기존 일정 비교 → 후보 검토. 수동 실행과 월요일 09:00(한국시간) 자동 실행은 같은 서버 로직을 사용합니다.</p></div><button className="primary-button" disabled={busy || !job?.configured} onClick={() => void run()}>{busy ? '동기화 중…' : 'Notion 일정 동기화'}</button></div>
    {error && <p role="alert" className="auto-sync-error">{error}</p>}
    {job?.configuration_error && <p role="alert">{job.configuration_error}</p>}
    {lastRun && !latest && <p role="status">이전 실행 기록은 8월 이후 범위가 적용되기 전 자료입니다. 새 범위로 다시 동기화하면 분류 결과가 표시됩니다.</p>}
    <dl><dt>최근 실행일시</dt><dd>{date(latest?.started_at)}</dd><dt>실행 방식</dt><dd>{latest ? latest.trigger === 'manual' ? '수동' : '자동' : '기록 없음'}</dd><dt>마지막 결과</dt><dd>{latest ? { running: '진행 중', succeeded: '성공', failed: '실패' }[latest.status] : '기록 없음'}{latest?.error && ` · ${latest.error}`}</dd><dt>마지막 성공</dt><dd>{date(job?.last_success_at)}</dd><dt>다음 실행 예정</dt><dd>{job?.scheduled && job.configured ? date(job.next_run) : '자동 실행 미확인'}</dd></dl>
    {latest && <><p>Notion 조회: {latest.counts.checked ?? 0}건 · 기존 일치: {count('기존')}건 · 기존 변경 있음: {count('조건변경')}건 · 신규 일정: {count('신규')}건 · 확인 필요: {count('확인필요')}건</p>
      <p>실제 반영 대상: 변경 {count('조건변경')}건 · 신규 {count('신규')}건. 조회만으로는 일정이 저장되지 않습니다.</p>
      <div className="notion-import-actions"><button type="button" disabled={!count('신규')} onClick={() => setFilter('신규')}>신규 {count('신규')}건 등록</button><button type="button" disabled={!count('조건변경')} onClick={() => setFilter('조건변경')}>변경 {count('조건변경')}건 업데이트</button><button type="button" disabled={!count('확인필요')} onClick={() => setFilter('확인필요')}>확인 필요 {count('확인필요')}건 검토</button>{filter && <button type="button" onClick={() => setFilter(null)}>전체 보기</button>}</div>
      <p>각 후보에서 원본과 필수정보를 확인한 뒤 개별 반영합니다. 일치 일정은 저장 대상에서 제외합니다.</p>
      <div className="auto-sync-table"><table><thead><tr><th>분류</th><th>일정</th><th>변경 전 → 변경 후 / 후속 업무</th><th>검토</th></tr></thead><tbody>{visible.map(change => <tr key={change.id}><td>{stateLabel[change.state]}</td><td>{change.name}</td><td>{change.reason}{change.differences.map((diff, index) => <div key={index}>{({ campaignName: '일정명', startDate: '시작일', endDate: '종료일' } as Record<string, string>)[diff.label] ?? diff.label}: {String(diff.before ?? '없음')} → {String(diff.after ?? '없음')}</div>)}</td><td>{change.state !== '기존' && <ScheduleCandidateReview change={change} />}</td></tr>)}</tbody></table></div>
    </>}
  </section>
}
