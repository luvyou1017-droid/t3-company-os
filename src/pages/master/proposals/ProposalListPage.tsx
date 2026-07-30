import { useEffect, useMemo, useState } from 'react'
import type { ProposalMaster, ProposalStatus } from '../../../features/proposalMaster/types'
import { proposalService } from '../../../features/proposalMaster/services/proposalService'
import type { ReturnTypeOfProposalPermission } from './types'

const statusLabels: Record<ProposalStatus, string> = { draft: '작성 중', reviewing: '검수 중', shareable: '공유 가능', archived: '보관' }

export function ProposalListPage({ permission, onCreate, onEdit, onPreview }: { permission: ReturnTypeOfProposalPermission; onCreate: () => void; onEdit: (id: string) => void; onPreview: (id: string) => void }) {
  const [proposals, setProposals] = useState<ProposalMaster[]>([])
  const [query, setQuery] = useState('')
  const [filters, setFilters] = useState({ vendor: '', brand: '', category: '', author: '', status: '', date: '' })
  const load = () => proposalService.list().then(setProposals)
  useEffect(() => { void load() }, [])
  const options = useMemo(() => ({
    vendors: [...new Set(proposals.map((item) => item.vendorName).filter(Boolean))] as string[],
    brands: [...new Set(proposals.flatMap((item) => item.brandNames))],
    categories: [...new Set(proposals.map((item) => item.category).filter(Boolean))] as string[],
    authors: [...new Set(proposals.map((item) => item.authorName))],
  }), [proposals])
  const filtered = proposals.filter((proposal) => {
    const text = `${proposal.proposalName} ${proposal.brandNames.join(' ')} ${proposal.productItems.map((item) => `${item.productName} ${item.optionSummary}`).join(' ')}`.toLowerCase()
    return (!query || text.includes(query.toLowerCase())) && (!filters.vendor || proposal.vendorName === filters.vendor)
      && (!filters.brand || proposal.brandNames.includes(filters.brand)) && (!filters.category || proposal.category === filters.category)
      && (!filters.author || proposal.authorName === filters.author) && (!filters.status || proposal.status === filters.status)
      && (!filters.date || proposal.createdAt.slice(0, 10) === filters.date)
  })
  const patch = (key: keyof typeof filters, value: string) => setFilters((current) => ({ ...current, [key]: value }))
  const duplicate = async (id: string) => { const copy = await proposalService.duplicate(id); onEdit(copy.id) }
  const archive = async (id: string) => { if (window.confirm('이 제안서를 보관할까요?')) { await proposalService.archive(id); await load() } }
  return <section className="master-page proposal-list-page">
    <div className="master-page__heading"><div><p className="page-eyebrow">PROPOSAL DATABASE</p><h1>공동구매 제안서 DB</h1><p>상품 snapshot을 기반으로 셀러에게 전달할 웹 제안서를 관리합니다.</p></div>{permission.canCreate && <button className="primary-button" onClick={onCreate}>신규 제안서 만들기</button>}</div>
    <div className="proposal-filters"><input placeholder="제안서명, 브랜드, 제품, SKU 검색" aria-label="제안서 검색" value={query} onChange={(event) => setQuery(event.target.value)} /><Filter label="전체 공급처" value={filters.vendor} items={options.vendors} onChange={(value) => patch('vendor', value)} /><Filter label="전체 브랜드" value={filters.brand} items={options.brands} onChange={(value) => patch('brand', value)} /><Filter label="전체 카테고리" value={filters.category} items={options.categories} onChange={(value) => patch('category', value)} /><Filter label="전체 작성자" value={filters.author} items={options.authors} onChange={(value) => patch('author', value)} /><select value={filters.status} onChange={(event) => patch('status', event.target.value)}><option value="">전체 상태</option>{Object.entries(statusLabels).map(([value,label]) => <option value={value} key={value}>{label}</option>)}</select><input type="date" aria-label="작성일 필터" value={filters.date} onChange={(event) => patch('date', event.target.value)} /></div>
    <div className="proposal-list-grid">{filtered.map((proposal) => <article className="proposal-list-card" key={proposal.id}>
      <div className="proposal-list-card__image">{proposal.representativeImageUrl ? <img src={proposal.representativeImageUrl} alt="" /> : <span>대표 이미지 없음</span>}{proposal.testData && <b>TEST</b>}</div>
      <div className="proposal-list-card__body"><div className="proposal-list-card__head"><span className={`status-badge ${proposal.status === 'shareable' ? 'done' : proposal.status === 'reviewing' ? 'progress' : 'waiting'}`}>{statusLabels[proposal.status]}</span><small>{proposal.category ?? '미분류'}</small></div><h2>{proposal.proposalName}</h2><p>{proposal.vendorName ?? '공급처 미지정'} · {proposal.brandNames.join(', ')}</p><dl><div><dt>포함 제품</dt><dd>{proposal.productItems.length}개</dd></div><div><dt>작성자</dt><dd>{proposal.authorName}</dd></div><div><dt>작성일</dt><dd>{new Date(proposal.createdAt).toLocaleDateString('ko-KR')}</dd></div><div><dt>수정일</dt><dd>{new Date(proposal.updatedAt).toLocaleDateString('ko-KR')}</dd></div></dl>
      <div className="proposal-list-actions">{proposal.spreadsheetUrl ? <a href={proposal.spreadsheetUrl} target="_blank" rel="noreferrer">원본 열기</a> : <span>원본 링크 없음</span>}<button onClick={() => onPreview(proposal.id)}>미리보기</button><button onClick={() => void duplicate(proposal.id)}>복제</button>{permission.canEdit && <button onClick={() => onEdit(proposal.id)}>수정</button>}{permission.canArchive && proposal.status !== 'archived' && <button onClick={() => void archive(proposal.id)}>보관</button>}</div></div>
    </article>)}</div>
    {filtered.length === 0 && <div className="master-empty"><h2>조건에 맞는 제안서가 없습니다.</h2><p>검색 조건을 조정하거나 신규 제안서를 만들어주세요.</p></div>}
  </section>
}

function Filter({ label, value, items, onChange }: { label: string; value: string; items: string[]; onChange: (value: string) => void }) {
  return <select aria-label={label} value={value} onChange={(event) => onChange(event.target.value)}><option value="">{label}</option>{items.map((item) => <option key={item}>{item}</option>)}</select>
}
