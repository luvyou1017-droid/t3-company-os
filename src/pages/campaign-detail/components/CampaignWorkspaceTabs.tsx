import { useMemo, useState } from 'react'
import { appUsers } from '../../../shared/data/users'
import { campaignActivityService } from '../../../shared/services/campaignActivityService'
import { campaignFileService } from '../../../shared/services/campaignFileService'
import { communicationService } from '../../../shared/services/communicationService'
import { csService } from '../../../shared/services/csService'
import { salesDataService } from '../../../shared/services/salesDataService'
import { sampleService } from '../../../shared/services/sampleService'
import { settlementService } from '../../../shared/services/settlementService'
import { workService } from '../../../shared/services/workService'
import { getSalesChannelTypeLabel } from '../../../shared/services/campaignCreationService'
import type { Campaign } from '../../../shared/types/campaign'
import type { CampaignFileType, CampaignTab, CommunicationChannel } from '../../../shared/types/campaignWorkspace'

const money = (value: number) => `${Math.round(value).toLocaleString('ko-KR')}원`
const dateText = (value?: string) => value ? value.replaceAll('-', '.') : '-'
const today = () => new Date().toISOString().slice(0, 10)
const maskPhone = (value: string) => value.replace(/(\d{3})-?(\d{3,4})-?(\d{4})/, '$1-****-$3')

function EmptyState({ action, children, onAction }: { action: string; children: string; onAction?: () => void }) {
  return <div className="workspace-empty"><strong>{children}</strong><p>다음 행동을 선택해 Campaign 운영을 계속하세요.</p><button className="secondary-button" onClick={onAction} type="button">{action}</button></div>
}

export function CampaignSettlementReference({ campaign }: { campaign: Campaign }) {
  if (!campaign.proposalSnapshots?.length) return null
  return <section className="workspace-card"><h3>정산 참고 조건</h3><p className="section-description">Campaign 생성 시 저장한 조건이며 상품 마스터 변경과 무관하게 유지됩니다.</p><div className="proposal-preview-grid settlement-reference-grid">{campaign.proposalSnapshots.map((snapshot) => <article key={snapshot.productId}><h4>{campaign.campaignProducts?.find((product) => product.productId === snapshot.productId)?.productName ?? campaign.productName}</h4><dl><div><dt>판매 링크</dt><dd>{getSalesChannelTypeLabel(snapshot.selectedSalesChannelType ?? campaign.salesChannelType)}</dd></div><div><dt>총 판매 수수료</dt><dd>{snapshot.totalCommissionRate}%</dd></div><div><dt>셀러 기본 수수료</dt><dd>{snapshot.sellerCommissionRate}%</dd></div><div><dt>브랜드 PG 지원</dt><dd>{snapshot.brandPgSupportAvailable ? `있음 · ${snapshot.brandPgSupportRate}%` : '없음'}</dd></div><div><dt>셀러 추가 PG 지급률</dt><dd>{snapshot.sellerExtraPgRate ?? snapshot.extraPgSupportRate}%</dd></div><div><dt>최종 셀러 수수료</dt><dd>{snapshot.effectiveSellerCommissionRate}%</dd></div><div><dt>회사 수수료</dt><dd>{snapshot.companyCommissionRate}%</dd></div><div><dt>배송비</dt><dd>{money(snapshot.shippingAmount)}</dd></div></dl><p>배송비에는 수수료를 적용하지 않습니다.</p></article>)}</div></section>
}

