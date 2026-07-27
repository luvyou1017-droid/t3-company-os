import { useState } from 'react'
import { getDataProviderMode } from '../../shared/lib/dataProvider'
import { isSupabaseConfigured } from '../../shared/lib/supabase'
import { dataMigrationService } from '../../shared/services/dataMigrationService'
import { supabaseHealthService, type ConnectionCheck } from '../../shared/services/supabaseHealthService'

const labels = {
  campaigns: 'Campaign', settlements: 'Settlement', paymentRequests: 'Payment Request',
  paymentEvidence: 'Evidence', withholdingTax: 'Withholding Tax',
}

export function DataConnectionCard() {
  const counts = dataMigrationService.getLocalCounts()
  const [message, setMessage] = useState('연결 성공과 실제 Supabase 저장 성공은 별도입니다. 자동 마이그레이션은 실행하지 않습니다.')
  const [checks, setChecks] = useState<ConnectionCheck[]>([])
  const [preview, setPreview] = useState<Array<{ entity: keyof typeof labels; localCount: number; duplicateCount: number; newCount: number; available: boolean }>>([])
  const mode = getDataProviderMode()
  const config = supabaseHealthService.getConfiguration()
  const run = async (action: () => Promise<ConnectionCheck[]>) => {
    const result = await action(); setChecks((current) => [...current.filter((item) => !result.some((next) => next.target === item.target)), ...result]); setMessage(result.every((item) => item.status === 'success') ? '연결 및 조회 권한 확인 성공 · 실제 저장은 파일럿 화면에서 별도로 검증하세요.' : result.find((item) => item.status !== 'success')?.message ?? '확인 완료')
  }
  const latest = checks.map((item) => item.checkedAt).sort().at(-1)
  const importantTargets = ['database', 'session', 'payment-evidence', 'campaigns', 'payment_requests', 'payment_evidence', 'withholding_tax_items']
  return <section className="panel data-connection-card">
    <div className="panel__header"><div><p className="page-eyebrow">Development only</p><h2>데이터 연결 상태</h2><p>현재 저장 위치: <strong>{mode === 'supabase' ? 'Supabase' : 'Local 저장'}</strong></p></div><span className={`status-badge ${mode === 'supabase' ? 'done' : 'waiting'}`}>{mode}</span></div>
    <div className="connection-status-grid">
      <Status label="Supabase URL" value={config.urlConfigured ? '설정됨' : '환경변수 없음'} ok={config.urlConfigured} />
      <Status label="Anon Key" value={config.anonKeyConfigured ? '설정됨' : '환경변수 없음'} ok={config.anonKeyConfigured} />
      {importantTargets.map((target) => {
        const check = checks.find((item) => item.target === target)
        return <Status key={target} label={target === 'payment-evidence' ? 'Storage bucket' : target} value={check ? check.message : '미확인'} ok={check?.status === 'success'} neutral={!check || check.status === 'not_configured'} />
      })}
      <Status label="마지막 연결 확인" value={latest ? new Date(latest).toLocaleString('ko-KR') : '미확인'} neutral />
    </div>
    <details><summary>Local 데이터 및 마이그레이션 미리보기</summary><div className="payment-detail-sections">{Object.entries(counts).map(([key, count]) => <div key={key}><span>{labels[key as keyof typeof labels]} 건수</span><strong>{count}</strong></div>)}</div>
      {preview.length > 0 && <div className="migration-preview">{preview.map((item) => <p key={item.entity}><strong>{labels[item.entity]}</strong> · Local {item.localCount} · 중복 {item.duplicateCount} · 신규 {item.newCount}</p>)}</div>}
    </details>
    <p className="payment-notice">{message}</p>
    <div className="button-row">
      <button className="secondary-button" onClick={() => run(() => supabaseHealthService.checkSupabaseHealth())} type="button">연결 테스트</button>
      <button className="secondary-button" onClick={() => run(() => supabaseHealthService.checkRequiredTables())} type="button">테이블 접근 테스트</button>
      <button className="secondary-button" onClick={() => run(async () => [await supabaseHealthService.checkStorageBucket()])} type="button">Storage 접근 테스트</button>
      <button className="secondary-button" onClick={async () => { const result = await dataMigrationService.getMigrationPreview(); setPreview(result); setMessage(result[0]?.available ? '미리보기 완료 · 사용자 확인 없이 마이그레이션하지 않습니다.' : 'Local 데이터만 집계했습니다.') }} type="button">마이그레이션 미리보기</button>
      <button className="text-button" onClick={() => { setChecks([]); setPreview([]); setMessage('테스트 결과를 초기화했습니다. 데이터는 삭제하지 않았습니다.') }} type="button">테스트 결과 초기화</button>
    </div>
    {!isSupabaseConfigured() && <p className="connection-safe-notice">환경변수가 없어 기존 localStorage 모드가 유지됩니다. Supabase 저장 성공으로 표시하지 않습니다.</p>}
  </section>
}

function Status({ label, value, ok, neutral }: { label: string; value: string; ok?: boolean; neutral?: boolean }) {
  return <div className={neutral ? 'is-neutral' : ok ? 'is-success' : 'is-failed'}><span>{label}</span><strong>{ok ? '✓ ' : neutral ? '● ' : '✕ '}{value}</strong></div>
}
