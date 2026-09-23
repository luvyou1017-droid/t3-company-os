import { useMemo, useState } from 'react'
import { notionSellerSyncService } from '../../../features/sellers/notionSellerSyncService'
import type { NotionSellerDecision, NotionSellerPreview, NotionSellerSyncStatus } from '../../../features/sellers/notionSellerSyncModel'
import type { SellerMaster } from '../../../shared/services/sellerMasterService'

type Selection = { decision: NotionSellerDecision; sellerId?: string }
const labels: Record<NotionSellerSyncStatus, string> = { existing: '기존', new: '신규', changed: '정보변경', needs_review: '확인필요' }

export function NotionSellerSyncPanel({ sellers, onClose, onApplied }: { sellers: SellerMaster[]; onClose: () => void; onApplied: () => Promise<void> }) {
  const [previews, setPreviews] = useState<NotionSellerPreview[]>([])
  const [selection, setSelection] = useState<Record<string, Selection>>({})
  const [expanded, setExpanded] = useState<string>('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [summary, setSummary] = useState('운영 DB는 변경하지 않습니다. 먼저 노션 변경사항을 불러와 비교하세요.')
  const counts = useMemo(() => previews.reduce<Record<string, number>>((result, item) => ({ ...result, [item.status]: (result[item.status] ?? 0) + 1 }), {}), [previews])
  const selected = Object.values(selection).filter((item) => item.decision !== 'exclude').length

  const loadPreview = async () => {
    setBusy(true); setError('')
    try {
      const result = await notionSellerSyncService.preview(sellers)
      setPreviews(result.previews)
      setSelection(Object.fromEntries(result.previews.map((item) => [item.source.pageId, {
        decision: item.status === 'existing' ? 'connect' : item.status === 'needs_review' ? 'exclude' : 'apply',
        sellerId: item.matchedSellerId,
      }])))
      setSummary(`${result.incremental ? '최근 동기화 이후 변경된' : '전체'} 노션 셀러 ${result.previews.length}건을 비교했습니다. 아직 T3에는 반영되지 않았습니다.`)
    } catch (reason) { setError(reason instanceof Error ? reason.message : '노션 셀러를 불러오지 못했습니다.') }
    finally { setBusy(false) }
  }

  const apply = async () => {
    const decisions = previews.map((preview) => ({ preview, ...(selection[preview.source.pageId] ?? { decision: 'exclude' as const }) }))
    const targets = decisions.filter((item) => item.decision !== 'exclude')
    if (!targets.length) return setError('반영할 셀러를 선택해주세요.')
    if (!window.confirm(`선택한 ${targets.length}건만 T3 셀러 DB에 반영할까요? 기존 셀러 ID는 유지됩니다.`)) return
    setBusy(true); setError('')
    try { const saved = await notionSellerSyncService.apply(decisions); setSummary(`${saved.length}건을 반영했습니다. 노션 데이터가 없는 기존 셀러는 변경하지 않았습니다.`); await onApplied() }
    catch (reason) { setError(reason instanceof Error ? reason.message : '선택 항목을 반영하지 못했습니다.') }
    finally { setBusy(false) }
  }

  return <div className="nested-modal-backdrop"><section aria-modal="true" className="helper-modal notion-seller-sync" role="dialog">
    <header><div><p className="page-eyebrow">NOTION → T3</p><h3>노션 셀러 DB 동기화</h3><p>기존 셀러와 비교한 뒤 사용자가 선택한 항목만 반영합니다.</p></div><button aria-label="닫기" className="icon-button" onClick={onClose}>×</button></header>
    <div className="notion-sync-toolbar"><p>{summary}</p><button className="secondary-button" disabled={busy} onClick={() => void loadPreview()}>{busy && !previews.length ? '비교 중…' : '변경사항 불러오기'}</button></div>
    {error && <p className="campaign-policy-warning" role="alert">{error}</p>}
    {!!previews.length && <><div className="notion-sync-counts">{(['new','existing','changed','needs_review'] as NotionSellerSyncStatus[]).map((status) => <span className={`status-badge notion-${status}`} key={status}>{labels[status]} {counts[status] ?? 0}</span>)}</div>
      <div className="table-wrap notion-sync-table-wrap"><table className="comparison-table notion-sync-table"><thead><tr><th>선택</th><th>분류</th><th>노션 셀러</th><th>T3 연결 후보</th><th>판단</th><th>변경</th></tr></thead><tbody>{previews.map((item) => {
        const current = selection[item.source.pageId] ?? { decision: 'exclude' as const }
        const candidates = item.candidateIds.map((id) => sellers.find((seller) => seller.id === id)).filter((seller): seller is SellerMaster => Boolean(seller))
        return <tr className={item.status === 'needs_review' ? 'needs-review-row' : ''} key={item.source.pageId}><td><select aria-label={`${item.source.name} 처리`} value={current.decision} onChange={(event) => setSelection((state) => ({ ...state, [item.source.pageId]: { ...current, decision: event.target.value as NotionSellerDecision } }))}><option value="apply">반영</option><option value="exclude">제외</option><option value="connect">기존 셀러 연결</option></select></td><td><span className={`status-badge notion-${item.status}`}>{labels[item.status]}</span></td><td><strong>{item.source.name || '이름 확인 필요'}</strong><small>{item.source.instagramId || '-'}</small></td><td><select aria-label={`${item.source.name} 기존 셀러 후보`} value={current.sellerId ?? ''} onChange={(event) => setSelection((state) => ({ ...state, [item.source.pageId]: { ...current, sellerId: event.target.value || undefined } }))}><option value="">연결 없음</option>{candidates.map((seller) => <option key={seller.id} value={seller.id}>{seller.name} · {seller.instagramId || '인스타 없음'}</option>)}</select></td><td><span>{item.matchReason ?? '일치 후보 없음'}</span>{item.warnings.map((warning) => <small className="import-warning" key={warning}>{warning}</small>)}</td><td>{item.differences.length ? <button className="text-button" onClick={() => setExpanded(expanded === item.source.pageId ? '' : item.source.pageId)}>{item.differences.length}개 비교</button> : '변경 없음'}{expanded === item.source.pageId && <div className="notion-diff-popover">{item.differences.map((diff) => <dl key={diff.field}><dt>{diff.label}</dt><dd><span>기존</span>{diff.currentValue || '-'}</dd><dd><span>노션</span>{diff.notionValue || '-'}</dd></dl>)}</div>}</td></tr>
      })}</tbody></table></div>
      <div className="button-row notion-sync-actions"><button className="secondary-button" disabled={busy} onClick={onClose}>닫기</button><button className="primary-button" disabled={busy || !selected} onClick={() => void apply()}>선택 항목 T3 셀러 DB 반영 ({selected})</button></div></>}
  </section></div>
}