export function OverviewTab({ campaign, onTab }: { campaign: Campaign; onTab: (tab: CampaignTab) => void }) {
  const works = workService.getWorkItems().filter((item) => item.campaignId === campaign.id)
  const activities = campaignActivityService.getByCampaignId(campaign.id)
  const openWorks = works.filter((item) => item.status !== 'completed')
  const stage = campaign.status === 'active' ? '판매 중' : campaign.status === 'settled' ? '최종 완료' : campaign.status === 'closed' ? '판매 데이터 확인' : '판매 준비'
  const next = stage === '판매 중' ? '판매 종료 후 판매 데이터를 업로드하고 검수합니다.' : stage === '판매 데이터 확인' ? '판매 데이터를 확정한 뒤 정산을 생성합니다.' : stage === '최종 완료' ? '완료된 Campaign의 이력을 보관합니다.' : '샘플과 판매 링크를 확인한 뒤 판매를 시작합니다.'
  return <div className="workspace-section-stack">
    <div className="workspace-two-column">
      <section className="workspace-card"><h3>Campaign 기본 정보</h3><dl className="workspace-info-grid">
        <div><dt>셀러</dt><dd>{campaign.sellerName || '-'}</dd></div><div><dt>브랜드</dt><dd>{campaign.brandName || '-'}</dd></div>
        <div><dt>상품</dt><dd>{campaign.productName || '-'}</dd></div><div><dt>링크 주체</dt><dd>{campaign.linkOwner || '-'}</dd></div>
        <div><dt>사업자 유형</dt><dd>{campaign.businessType || '-'}</dd></div><div><dt>판매 기간</dt><dd>{dateText(campaign.startDate)} ~ {dateText(campaign.endDate)}</dd></div>
      </dl></section>
      <section className="workspace-card stage-card"><span className="eyebrow">현재 단계</span><h3>{stage}</h3><p><strong>다음 단계</strong><br />{next}</p><button className="secondary-button" onClick={() => onTab(stage === '판매 데이터 확인' ? 'sales' : 'work')} type="button">관련 업무 확인</button></section>
    </div>
    <div className="workspace-three-column">
      <section className="workspace-card"><h3>핵심 업무</h3><strong className="large-number">{openWorks.length}건</strong><p>완료 {works.filter((item) => item.status === 'completed').length}건 · 전체 {works.length}건</p></section>
      <section className="workspace-card"><h3>주요 담당자</h3><p>매니저 <strong>{campaign.managerName || '-'}</strong></p><p>MD <strong>{campaign.mdName || '-'}</strong></p></section>
      <section className="workspace-card"><h3>위험 신호</h3>{openWorks.some((item) => item.dueDate < today()) ? <p className="danger-text">기한이 지난 업무가 있습니다. 업무 탭에서 확인하세요.</p> : <p className="success-text">현재 감지된 긴급 위험이 없습니다.</p>}</section>
    </div>
    <CampaignSettlementReference campaign={campaign} />
    <section className="workspace-card"><div className="section-heading"><div><h3>최근 활동</h3><p>Campaign과 연결된 최신 변경입니다.</p></div><button className="text-button" onClick={() => onTab('history')} type="button">전체 이력</button></div>
      {activities.length ? activities.slice(0, 5).map((item) => <div className="activity-row" key={item.id}><span>{dateText(item.occurredAt)}</span><strong>{item.eventType}</strong><p>{item.description}</p></div>) : <p className="muted">아직 저장된 활동이 없습니다. 업무 완료, 파일 또는 소통 기록부터 활동이 쌓입니다.</p>}
    </section>
    <section className="workspace-card"><h3>관련 링크</h3><p>{campaign.contact || '아직 등록된 외부 링크가 없습니다.'}</p><button className="secondary-button" disabled={!campaign.contact?.startsWith('http')} type="button">관련 링크 열기</button></section>
  </div>
}

export function TimelineTab({ campaign }: { campaign: Campaign }) {
  const stored = campaignActivityService.getByCampaignId(campaign.id)
  const base = [
    { id: `created-${campaign.id}`, campaignId: campaign.id, occurredAt: campaign.createdAt || campaign.startDate, actor: campaign.managerName || '시스템', eventType: 'Campaign 생성', description: '공동구매 일정과 기본 체크리스트가 생성되었습니다.', relatedMenu: '개요', relatedDataId: campaign.id },
    { id: `start-${campaign.id}`, campaignId: campaign.id, occurredAt: campaign.startDate, actor: '시스템', eventType: '판매 시작', description: '공동구매 판매 기간이 시작됩니다.', relatedMenu: '판매 데이터', relatedDataId: campaign.id },
    { id: `end-${campaign.id}`, campaignId: campaign.id, occurredAt: campaign.endDate, actor: '시스템', eventType: '판매 종료', description: '판매 종료 후 판매 데이터 확인이 필요합니다.', relatedMenu: '판매 데이터', relatedDataId: campaign.id },
  ]
  const events = [...stored, ...base].sort((a, b) => a.occurredAt.localeCompare(b.occurredAt))
  return <section className="workspace-card"><h3>Campaign 타임라인</h3><p className="section-description">생성부터 최종 완료까지 운영 이벤트를 시간 순서로 봅니다.</p><div className="timeline">
    {events.map((event) => <article className="timeline-item" key={event.id}><div className="timeline-dot" /><div><span>{dateText(event.occurredAt)} · {event.actor}</span><h4>{event.eventType}</h4><p>{event.description}</p><small>{event.relatedMenu} · {event.relatedDataId}</small></div></article>)}
  </div></section>
}

