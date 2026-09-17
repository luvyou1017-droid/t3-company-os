import { useMemo, useState } from 'react'
import type { Settlement } from '../../../shared/types/settlement'
import { campaignService } from '../../../shared/services/campaignService'
import { settlementService } from '../../../shared/services/settlementService'
import { buildSalesReferences, referenceBands } from '../../../shared/utils/salesReferences'

export function SalesReferences({ settlements, onOpenDetail }: { settlements: Settlement[]; onOpenDetail: (id: string) => void }) {
  const [band, setBand] = useState(-1)
  const [query, setQuery] = useState('')
  const [includeSeller, setIncludeSeller] = useState(false)
  const [message, setMessage] = useState('')
  const [limit, setLimit] = useState(30)
  const references = useMemo(() => buildSalesReferences(settlements, campaignService.getCampaigns(), settlementService.isSettlementConfirmed), [settlements])
  const matches = references.filter((item) => `${item.brand} ${item.product} ${item.seller} ${item.campaignName}`.toLowerCase().includes(query.trim().toLowerCase()))
  const filtered = matches.filter((item) => band === -1 || item.band === band)
  const copy = async (item: typeof references[number]) => {
    const summary = [`공동구매 진행 사례`, `상품: ${item.brand} · ${item.product}`, ...(includeSeller ? [`셀러: ${item.seller}`] : []), `기간: ${item.startDate} ~ ${item.endDate}`, `상품 매출: ${item.amount.toLocaleString('ko-KR')}원`, `취소·환불 반영, 배송비 제외 · 확정 정산 기준`].join('\n')
    try { await navigator.clipboard.writeText(summary); setMessage('레퍼런스 요약을 복사했습니다.') } catch { setMessage('복사하지 못했습니다. 아래 내용을 직접 복사해주세요.\n' + summary) }
  }
  return <section className="panel"><div className="panel__header"><div><h2>매출 레퍼런스</h2><p>확정 정산의 상품 매출을 자동 집계합니다. 공구당 1건이며 확정 해제·수정 중·취소 건은 제외합니다.</p></div><strong>{references.length}건 누적</strong></div>
    <div className="button-row" style={{ flexWrap: 'wrap' }}><button type="button" aria-pressed={band === -1} onClick={() => { setBand(-1); setLimit(30) }}>전체 ({matches.length})</button>{referenceBands.map((item, index) => <button type="button" key={item.min} aria-pressed={band === index} onClick={() => { setBand(index); setLimit(30) }} style={{ background: band === index ? '#e7efff' : undefined }}>{item.label} ({matches.filter((row) => row.band === index).length})</button>)}</div>
    <label style={{ display: 'block', margin: '16px 0' }}>상품·브랜드·셀러 검색<input value={query} onChange={(event) => { setQuery(event.target.value); setLimit(30) }} placeholder="예: 드라이기, 마이어홈" style={{ width: '100%', boxSizing: 'border-box' }} /></label>
    <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}><input style={{ width: 18, height: 18, minHeight: 18 }} type="checkbox" checked={includeSeller} onChange={(event) => setIncludeSeller(event.target.checked)} />전달용 요약에 셀러명 포함</label><p>요약에는 수수료·이익·계좌가 포함되지 않습니다. 실제 전달 전 공개 가능한 사례인지 확인해주세요.</p>
    {message && <p role="status" style={{ whiteSpace: 'pre-wrap' }}>{message}</p>}
    {!filtered.length ? <p>해당하는 확정 정산 사례가 없습니다. 정산서를 확정하면 자동으로 표시됩니다.</p> : <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 280px), 1fr))', gap: 16 }}>{filtered.slice(0, limit).map((item) => <article className="workspace-card" key={item.id}><small>{referenceBands[item.band]?.label}</small><h3>{item.product}</h3><p>{item.brand} · {item.seller}</p><p>{item.startDate} ~ {item.endDate}</p><strong>{item.amount.toLocaleString('ko-KR')}원</strong><div className="button-row" style={{ flexWrap: 'wrap', marginTop: 12 }}><button type="button" onClick={() => void copy(item)}>전달용 요약 복사</button><button type="button" onClick={() => onOpenDetail(item.id)}>근거 정산서 보기</button></div></article>)}</div>}
    {filtered.length > limit && <button type="button" onClick={() => setLimit(limit + 30)}>30건 더 보기</button>}
  </section>
}
