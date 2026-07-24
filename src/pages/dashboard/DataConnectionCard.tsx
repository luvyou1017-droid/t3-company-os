import { useState } from 'react'
import { getDataProviderMode } from '../../shared/lib/dataProvider'
import { isSupabaseConfigured } from '../../shared/lib/supabase'
import { dataMigrationService } from '../../shared/services/dataMigrationService'

const labels = {
  campaigns: 'Campaign',
  settlements: 'Settlement',
  paymentRequests: 'Payment Request',
  paymentEvidence: 'Evidence',
  withholdingTax: 'Withholding Tax',
}

export function DataConnectionCard() {
  const counts = dataMigrationService.getLocalCounts()
  const [message, setMessage] = useState('자동 마이그레이션은 실행하지 않습니다.')
  const [preview, setPreview] = useState<Array<{ entity: keyof typeof labels; localCount: number; duplicateCount: number; newCount: number; available: boolean }>>([])
  const mode = getDataProviderMode()
  return <section className="panel data-connection-card">
    <div className="panel__header"><div><p className="page-eyebrow">Development only</p><h2>데이터 연결 상태</h2><p>현재 모드: <strong>{mode === 'supabase' ? 'Supabase' : 'Local'}</strong> · 연결 설정: {isSupabaseConfigured() ? '완료' : '환경변수 없음'}</p></div><span className={`status-badge ${mode === 'supabase' ? 'done' : 'waiting'}`}>{mode}</span></div>
    <div className="payment-detail-sections">{Object.entries(counts).map(([key, count]) => <div key={key}><span>{labels[key as keyof typeof labels]} 건수</span><strong>{count}</strong></div>)}</div>
    {preview.length > 0 && <div className="migration-preview">{preview.map((item) => <p key={item.entity}><strong>{labels[item.entity]}</strong> · Local {item.localCount} · 중복 {item.duplicateCount} · 신규 {item.newCount}</p>)}</div>}
    <p className="payment-notice">{message}</p>
    <div className="button-row">
      <button className="secondary-button" onClick={async () => { const result = await dataMigrationService.getMigrationPreview(); setPreview(result); setMessage(result[0]?.available ? '미리보기 완료. 실제 마이그레이션은 별도 확인 후 실행해야 합니다.' : 'Supabase 환경변수가 없어 Local 데이터만 집계했습니다.') }} type="button">마이그레이션 미리보기</button>
      <button className="secondary-button" onClick={async () => setMessage((await dataMigrationService.testConnection()).message)} type="button">연결 테스트</button>
    </div>
  </section>
}