export function WorkTab({ campaign, onChanged }: { campaign: Campaign; onChanged: () => void }) {
  const [filter, setFilter] = useState('전체')
  const [showForm, setShowForm] = useState(false)
  const [assignee, setAssignee] = useState(campaign.managerId || appUsers[0].id)
  const [title, setTitle] = useState('')
  const [dueDate, setDueDate] = useState(today())
  const [category, setCategory] = useState('일정')
  const [priority, setPriority] = useState<'urgent' | 'high' | 'medium' | 'low'>('medium')
  const [memo, setMemo] = useState('')
  const items = workService.getWorkItems().filter((item) => item.campaignId === campaign.id)
  const filtered = items.filter((item) => filter === '전체' || filter === '완료' && item.status === 'completed' || filter === '지연' && item.status !== 'completed' && item.dueDate < today() || filter === '오늘' && item.dueDate === today() || filter === '진행 중' && ['todo', 'pending', 'in_progress'].includes(item.status))
  const create = () => {
    if (!title.trim() || !dueDate) return
    const user = appUsers.find((item) => item.id === assignee)
    workService.createCampaignWorkItem({ campaignId: campaign.id, title, description: memo, assigneeId: assignee, assigneeName: user?.name, dueDate, category, priority, campaignName: campaign.campaignName, sellerName: campaign.sellerName, brandName: campaign.brandName })
    campaignActivityService.add({ id: crypto.randomUUID(), campaignId: campaign.id, occurredAt: new Date().toISOString(), actor: user?.name ?? '시스템', eventType: '업무 생성', description: title, relatedMenu: '업무', relatedDataId: campaign.id, after: dueDate, memo })
    setTitle(''); setMemo(''); setShowForm(false); onChanged()
  }
  return <div className="workspace-section-stack">
    <section className="workspace-card"><div className="section-heading"><div><h3>Campaign 업무</h3><p>체크리스트와 Work Item을 한 곳에서 관리합니다.</p></div><button className="secondary-button" onClick={() => setShowForm((value) => !value)} type="button">업무 생성</button></div>
      <div className="filter-pills">{['전체', '오늘', '지연', '진행 중', '완료'].map((value) => <button className={filter === value ? 'is-active' : ''} key={value} onClick={() => setFilter(value)} type="button">{value}</button>)}</div>
      {showForm && <div className="inline-form"><label>업무명<input value={title} onChange={(e) => setTitle(e.target.value)} /></label><label>담당자<select value={assignee} onChange={(e) => setAssignee(e.target.value)}>{appUsers.map((user) => <option key={user.id} value={user.id}>{user.name}</option>)}</select></label><label>마감일<input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} /></label><label>우선순위<select value={priority} onChange={(e) => setPriority(e.target.value as typeof priority)}><option value="urgent">긴급</option><option value="high">높음</option><option value="medium">보통</option><option value="low">낮음</option></select></label><label>카테고리<select value={category} onChange={(e) => setCategory(e.target.value)}>{['일정','샘플','링크','콘텐츠','CS','판매 데이터','정산','지급'].map((value) => <option key={value}>{value}</option>)}</select></label><label className="span-two">메모<textarea value={memo} onChange={(e) => setMemo(e.target.value)} /></label><div className="form-actions"><button className="secondary-button" onClick={() => setShowForm(false)} type="button">취소</button><button className="secondary-button" onClick={create} type="button">저장</button></div></div>}
      {filtered.length ? <div className="responsive-table"><table><thead><tr><th>업무명</th><th>담당자</th><th>마감일</th><th>상태</th><th>원본 기능</th><th>처리</th></tr></thead><tbody>{filtered.map((item) => <tr key={item.id}><td><strong>{item.title}</strong><small>{item.checklistName}</small></td><td>{item.assigneeName}</td><td>{dateText(item.dueDate)}</td><td><span className={`status-badge ${item.status === 'completed' ? 'done' : item.dueDate < today() ? 'error' : 'progress'}`}>{item.status === 'completed' ? '완료' : item.dueDate < today() ? '지연' : '진행 중'}</span></td><td>{item.relatedMenu}</td><td>{item.status !== 'completed' && <button className="text-button" onClick={() => { workService.completeWorkItem(item.id, new Date().toISOString()); campaignActivityService.add({ id: crypto.randomUUID(), campaignId: campaign.id, occurredAt: new Date().toISOString(), actor: item.assigneeName, eventType: '업무 완료', description: item.title, relatedMenu: '업무', relatedDataId: item.id, before: item.status, after: 'completed' }); onChanged() }} type="button">완료</button>}</td></tr>)}</tbody></table></div> : <EmptyState action="업무 생성" onAction={() => setShowForm(true)}>조건에 맞는 업무가 없습니다.</EmptyState>}
    </section>
  </div>
}

export function FilesTab({ campaign, onChanged }: { campaign: Campaign; onChanged: () => void }) {
  const files = campaignFileService.getByCampaignId(campaign.id)
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [type, setType] = useState<CampaignFileType>('제안서')
  const [memo, setMemo] = useState('')
  const create = () => { if (!name.trim()) return; campaignFileService.create({ id: `file-${crypto.randomUUID()}`, campaignId: campaign.id, fileName: name, fileType: type, uploadedAt: new Date().toISOString(), uploadedBy: campaign.managerName || '담당자', version: 'v1', memo, linkedStage: type === '정산서' ? '정산' : '판매 준비', totalCommissionRate: type === '제안서' ? campaign.totalCommissionRate : undefined, sellerCommissionRate: type === '제안서' ? campaign.sellerCommissionRate : undefined }); setName(''); setMemo(''); setOpen(false); onChanged() }
  return <section className="workspace-card"><div className="section-heading"><div><h3>제안서·파일</h3><p>실제 파일 대신 메타데이터만 저장합니다.</p></div><button className="secondary-button" onClick={() => setOpen((v) => !v)} type="button">파일 등록</button></div>
    {open && <div className="inline-form"><label>파일명<input value={name} onChange={(e) => setName(e.target.value)} /></label><label>유형<select value={type} onChange={(e) => setType(e.target.value as CampaignFileType)}>{['제안서','계약서','배너','상세페이지','가격 안내','링크 자료','정산서','세무 증빙','기타'].map((v) => <option key={v}>{v}</option>)}</select></label><label className="span-two">메모<textarea value={memo} onChange={(e) => setMemo(e.target.value)} /></label><div className="form-actions"><button className="secondary-button" onClick={create} type="button">메타데이터 저장</button></div></div>}
    {files.length ? <div className="responsive-table"><table><thead><tr><th>파일명</th><th>유형</th><th>업로드</th><th>버전</th><th>연결 단계</th><th>작업</th></tr></thead><tbody>{files.map((file) => <tr key={file.id}><td><strong>{file.fileName}</strong><small>{file.memo || '메모 없음'}</small></td><td>{file.fileType}</td><td>{dateText(file.uploadedAt)} · {file.uploadedBy}</td><td>{file.version}</td><td>{file.linkedStage}</td><td><button className="text-button" onClick={() => alert('MVP에서는 미리보기와 다운로드가 연결되지 않습니다.')} type="button">미리보기</button></td></tr>)}</tbody></table></div> : <EmptyState action="제안서 등록" onAction={() => setOpen(true)}>아직 업로드된 제안서나 파일이 없습니다.</EmptyState>}
  </section>
}

export function CommunicationsTab({ campaign, onChanged }: { campaign: Campaign; onChanged: () => void }) {
  const list = communicationService.getByCampaignId(campaign.id)
  const [open, setOpen] = useState(false)
  const [title, setTitle] = useState(''); const [content, setContent] = useState(''); const [channel, setChannel] = useState<CommunicationChannel>('카카오톡'); const [follow, setFollow] = useState(false); const [due, setDue] = useState(today()); const [assignee, setAssignee] = useState(campaign.managerId || appUsers[0].id)
  const create = () => { if (!title.trim()) return; const user = appUsers.find((u) => u.id === assignee); communicationService.create({ id: `communication-${crypto.randomUUID()}`, campaignId: campaign.id, occurredAt: new Date().toISOString(), target: `${campaign.brandName} · ${campaign.sellerName}`, author: campaign.managerName || '담당자', channel, title, content, followUpRequired: follow, dueDate: follow ? due : undefined, assigneeId: follow ? assignee : undefined, assigneeName: user?.name }); setTitle(''); setContent(''); setOpen(false); onChanged() }
  return <section className="workspace-card"><div className="section-heading"><div><h3>소통 기록</h3><p>브랜드사, 셀러, 내부 직원과의 결정과 후속 업무를 남깁니다.</p></div><button className="secondary-button" onClick={() => setOpen((v) => !v)} type="button">소통 기록 추가</button></div>
    {open && <div className="inline-form"><label>채널<select value={channel} onChange={(e) => setChannel(e.target.value as CommunicationChannel)}>{['카카오톡','전화','이메일','노션','내부 메모','회의','기타'].map((v) => <option key={v}>{v}</option>)}</select></label><label>제목<input value={title} onChange={(e) => setTitle(e.target.value)} /></label><label className="span-two">내용<textarea value={content} onChange={(e) => setContent(e.target.value)} /></label><label className="checkbox-label"><input checked={follow} onChange={(e) => setFollow(e.target.checked)} type="checkbox" /> 후속 업무 생성</label>{follow && <><label>마감일<input type="date" value={due} onChange={(e) => setDue(e.target.value)} /></label><label>담당자<select value={assignee} onChange={(e) => setAssignee(e.target.value)}>{appUsers.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</select></label></>}<div className="form-actions"><button className="secondary-button" onClick={create} type="button">기록 저장</button></div></div>}
    {list.length ? list.map((item) => <article className="communication-row" key={item.id}><div><span className="status-badge waiting">{item.channel}</span><strong>{item.title}</strong><p>{item.content}</p></div><div><small>{dateText(item.occurredAt)} · {item.author}</small>{item.followUpWorkItemId && <span className="success-text">후속 업무 생성됨</span>}</div></article>) : <EmptyState action="소통 기록 추가" onAction={() => setOpen(true)}>아직 기록된 소통 내역이 없습니다.</EmptyState>}
  </section>
}

export function SamplesTab({ campaign, onExternal }: { campaign: Campaign; onExternal: (type: string, id?: string) => void }) {
  const samples = sampleService.getSamplesByCampaignId(campaign.id)
  return <section className="workspace-card"><div className="section-heading"><div><h3>샘플</h3><p>정산에는 제안서 예상값이 아닌 실제 Sample 확정값만 사용합니다.</p></div><button className="secondary-button" onClick={() => onExternal('samples')} type="button">샘플 관리 전체 보기</button></div>
    {samples.length ? <div className="responsive-table"><table><thead><tr><th>샘플</th><th>수량·단가</th><th className="money-cell">실제 총비용</th><th>유·무상 / 부담자</th><th>상태</th><th>정산</th></tr></thead><tbody>{samples.map((s) => { const total = s.quantity * (s.unitPrice ?? s.sampleCost) + s.shippingCost; const mismatch = s.proposalExpectedTotalAmount != null && s.proposalExpectedTotalAmount !== total; return <tr key={s.id}><td><strong>{s.productName}</strong><small>{s.optionName}</small>{mismatch && <small className="danger-text">제안서 예상값과 실제 비용이 다릅니다.</small>}</td><td>{s.quantity}개 · {money(s.unitPrice ?? s.sampleCost)}</td><td className="money-cell">{money(total)}</td><td>{s.paymentType} · {s.costOwner}</td><td>{s.status} / {s.deliveryStatus}</td><td>{s.settlementReflected ? `반영 완료 (${s.settlementId})` : '미반영'}<button className="text-button table-action" onClick={() => onExternal('samples', s.id)} type="button">원본 보기</button></td></tr> })}</tbody></table></div> : <EmptyState action="샘플 등록" onAction={() => onExternal('samples')}>이 Campaign에 연결된 샘플이 없습니다.</EmptyState>}
  </section>
}

export function CsTab({ campaign, onExternal }: { campaign: Campaign; onExternal: (type: string, id?: string) => void }) {
  const cases = csService.getCsCasesByCampaignId(campaign.id)
  const statuses = ['신규','처리 중','브랜드 답변 대기','고객 답변 대기','지연','완료'].map((label) => ({ label, count: label === '완료' ? cases.filter((c) => c.status === '처리 완료').length : label === '지연' ? cases.filter((c) => c.status !== '처리 완료' && c.dueAt < new Date().toISOString()).length : cases.filter((c) => c.status === label).length }))
  return <div className="workspace-section-stack"><div className="mini-summary-grid">{statuses.map((s) => <div className="mini-summary" key={s.label}><span>{s.label}</span><strong>{s.count}</strong></div>)}</div><section className="workspace-card"><div className="section-heading"><div><h3>CS 목록</h3><p>현재 정책에 따라 주문번호는 수집하거나 표시하지 않습니다.</p></div><div className="button-row"><button className="secondary-button" onClick={() => navigator.clipboard?.writeText(`${location.origin}/#public-cs-intake`)} type="button">외부 접수 링크 복사</button><button className="secondary-button" onClick={() => onExternal('cs')} type="button">CS 관리 전체 보기</button></div></div>
    {cases.length ? <div className="responsive-table"><table><thead><tr><th>접수번호</th><th>고객</th><th>유형</th><th>접수일</th><th>담당자</th><th>상태</th><th>첨부</th></tr></thead><tbody>{cases.map((c) => <tr key={c.id}><td><button className="text-button" onClick={() => onExternal('cs', c.id)} type="button">{c.caseNumber}</button></td><td>{c.customerName}<small>{maskPhone(c.customerPhone)}</small></td><td>{c.csType}</td><td>{dateText(c.receivedAt)}</td><td>{c.assigneeName}</td><td><span className={`status-badge ${c.status === '처리 완료' ? 'done' : 'progress'}`}>{c.status}</span></td><td>{c.attachments.length}개</td></tr>)}</tbody></table></div> : <EmptyState action="CS 관리 열기" onAction={() => onExternal('cs')}>이 Campaign에 접수된 CS가 없습니다.</EmptyState>}</section></div>
}

export function SalesTab({ campaign, onExternal, onChanged }: { campaign: Campaign; onExternal: (type: string, id?: string) => void; onChanged: () => void }) {
  const { imports, rows } = salesDataService.getSalesDataByCampaignId(campaign.id)
  const target = imports[0]
  const totals = useMemo(() => ({ quantity: rows.reduce((s,r) => s+r.quantity,0), canceled: rows.reduce((s,r) => s+r.canceledQuantity,0), refunded: rows.reduce((s,r) => s+r.refundedQuantity,0), net: rows.reduce((s,r) => s+r.netSales,0) }), [rows])
  if (!target) return <section className="workspace-card"><h3>판매 데이터</h3><EmptyState action="판매 데이터 관리 열기" onAction={() => onExternal('sales')}>아직 업로드된 판매 데이터가 없습니다.</EmptyState></section>
  return <div className="workspace-section-stack"><div className="mini-summary-grid sales-summary"><div className="mini-summary"><span>업로드</span><strong>{target.reviewStatus}</strong></div><div className="mini-summary"><span>총 판매수량</span><strong>{totals.quantity.toLocaleString()}개</strong></div><div className="mini-summary"><span>총매출</span><strong>{money(target.totalSalesAmount)}</strong></div><div className="mini-summary"><span>순매출</span><strong>{money(totals.net)}</strong></div></div><section className="workspace-card"><h3>판매 데이터 상태</h3><dl className="workspace-info-grid"><div><dt>취소 / 환불</dt><dd>{totals.canceled} / {totals.refunded}개</dd></div><div><dt>마지막 업로드</dt><dd>{dateText(target.uploadedAt)}</dd></div><div><dt>정산 가능 여부</dt><dd>{target.settlementStatus}</dd></div><div><dt>검수 상태</dt><dd>{target.reviewStatus}</dd></div></dl><div className="button-row"><button className="secondary-button" onClick={() => onExternal('sales', target.id)} type="button">판매 데이터 상세</button><button className="secondary-button" disabled={target.reviewStatus === '확정 완료'} onClick={() => { salesDataService.validateSalesData(target.id); onChanged() }} type="button">검수 시작</button><button className="secondary-button" disabled={target.reviewStatus === '확정 완료'} onClick={() => { salesDataService.confirmSalesData(target.id); onChanged() }} type="button">확정</button></div></section></div>
}

export function SettlementTab({ campaign, onExternal }: { campaign: Campaign; onExternal: (type: string, id?: string) => void }) {
  const settlement = settlementService.getSettlementByCampaignId(campaign.id)[0]
  if (!settlement) return <section className="workspace-card"><h3>정산</h3><EmptyState action="정산 관리 열기" onAction={() => onExternal('settlement')}>아직 생성된 정산이 없습니다. 확정된 판매 데이터를 먼저 확인해주세요.</EmptyState></section>
  const c = settlement.currentCalculation
  return <div className="workspace-section-stack"><div className="mini-summary-grid settlement-summary"><div className="mini-summary"><span>정산 상태</span><strong>{settlement.status}</strong></div><div className="mini-summary"><span>총매출</span><strong>{money(c.grossSales)}</strong></div><div className="mini-summary"><span>셀러 지급액</span><strong>{money(c.finalSellerPaymentAmount)}</strong></div><div className="mini-summary"><span>회사 귀속액</span><strong>{money(c.companyAmount)}</strong></div></div><section className="workspace-card"><h3>정산 요약 <small>모든 금액은 부가세 포함</small></h3><dl className="workspace-info-grid money-info"><div><dt>총수수료</dt><dd>{money(c.grossCommission)}</dd></div><div><dt>벤더 수수료</dt><dd>{money(c.vendorCommission)}</dd></div><div><dt>차감 합계</dt><dd>{money(c.deductionTotal)}</dd></div><div><dt>최종 배분 대상</dt><dd>{money(c.distributableVendorCommission)}</dd></div><div><dt>매니저 지급액</dt><dd>{money(c.managerAmount)}</dd></div><div><dt>증빙 / 지급</dt><dd>{settlement.evidenceStatus} / {settlement.sellerPaymentCompleted ? '지급 완료' : '지급 전'}</dd></div></dl><div className="button-row"><button className="secondary-button" onClick={() => onExternal('settlement', settlement.id)} type="button">정산 상세</button><button className="secondary-button" onClick={() => onExternal('settlement', settlement.id)} type="button">계산 과정</button><button className="secondary-button" onClick={() => onExternal('settlement', settlement.id)} type="button">셀러용 정산서</button></div></section></div>
}

export function HistoryTab({ campaign }: { campaign: Campaign }) {
  const activities = campaignActivityService.getByCampaignId(campaign.id)
  return <section className="workspace-card"><h3>통합 변경 이력</h3><p className="section-description">Campaign, 업무, 파일, 소통의 주요 변경을 감사 가능한 형태로 표시합니다.</p>{activities.length ? <div className="responsive-table"><table><thead><tr><th>일시</th><th>처리자</th><th>행동</th><th>변경 전</th><th>변경 후</th><th>메뉴·메모</th></tr></thead><tbody>{activities.map((a) => <tr key={a.id}><td>{dateText(a.occurredAt)}</td><td>{a.actor}</td><td>{a.eventType}<small>{a.description}</small></td><td>{a.before || '-'}</td><td>{a.after || '-'}</td><td>{a.relatedMenu}<small>{a.memo || a.relatedDataId}</small></td></tr>)}</tbody></table></div> : <EmptyState action="업무 탭으로 이동">아직 기록된 변경 이력이 없습니다.</EmptyState>}</section>
}
