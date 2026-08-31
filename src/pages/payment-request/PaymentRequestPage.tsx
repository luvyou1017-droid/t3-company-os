import { useEffect, useState } from 'react'
import { campaignService } from '../../shared/services/campaignService'
import { paymentEvidenceService } from '../../shared/services/paymentEvidenceService'
import { paymentRequestService } from '../../shared/services/paymentRequestService'
import { managerPaymentService } from '../../shared/services/managerPaymentService'
import { sellerSettlementService } from '../../shared/services/sellerSettlementService'
import { settlementService } from '../../shared/services/settlementService'
import { sellerMasterService } from '../../shared/services/sellerMasterService'
import { withholdingTaxService } from '../../shared/services/withholdingTaxService'
import type { EvidenceDocumentType, EvidenceOwnerType, PaymentEvidence } from '../../shared/types/paymentEvidence'
import type { PaymentRequest, PaymentRequestStatus, SellerBusinessType } from '../../shared/types/sellerSettlement'
import type { WithholdingTaxStatus } from '../../shared/types/withholdingTax'
import { calculateWithholding, runWithholdingAssertions } from '../../shared/utils/withholdingTax'
import { validateSettlement } from '../../shared/utils/settlement'
import { openPaymentDetail } from '../../shared/utils/paymentNavigation'
import { canManagePaymentApproval, canViewPaymentApproval, DEFAULT_EVIDENCE_REVIEWER, DEFAULT_OPERATOR_USER_ID, getUserById } from '../../shared/data/users'
import { evidenceAiReviewService } from '../../shared/services/evidenceAiReviewService'
import type { EvidenceExpectedContext } from '../../shared/types/evidenceAiReview'
import { EvidencePreviewModal } from './components/EvidencePreviewModal'
import { paymentEvidenceStorageService } from '../../shared/services/paymentEvidenceStorageService'
import { formatKoreanDate, formatKoreanDateTime } from '../../shared/utils/koreanDate'
import { ReasonInput, ReasonModal } from '../../shared/components/ReasonInput'

type Tab = 'requests' | 'approval' | 'scheduled' | 'completed' | 'evidence' | 'withholding'
type WorkflowTarget = { settlementId: string; recipientType: EvidenceOwnerType }
const money = (value: number) => `${Math.round(value).toLocaleString('ko-KR')}원`
const statusLabel: Record<PaymentRequestStatus, string> = {
  draft: '초안', evidence_pending: '증빙 대기', request_ready: '요청 생성 대기', approval_pending: '대표 승인 대기',
  approved: '승인 완료', sent: '셀러 전달 완료', payment_completed: '지급 완료',
  remittance_confirmed: '입금 확인 완료', on_hold: '보류', rejected: '반려', canceled: '취소',
}
const evidenceLabels: Record<EvidenceDocumentType, string> = {
  tax_invoice: '세금계산서 캡처', cash_receipt: '현금영수증 캡처', withholding_entry: '원천세 리스트', other: '기타 증빙',
}
const reviewLabels = {
  not_uploaded: '미업로드', uploaded: '업로드 완료', review_pending: '검수 대기', approved: '승인', rejected: '반려',
}
const taxStatusLabels: Record<WithholdingTaxStatus, string> = {
  draft: '초안', ready: '신고 준비', uploaded: '업로드 완료', reported: '신고 완료', paid: '납부 완료',
  revision_required: '수정 필요', canceled: '취소',
}
const businessTypeLabels: Record<SellerBusinessType, string> = {
  corporation: '법인',
  general_business: '일반 개인사업자',
  simplified_business: '간이사업자',
  freelancer: '개인 프리랜서',
}
const salesChannelLabels = {
  supplier_link: '공급사 링크',
  wise_shop_link: '와이즈샵 링크',
  seller_checkout: '셀러 결제창',
} as const

function getPaymentRoute(): { tab: Tab; target: WorkflowTarget | null; evidenceId: string | null } {
  const params = new URLSearchParams(window.location.search)
  const tabParam = params.get('tab')
  const saved = JSON.parse(sessionStorage.getItem('t3_payment_view_state') ?? '{}') as { tab?: Tab }
  const tab: Tab = tabParam === 'evidence-review' ? 'evidence'
    : ['requests', 'approval', 'scheduled', 'completed', 'withholding'].includes(tabParam ?? '') ? tabParam as Tab
      : saved.tab ?? 'requests'
  const evidenceMatch = window.location.pathname.match(/^\/payments\/evidence-review\/([^/]+)/)
  const target = window.location.pathname === '/payments/detail' && params.get('settlementId')
    ? { settlementId: params.get('settlementId')!, recipientType: params.get('recipientType') === 'manager' ? 'manager' as const : 'seller' as const }
    : null
  return { tab, target, evidenceId: evidenceMatch ? decodeURIComponent(evidenceMatch[1]) : null }
}

function getBackLabel() {
  return (window.history.state as { label?: string } | null)?.label ? `${(window.history.state as { label: string }).label}으로` : '이전 화면'
}

export function PaymentRequestPage() {
  const initialRoute = getPaymentRoute()
  const [tab, setTabState] = useState<Tab>(initialRoute.tab)
  const [target, setTarget] = useState<WorkflowTarget | null>(initialRoute.target)
  const [evidenceTargetId, setEvidenceTargetId] = useState<string | null>(initialRoute.evidenceId)
  const [, setRevision] = useState(0)
  const sync = () => setRevision((value) => value + 1)
  const requests = paymentRequestService.getOperationalPaymentRequests()
  const evidence = paymentEvidenceService.getAllEvidence()
  useEffect(() => {
    const saved = JSON.parse(sessionStorage.getItem('t3_payment_view_state') ?? '{}') as { scrollY?: number }
    if (typeof saved.scrollY === 'number') requestAnimationFrame(() => window.scrollTo(0, saved.scrollY ?? 0))
    return () => {
      sessionStorage.setItem('t3_payment_view_state', JSON.stringify({ tab, scrollY: window.scrollY }))
    }
  }, [tab])
  const back = () => {
    const state = window.history.state as { from?: string } | null
    if (state?.from) {
      window.history.pushState({}, '', state.from)
      window.dispatchEvent(new PopStateEvent('popstate'))
    } else if (window.history.length > 1) window.history.back()
    else {
      window.history.pushState({}, '', '/payments?tab=requests')
      setTarget(null); setEvidenceTargetId(null); setTabState('requests')
    }
  }
  if (target) return <PaymentWorkflowDetail target={target} backLabel={getBackLabel()} onBack={back} onSync={sync} />
  if (evidenceTargetId) return <EvidenceReviewDetail evidenceId={evidenceTargetId} backLabel={getBackLabel()} onBack={back} onOpenPayment={(next) => { openPaymentDetail(next.settlementId, next.recipientType, { from: `/payments/evidence-review/${evidenceTargetId}`, label: '증빙 검수 상세' }); setEvidenceTargetId(null); setTarget(next) }} onSync={sync} />

  return <PaymentTransferWorkspace evidence={evidence} onSync={sync} requests={requests} />
}

type TransferFilter = 'all' | 'tax_invoice' | 'cash_receipt' | 'withholding'
type TransferStatusFilter = 'active' | 'all' | 'needs_review' | 'ready' | 'completed'
const activeTransferStatuses: PaymentRequestStatus[] = ['evidence_pending', 'request_ready', 'approval_pending', 'approved', 'sent', 'on_hold']

function transferType(request: PaymentRequest): TransferFilter {
  if (request.businessType === 'freelancer' || request.evidenceType === 'withholding_3_3') return 'withholding'
  return request.businessType === 'simplified_business' || request.evidenceType === 'cash_receipt' ? 'cash_receipt' : 'tax_invoice'
}

function transferTypeLabel(request: PaymentRequest) {
  const type = transferType(request)
  return type === 'withholding' ? '원천세' : type === 'cash_receipt' ? '현금영수증' : '세금계산서'
}

function PaymentTransferWorkspace({ requests, evidence, onSync }: { requests: PaymentRequest[]; evidence: PaymentEvidence[]; onSync: () => void }) {
  const operator = getUserById(DEFAULT_OPERATOR_USER_ID)!
  const canView = canViewPaymentApproval(operator.role)
  const canManage = canManagePaymentApproval(operator.role)
  const [filter, setFilter] = useState<TransferFilter>('all')
  const [statusFilter, setStatusFilter] = useState<TransferStatusFilter>('active')
  const [recipientFilter, setRecipientFilter] = useState<'all' | EvidenceOwnerType>('all')
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<string[]>([])
  const [detail, setDetail] = useState<PaymentRequest | null>(null)
  const [transferListOpen, setTransferListOpen] = useState(false)
  const [completionOpen, setCompletionOpen] = useState(false)
  const [toast, setToast] = useState('')
  const activeRequests = requests.filter((request) => activeTransferStatuses.includes(request.status))
  const taxItems = withholdingTaxService.getItems()
  const duplicateIds = new Set(activeRequests.filter((request, index, all) => all.findIndex((item) => item.id === request.id) !== index).map((request) => request.id))
  const currentAmount = (request: PaymentRequest) => request.recipientType === 'seller'
    ? settlementService.getSettlementById(request.settlementId)?.currentCalculation.finalSellerPaymentAmount
    : managerPaymentService.getScheduledItems(request.recipientId).find((item) => item.settlement.id === request.settlementId)?.finalAmount
  const currentAccount = (request: PaymentRequest) => request.recipientType === 'seller' ? sellerMasterService.getSellerById(request.recipientId) : managerPaymentService.getProfile(request.recipientId)
  const transferIssues = (request: PaymentRequest) => {
    const issues: string[] = []
    if (!request.bankNameSnapshot) issues.push('은행 미등록')
    if (!request.accountNumberSnapshot) issues.push('계좌번호 미등록')
    if (!request.accountHolderSnapshot) issues.push('예금주 미등록')
    const master = currentAccount(request)
    if (master && (master.bankName !== request.bankNameSnapshot || master.accountNumber !== request.accountNumberSnapshot || master.accountHolder !== request.accountHolderSnapshot)) issues.push('지급요청 이후 계좌정보가 변경됨')
    const settlementAmount = currentAmount(request)
    if (settlementAmount !== undefined && settlementAmount !== request.finalPaymentAmount) issues.push('정산서와 지급요청 금액이 다름')
    if (request.finalPaymentAmount <= 0) issues.push('지급액 확인 필요')
    if (duplicateIds.has(request.id)) issues.push('중복 지급요청')
    if (request.status !== 'approved' && request.status !== 'sent') issues.push('대표 승인 필요')
    if (transferType(request) === 'tax_invoice' && !['confirmed', 'reported_issued'].includes(request.documentCheckStatus ?? '')) issues.push('세금계산서 확인 필요')
    if (transferType(request) === 'cash_receipt' && request.documentCheckStatus !== 'confirmed') issues.push('현금영수증 확인 필요')
    if (transferType(request) === 'withholding') {
      const taxItem = taxItems.find((item) => item.id === request.withholdingTaxItemId && item.status !== 'canceled')
      if (!taxItem) issues.push('원천세 리스트 연결 확인 필요')
      else if (taxItem.withholdingBaseAmount !== request.withholdingBaseAmount || taxItem.incomeTaxAmount !== (request.incomeTaxAmount ?? 0) || taxItem.localIncomeTaxAmount !== (request.localIncomeTaxAmount ?? 0) || taxItem.totalWithholdingTaxAmount !== request.withholdingTaxAmount || taxItem.finalPaymentAmount !== request.finalPaymentAmount) issues.push('원천세 금액 불일치')
    }
    return issues
  }
  const transferIssue = (request: PaymentRequest) => transferIssues(request)[0] ?? ''
  const simpleStatus = (request: PaymentRequest) => request.status === 'payment_completed' || request.status === 'remittance_confirmed' ? 'completed' : request.status === 'canceled' || request.status === 'rejected' ? request.status : transferIssue(request) ? 'needs_review' : 'ready'
  const normalizedSearch = search.trim().toLowerCase()
  const visible = requests.filter((request) => request.status !== 'draft' && (filter === 'all' || transferType(request) === filter) && (statusFilter === 'all' || (statusFilter === 'active' ? activeTransferStatuses.includes(request.status) : simpleStatus(request) === statusFilter)) && (recipientFilter === 'all' || request.recipientType === recipientFilter) && (!normalizedSearch || [campaignService.getCampaignById(request.campaignId)?.campaignName, request.recipientName, request.accountHolderSnapshot].some((value) => value?.toLowerCase().includes(normalizedSearch))))
  const selectedRequests = activeRequests.filter((request) => selected.includes(request.id))
  const selectedAmount = selectedRequests.reduce((sum, request) => sum + request.finalPaymentAmount, 0)
  const summaries: Array<{ id: TransferFilter; label: string }> = [{ id: 'all', label: '금일 지급' }, { id: 'tax_invoice', label: '세금계산서' }, { id: 'cash_receipt', label: '현금영수증' }, { id: 'withholding', label: '원천세' }]
  const summaryItems = summaries.map((summary) => { const items = activeRequests.filter((request) => summary.id === 'all' || transferType(request) === summary.id); return { ...summary, count: items.length, amount: items.reduce((sum, request) => sum + request.finalPaymentAmount, 0) } })
  const toggle = (request: PaymentRequest) => setSelected((current) => current.includes(request.id) ? current.filter((id) => id !== request.id) : [...current, request.id])
  const selectableVisible = visible.filter((request) => !transferIssue(request) && simpleStatus(request) !== 'completed')
  const allVisibleSelected = selectableVisible.length > 0 && selectableVisible.every((request) => selected.includes(request.id))
  const resetSelectionForFilter = (change: () => void) => { change(); if (selected.length) { setSelected([]); setToast('필터가 변경되어 선택 항목이 초기화되었습니다.') } }
  const evidenceFor = (request: PaymentRequest) => evidence.filter((item) => item.paymentRequestId === request.id || (item.settlementId === request.settlementId && item.ownerType === request.recipientType))
  useEffect(() => { if (!toast) return; const timer = window.setTimeout(() => setToast(''), 2000); return () => window.clearTimeout(timer) }, [toast])
  const copy = async (value: string, message: string) => { await navigator.clipboard.writeText(value); setToast(message) }
  return <section className="payment-page payment-transfer-page">
    <header className="payment-transfer-header"><div><p className="page-eyebrow">Payment Transfer Desk</p><h1>지급승인</h1><p>정산관리에서 실제 생성된 지급요청만 모아 송금 전 최종 확인합니다.</p></div></header>
    {!canView ? <section className="workspace-card workspace-empty"><strong>지급승인 조회 권한이 없습니다.</strong></section> : <>
    <div className="payment-transfer-summary">{summaryItems.map((item) => <button className={filter === item.id ? 'is-active' : ''} key={item.id} onClick={() => resetSelectionForFilter(() => setFilter(item.id))} type="button"><span>{item.label}</span><strong>{item.count}건 / {money(item.amount)}</strong></button>)}</div>
    <section className="workspace-card payment-transfer-list"><div className="section-heading"><div><h2>지급 목록</h2><p>은행 이체에 필요한 계좌와 확정 지급액을 한 표에서 확인합니다.</p></div><strong>{visible.length}건</strong></div><div className="payment-transfer-filters"><input aria-label="지급건 검색" onChange={(event) => setSearch(event.target.value)} placeholder="행사명, 지급대상, 예금주 검색" value={search} /><select aria-label="지급 준비 상태" onChange={(event) => resetSelectionForFilter(() => setStatusFilter(event.target.value as TransferStatusFilter))} value={statusFilter}><option value="active">처리 대상</option><option value="all">상태 전체</option><option value="needs_review">확인 필요</option><option value="ready">이체 대기</option><option value="completed">입금 완료</option></select><select aria-label="지급 대상 유형" onChange={(event) => resetSelectionForFilter(() => setRecipientFilter(event.target.value as typeof recipientFilter))} value={recipientFilter}><option value="all">대상 전체</option><option value="seller">셀러</option><option value="manager">매니저</option></select></div>
      <div className="responsive-table"><table><thead><tr><th><input aria-label="현재 목록 전체 선택" checked={allVisibleSelected} disabled={!canManage || !selectableVisible.length} onChange={() => setSelected((current) => allVisibleSelected ? current.filter((id) => !selectableVisible.some((item) => item.id === id)) : [...new Set([...current, ...selectableVisible.map((item) => item.id)])])} type="checkbox" /></th><th>은행</th><th>입금계좌</th><th>예금주명</th><th>이체금액</th><th>행사명</th><th>지급대상</th><th>사업자 유형</th><th>증빙/세무 유형</th><th>확인 상태</th><th>액션</th></tr></thead><tbody>{visible.map((request) => { const issue = transferIssue(request); const campaign = campaignService.getCampaignById(request.campaignId); const state = simpleStatus(request); return <tr className={`${issue ? 'has-transfer-issue' : ''} transfer-state-${state}`} key={request.id} onClick={() => setDetail(request)}><td onClick={(event) => event.stopPropagation()}><input aria-label={`${request.recipientName} 지급 선택`} checked={selected.includes(request.id)} disabled={!canManage || Boolean(issue) || state === 'completed'} onChange={() => toggle(request)} type="checkbox" /></td><td>{request.bankNameSnapshot || '은행 미등록'}</td><td><button className="account-copy-button" disabled={!canManage || !request.accountNumberSnapshot} onClick={(event) => { event.stopPropagation(); if (request.accountNumberSnapshot) void copy(request.accountNumberSnapshot, '계좌번호가 클립보드에 복사되었습니다.') }} type="button">{canManage ? request.accountNumberSnapshot || '계좌번호 미등록' : '권한 필요'} {canManage && <span>복사</span>}</button></td><td>{canManage ? request.accountHolderSnapshot || '예금주 미등록' : '권한 필요'}</td><td className="money-cell"><strong>{money(request.finalPaymentAmount)}</strong></td><td>{campaign?.campaignName ?? request.campaignId}</td><td><span>{request.recipientType === 'seller' ? '셀러' : '매니저'}</span><strong>{request.recipientName}</strong></td><td>{businessTypeLabels[request.businessType]}</td><td>{transferTypeLabel(request)}</td><td><span className={`transfer-check-status is-${state}`}>{state === 'completed' ? '입금 완료' : state === 'ready' ? '이체 대기' : state === 'canceled' ? '취소' : state === 'rejected' ? '반려' : '확인 필요'}</span>{issue && <small>{issue}</small>}</td><td><button className="secondary-button" onClick={(event) => { event.stopPropagation(); setDetail(request) }} type="button">확인</button></td></tr> })}</tbody></table></div>
      {!visible.length && <div className="workspace-empty"><strong>현재 지급 대기 중인 요청이 없습니다.</strong><p>정산관리에서 지급요청이 생성되면 자동으로 표시됩니다.</p></div>}
    </section>
    {selectedRequests.length > 0 && <div className="payment-transfer-selection"><strong>{selectedRequests.length}건 선택 · 총 이체금액 {money(selectedAmount)}</strong><div className="button-row"><button className="secondary-button" onClick={() => setSelected([])} type="button">선택 해제</button><button className="primary-button" onClick={() => setTransferListOpen(true)} type="button">이체 목록 보기</button></div></div>}
    {detail && <PaymentTransferDetail canManage={canManage} currentAmount={currentAmount(detail)} evidence={evidenceFor(detail)} issues={transferIssues(detail)} onClose={() => setDetail(null)} onSync={() => { setDetail(paymentRequestService.getPaymentRequestById(detail.id) ?? null); onSync() }} request={detail} taxItem={taxItems.find((item) => item.id === detail.withholdingTaxItemId)} />}
    {transferListOpen && <TransferListModal onClose={() => setTransferListOpen(false)} onComplete={() => { setTransferListOpen(false); setCompletionOpen(true) }} onCopy={(value) => void copy(value, '이체 목록이 클립보드에 복사되었습니다.')} requests={selectedRequests} />}
    <PaymentCompletionModal amount={selectedAmount} count={selectedRequests.length} onClose={() => setCompletionOpen(false)} onConfirm={() => { paymentRequestService.markPaymentBatchCompleted(selected, '허수정'); setCompletionOpen(false); setSelected([]); onSync(); setToast('입금 완료 처리되었습니다.') }} open={completionOpen} />
    {toast && <div aria-live="polite" className="clipboard-toast">✓ {toast}</div>}</>}
  </section>
}

function PaymentTransferDetail({ request, evidence, taxItem, currentAmount, issues, canManage, onClose, onSync }: { request: PaymentRequest; evidence: PaymentEvidence[]; taxItem?: ReturnType<typeof withholdingTaxService.getItems>[number]; currentAmount?: number; issues: string[]; canManage: boolean; onClose: () => void; onSync: () => void }) {
  const [memo, setMemo] = useState(request.documentCheckMemo ?? '')
  const [rejectOpen, setRejectOpen] = useState(false)
  const [rejectReason, setRejectReason] = useState('')
  const [showMaster, setShowMaster] = useState(false)
  const update = (status: NonNullable<PaymentRequest['documentCheckStatus']>) => { paymentRequestService.updateDocumentCheck(request.id, status, memo); onSync() }
  const currentAccount = request.recipientType === 'seller' ? sellerMasterService.getSellerById(request.recipientId) : managerPaymentService.getProfile(request.recipientId)
  const accountChanged = Boolean(currentAccount && (currentAccount.bankName !== request.bankNameSnapshot || currentAccount.accountNumber !== request.accountNumberSnapshot || currentAccount.accountHolder !== request.accountHolderSnapshot))
  const taxMatches = Boolean(taxItem && taxItem.withholdingBaseAmount === request.withholdingBaseAmount && taxItem.incomeTaxAmount === (request.incomeTaxAmount ?? 0) && taxItem.localIncomeTaxAmount === (request.localIncomeTaxAmount ?? 0) && taxItem.totalWithholdingTaxAmount === request.withholdingTaxAmount && taxItem.finalPaymentAmount === request.finalPaymentAmount)
  const amountDifference = currentAmount === undefined ? undefined : currentAmount - request.finalPaymentAmount
  const completed = request.status === 'payment_completed' || request.status === 'remittance_confirmed'
  return <div className="settlement-modal-backdrop" onMouseDown={(event) => { if (event.currentTarget === event.target) onClose() }}><aside aria-modal="true" className="payment-transfer-detail" role="dialog"><div className="preview-drawer__header"><div><p className="page-eyebrow">Transfer Check</p><h2>지급건 확인</h2></div><button aria-label="닫기" className="icon-button" onClick={onClose} type="button">×</button></div><dl><div><dt>행사명</dt><dd>{campaignService.getCampaignById(request.campaignId)?.campaignName}</dd></div><div><dt>지급대상</dt><dd>{request.recipientType === 'seller' ? '셀러' : '매니저'} · {request.recipientName}</dd></div><div><dt>사업자 유형</dt><dd>{businessTypeLabels[request.businessType]}</dd></div><div><dt>증빙/세무 유형</dt><dd>{transferTypeLabel(request)}</dd></div><div><dt>지급요청 금액</dt><dd>{money(request.finalPaymentAmount)}</dd></div><div><dt>현재 정산서 금액</dt><dd>{currentAmount === undefined ? '확인 불가' : money(currentAmount)}</dd></div>{amountDifference !== undefined && amountDifference !== 0 && <div><dt>차이</dt><dd>{amountDifference > 0 ? '+' : ''}{money(amountDifference)}</dd></div>}<div><dt>지급계좌 snapshot</dt><dd>{request.bankNameSnapshot && request.accountNumberSnapshot && request.accountHolderSnapshot ? `${request.bankNameSnapshot} · ${request.accountNumberSnapshot} · ${request.accountHolderSnapshot}` : '계좌 snapshot 미등록'}</dd></div>{completed && <><div><dt>입금 완료일시</dt><dd>{request.completedAt ? formatKoreanDateTime(request.completedAt) : '-'}</dd></div><div><dt>처리자</dt><dd>{request.completedBy ?? '-'}</dd></div><div><dt>실제 지급액</dt><dd>{money(request.actualPaidAmount ?? request.finalPaymentAmount)}</dd></div><div><dt>Batch ID</dt><dd>{request.payoutBatchId ?? '-'}</dd></div></>}</dl>
    {issues.length > 0 && <section className="payment-transfer-issues"><h3>확인이 필요한 항목</h3>{issues.map((issue) => <p key={issue}>⚠ {issue}</p>)}</section>}
    {accountChanged && <p className="settlement-readiness-modal__error">지급요청 이후 계좌정보가 변경되었습니다. 지급요청 수정 workflow에서 계좌를 정정해주세요.</p>}{transferType(request) === 'withholding' ? <section><h3>원천세 확인</h3><p className={taxMatches ? 'success-panel' : 'settlement-readiness-modal__error'}>{taxMatches ? '✓ 원천세 금액 일치' : '⚠ 정산서와 지급요청의 원천세 금액이 다릅니다.'}</p><dl><div><dt>원천세 신고금액</dt><dd>{money(request.withholdingBaseAmount)}</dd></div><div><dt>소득세 3%</dt><dd>- {money(request.incomeTaxAmount ?? 0)}</dd></div><div><dt>지방소득세 0.3%</dt><dd>- {money(request.localIncomeTaxAmount ?? 0)}</dd></div><div><dt>총 원천세</dt><dd>- {money(request.withholdingTaxAmount)}</dd></div><div><dt>최종 지급액</dt><dd>{money(request.finalPaymentAmount)}</dd></div><div><dt>원천세 리스트</dt><dd>{taxItem && taxItem.status !== 'canceled' ? '✓ 원천세 등록 완료' : '확인 필요'}</dd></div></dl></section> : <section><h3>{transferTypeLabel(request)} 확인</h3><p>증빙파일 {evidence.length ? `${evidence.length}건 첨부` : '미첨부'} · 현재 상태 {request.documentCheckStatus ?? '확인 필요'}</p><ReasonInput autoFocus={false} onChange={(event) => setMemo(event.target.value)} placeholder="확인 내용 또는 전달받은 내용을 입력해주세요." value={memo} /><div className="button-row">{canManage && <><button className="secondary-button" onClick={() => update('confirmed')} type="button">증빙 확인 완료</button>{transferType(request) === 'tax_invoice' && <><button className="secondary-button" onClick={() => update('reported_issued')} type="button">발행했다고 전달받음</button><button className="secondary-button" onClick={() => update('follow_up')} type="button">추후 확인 필요</button></>}</>}</div></section>}
    <button className="text-button" onClick={() => setShowMaster((value) => !value)} type="button">{request.recipientType === 'seller' ? '셀러' : '매니저'} 정보 확인하기</button>{showMaster && <section><h3>현재 Master 정보</h3><dl><div><dt>이름</dt><dd>{currentAccount?.name ?? request.recipientName}</dd></div><div><dt>은행</dt><dd>{currentAccount?.bankName || '미등록'}</dd></div><div><dt>계좌번호</dt><dd>{currentAccount?.accountNumber || '미등록'}</dd></div><div><dt>예금주</dt><dd>{currentAccount?.accountHolder || '미등록'}</dd></div></dl></section>}
    <div className="modal-actions"><button className="secondary-button" onClick={() => openSettlementStatement(request)} type="button">정산서 보기</button>{canManage && request.status === 'approval_pending' && <><button className="danger-button" onClick={() => setRejectOpen(true)} type="button">반려</button><button className="primary-button" onClick={() => { paymentRequestService.approvePaymentRequest(request.id); onSync() }} type="button">대표 승인</button></>}{canManage && request.status === 'approved' && <button className="primary-button" onClick={() => { paymentRequestService.markPaymentCompleted(request.id); onSync(); onClose() }} type="button">입금 완료 처리</button>}<button className="secondary-button" onClick={onClose} type="button">닫기</button></div><ReasonModal actionLabel="반려" onChange={setRejectReason} onClose={() => { setRejectOpen(false); setRejectReason('') }} onSubmit={() => { paymentRequestService.rejectPaymentRequest(request.id, rejectReason.trim()); setRejectOpen(false); setRejectReason(''); onSync(); onClose() }} open={rejectOpen} placeholder="지급요청 반려 사유를 입력해주세요." title="지급요청을 반려하시겠습니까?" value={rejectReason} /></aside></div>
}

function TransferListModal({ requests, onClose, onCopy, onComplete }: { requests: PaymentRequest[]; onClose: () => void; onCopy: (value: string) => void; onComplete: () => void }) {
  const total = requests.reduce((sum, request) => sum + request.finalPaymentAmount, 0)
  const ready = requests.every((request) => request.bankNameSnapshot && request.accountNumberSnapshot && request.accountHolderSnapshot && request.finalPaymentAmount > 0)
  const copyText = ['No.\t은행\t입금계좌\t예금주명\t이체금액\t행사명\t지급대상\t증빙/세무 유형', ...requests.map((request, index) => `${index + 1}\t${request.bankNameSnapshot ?? ''}\t${request.accountNumberSnapshot ?? ''}\t${request.accountHolderSnapshot ?? ''}\t${request.finalPaymentAmount}\t${campaignService.getCampaignById(request.campaignId)?.campaignName ?? ''}\t${request.recipientType === 'seller' ? '셀러' : '매니저'} ${request.recipientName}\t${transferTypeLabel(request)}`)].join('\n')
  return <div className="settlement-modal-backdrop" onMouseDown={(event) => { if (event.currentTarget === event.target) onClose() }}><section aria-modal="true" className="settlement-readiness-modal transfer-list-modal" role="dialog"><button aria-label="닫기" className="settlement-expanded-close" onClick={onClose} type="button">×</button><h2>이체 준비</h2><div className="transfer-list-overview"><div><span>선택 건수</span><strong>{requests.length}건</strong></div><div><span>총 이체금액</span><strong>{money(total)}</strong></div><div><span>검산 상태</span><strong>{ready ? '✓ 이상 없음' : '⚠ 확인 필요'}</strong></div></div><div className="responsive-table"><table><thead><tr><th>No.</th><th>은행</th><th>입금계좌</th><th>예금주명</th><th>이체금액</th><th>행사명</th><th>지급대상</th><th>증빙/세무 유형</th></tr></thead><tbody>{requests.map((request, index) => <tr key={request.id}><td>{index + 1}</td><td>{request.bankNameSnapshot || '미등록'}</td><td>{request.accountNumberSnapshot || '미등록'}</td><td>{request.accountHolderSnapshot || '미등록'}</td><td className="money-cell">{money(request.finalPaymentAmount)}</td><td>{campaignService.getCampaignById(request.campaignId)?.campaignName}</td><td>{request.recipientType === 'seller' ? '셀러' : '매니저'} · {request.recipientName}</td><td>{transferTypeLabel(request)}</td></tr>)}</tbody></table></div><div className="transfer-list-total"><span>총 선택 건수 {requests.length}건</span><strong>총 이체금액 {money(total)}</strong></div><div className="modal-actions"><button className="secondary-button" onClick={() => onCopy(copyText)} type="button">이체 목록 복사</button><button className="secondary-button" onClick={onClose} type="button">닫기</button><button className="primary-button" disabled={!ready} onClick={onComplete} type="button">입금 완료 처리</button></div></section></div>
}

function PaymentCompletionModal({ open, count, amount, onClose, onConfirm }: { open: boolean; count: number; amount: number; onClose: () => void; onConfirm: () => void }) {
  if (!open) return null
  return <div className="nested-modal-backdrop"><section aria-modal="true" className="helper-modal reason-modal" role="dialog"><div className="reason-modal__header"><h3>선택한 {count}건의 입금이 실제로 완료되었습니까?</h3><button aria-label="닫기" className="icon-button" onClick={onClose} type="button">×</button></div><p>기업 인터넷뱅킹에서 실제 송금을 마친 뒤에만 처리해주세요.</p><div className="transfer-list-total"><span>총 지급액</span><strong>{money(amount)}</strong></div><div className="modal-actions"><button className="secondary-button" onClick={onClose} type="button">취소</button><button className="primary-button" onClick={onConfirm} type="button">입금 완료</button></div></section></div>
}

function openSettlementStatement(request: ReturnType<typeof paymentRequestService.getOperationalPaymentRequests>[number]) {
  window.history.pushState({ from: window.location.pathname + window.location.search }, '', `/settlements/${encodeURIComponent(request.settlementId)}?document=${request.recipientType}`)
  window.dispatchEvent(new PopStateEvent('popstate'))
}

function StageRequestList({ requests, empty, onSelect, onSync, approval }: {
  requests: ReturnType<typeof paymentRequestService.getPaymentRequests>
  empty: string
  onSelect: (target: WorkflowTarget) => void
  onSync?: () => void
  approval?: boolean
}) {
  const [rejectTarget, setRejectTarget] = useState<string | null>(null)
  const [rejectReason, setRejectReason] = useState('')
  if (!requests.length) return <section className="workspace-card workspace-empty"><strong>{empty}</strong><p>처리할 요청이 생기면 이 탭에 자동으로 표시됩니다.</p></section>
  return <><section className="workspace-card"><div className="section-heading"><h2>지급요청 목록</h2><strong>{requests.length}건</strong></div>
    <div className="responsive-table payment-workflow-table"><table><thead><tr><th>공동구매명</th><th>대상</th><th>지급 대상</th><th>사업자 유형</th><th>필요 증빙</th><th>최종 지급금액</th><th>요청일시</th><th>요청자</th><th>현재 상태</th><th>연결 정보</th><th>정산서</th>{approval && <th>처리</th>}</tr></thead>
      <tbody>{requests.map((request) => <tr key={request.id} tabIndex={0} onClick={() => onSelect({ settlementId: request.settlementId, recipientType: request.recipientType })} onKeyDown={(event) => { if (event.key === 'Enter') onSelect({ settlementId: request.settlementId, recipientType: request.recipientType }) }}>
        <td><strong>{campaignService.getCampaignById(request.campaignId)?.campaignName}</strong></td><td>{request.recipientType === 'seller' ? '셀러' : '매니저'}</td><td>{request.recipientName}</td><td>{businessTypeLabels[request.businessType]}</td><td>{request.evidenceType === 'withholding_3_3' ? '원천세 리스트' : request.evidenceType === 'tax_invoice' ? '세금계산서' : request.evidenceType === 'cash_receipt' ? '현금영수증' : request.evidenceType}</td><td className="money-cell">{money(request.finalPaymentAmount)}</td><td>{formatKoreanDateTime(request.requestedAt)}</td><td>{request.requestedBy}</td><td><span className="status-badge settlement">{statusLabel[request.status]}</span></td><td><small>Settlement {request.settlementId}<br />Request {request.id}</small></td><td><button className="text-button" onClick={(event) => { event.stopPropagation(); openSettlementStatement(request) }} type="button">정산서 보기</button></td>
        {approval && <td><div className="button-row payment-approval-actions"><button className="secondary-button" onClick={(event) => { event.stopPropagation(); paymentRequestService.approvePaymentRequest(request.id); onSync?.() }}>대표 승인</button><button className="danger-button" onClick={(event) => { event.stopPropagation(); setRejectTarget(request.id) }}>반려</button></div></td>}
      </tr>)}</tbody></table></div>
  </section><ReasonModal actionLabel="반려" description="반려 후 해당 지급요청은 승인 대기 목록에서 제외됩니다." onChange={setRejectReason} onClose={() => { setRejectTarget(null); setRejectReason('') }} onSubmit={() => { if (!rejectTarget) return; paymentRequestService.rejectPaymentRequest(rejectTarget, rejectReason.trim()); setRejectTarget(null); setRejectReason(''); onSync?.() }} open={Boolean(rejectTarget)} placeholder="지급요청 반려 사유를 입력해주세요." title="지급요청을 반려하시겠습니까?" value={rejectReason} /></>
}

function PaymentWorkflowDetail({ target, backLabel, onBack, onSync }: { target: WorkflowTarget; backLabel: string; onBack: () => void; onSync: () => void }) {
  const [previewEvidence, setPreviewEvidence] = useState<PaymentEvidence | null>(null)
  const [freelancerConfirmationOpen, setFreelancerConfirmationOpen] = useState(false)
  const [requestMessage, setRequestMessage] = useState('')
  const [requestError, setRequestError] = useState('')
  useEffect(() => {
    if (!requestMessage) return
    const timeout = window.setTimeout(() => setRequestMessage(''), 2000)
    return () => window.clearTimeout(timeout)
  }, [requestMessage])
  const settlement = settlementService.getSettlementById(target.settlementId)
  if (!settlement) return <section className="workspace-card"><p>정산을 찾을 수 없습니다.</p><button className="secondary-button" onClick={onBack}>목록으로</button></section>
  const campaign = campaignService.getCampaignById(settlement.campaignId)
  if (!campaign) return null
  const isSeller = target.recipientType === 'seller'
  const recipientId = isSeller ? campaign.sellerId : campaign.managerId
  const recipientName = isSeller ? campaign.sellerName : campaign.managerName
  const sellerRule = sellerSettlementService.getSellerSettlementRule(campaign.id)
  const businessType: SellerBusinessType = isSeller ? sellerRule?.businessType ?? 'general_business' : managerPaymentService.getBusinessType(campaign.managerName)
  const recommended = paymentEvidenceService.getRecommendedEvidenceType(businessType) ?? 'other'
  const evidence = paymentEvidenceService.getEvidenceBySettlementId(settlement.id, target.recipientType)
    .sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt))[0]
  const request = paymentRequestService.getOperationalPaymentRequests().find((item) =>
    item.settlementId === settlement.id && item.recipientType === target.recipientType &&
    item.recipientId === recipientId && item.sourceVersion === settlement.settlementVersion)
  const taxItem = withholdingTaxService.getBySettlementOwner(settlement.id, target.recipientType, recipientId)
    .find((item) => item.sourceVersion === settlement.settlementVersion)
  const reasons = paymentRequestService.getPaymentRequestBlockReasons({
    settlementId: settlement.id, ownerType: target.recipientType, ownerId: recipientId, businessType,
    evidenceTypeConfirmed: isSeller ? Boolean(sellerRule?.evidenceConfirmed && sellerRule.confirmedEvidenceType) : true,
    accountConfirmed: settlement.accountConfirmed, calculationCompleted: true, calculationErrors: validateSettlement(settlement).errors,
    sourceVersion: settlement.settlementVersion,
  }).filter((reason) => reason !== '이미 지급요청된 건입니다.')
  const settlementConfirmed = ['approved', 'payment_ready', 'partially_paid', 'completed'].includes(settlement.status)
  const upload = async (file: File) => {
    const evidenceId = `evidence-${crypto.randomUUID()}`
    try {
      const stored = await paymentEvidenceStorageService.uploadEvidenceFile(file, {
        campaignId: campaign.id, settlementId: settlement.id, ownerType: target.recipientType, ownerId: recipientId, evidenceId,
      })
      const metadata = paymentEvidenceService.uploadEvidenceMetadata({
        id: evidenceId, campaignId: campaign.id, settlementId: settlement.id, ownerType: target.recipientType,
        ownerId: recipientId, ownerName: recipientName, businessType, evidenceType: recommended,
        fileName: file.name, fileType: file.type, fileSize: file.size, previewUrl: stored.previewUrl,
        storageBucket: stored.bucket, storagePath: stored.path, uploadedBy: '허수정', memo: '지급요청 상세 업로드',
      })
      try {
        await paymentEvidenceService.saveEvidenceToProvider(metadata)
      } catch (error) {
        paymentEvidenceService.removeEvidence(metadata.id)
        if (stored.path) await paymentEvidenceStorageService.deleteEvidenceFile(stored.path)
        throw error
      }
      onSync()
    } catch (error) {
      window.alert(error instanceof Error ? error.message : '증빙파일 업로드에 실패했습니다. 다시 시도해주세요.')
    }
  }
  const saveRequest = () => {
    setRequestError('')
    try {
      const accountConfirmed = settlement.accountConfirmed || (!isSeller && Boolean(managerPaymentService.getProfile(campaign.managerId)?.bankName && managerPaymentService.getProfile(campaign.managerId)?.accountNumber && managerPaymentService.getProfile(campaign.managerId)?.accountHolder))
      if (isSeller) paymentRequestService.createPaymentRequest(settlement.id, '허수정', { accountConfirmed })
      else { const profile = managerPaymentService.getProfile(campaign.managerId); paymentRequestService.createManagerPaymentRequest(settlement.id, '허수정', businessType, undefined, { accountConfirmed, bankNameSnapshot: profile?.bankName, accountNumberSnapshot: profile?.accountNumber, accountHolderSnapshot: profile?.accountHolder }) }
      setFreelancerConfirmationOpen(false)
      setRequestMessage('지급요청이 완료되었습니다.')
      onSync()
    } catch (error) { setRequestError(error instanceof Error ? error.message : '지급 요청을 생성하지 못했습니다.') }
  }
  const createRequest = () => businessType === 'freelancer' ? setFreelancerConfirmationOpen(true) : saveRequest()
  const completedStep = request?.status === 'payment_completed' || request?.status === 'remittance_confirmed'
  const approvedStep = request?.status === 'approved' || completedStep
  const requestedStep = Boolean(request)
  const evidenceApproved = businessType === 'freelancer' ? Boolean(taxItem) : evidence?.reviewStatus === 'approved'
  const evidenceUploaded = businessType === 'freelancer' ? Boolean(taxItem) : Boolean(evidence)
  const reviewStarted = businessType === 'freelancer'
    ? Boolean(taxItem)
    : Boolean(evidence && ['review_pending', 'approved'].includes(evidence.reviewStatus))
  const scheduledStep = approvedStep
  const steps = [
    { label: '정산 완료', owner: '정산팀', done: settlementConfirmed, started: true, description: '확정된 정산 결과와 최종 지급 기준금액을 확인합니다.' },
    { label: '증빙 업로드', owner: '셀러 또는 매니저', done: evidenceUploaded, started: evidenceUploaded, description: '사업자 유형에 맞는 지급 증빙자료를 등록합니다.' },
    { label: '증빙 검수', owner: DEFAULT_EVIDENCE_REVIEWER.name, done: evidenceApproved, started: reviewStarted, description: '업로드한 증빙의 유형과 금액을 담당자가 검수합니다.' },
    { label: '지급 요청', owner: '정산팀', done: requestedStep, started: requestedStep, description: '필수 조건을 확인하고 대표 승인 대상 지급요청을 생성합니다.' },
    { label: '대표 승인', owner: '대표', done: approvedStep, started: requestedStep, description: '대표가 최종 지급 대상과 금액을 승인합니다.' },
    { label: '지급 예정', owner: '정산팀', done: completedStep, started: scheduledStep, description: '대표 승인 후 예정일에 맞춰 송금을 준비합니다.' },
    { label: '지급 완료', owner: '정산팀', done: completedStep, started: completedStep, description: '실제 송금 또는 입금 확인 결과를 수동으로 완료 처리합니다.' },
  ]
  const currentStepIndex = Math.max(0, steps.findIndex((step) => !step.done))
  const currentStep = completedStep ? steps[steps.length - 1] : steps[currentStepIndex]
  const nextStep = steps.slice(currentStepIndex + 1).find((step) => !step.done)
  const checklist = [
    { label: '정산 완료', complete: settlementConfirmed },
    { label: '계좌 확인', complete: settlement.accountConfirmed },
    { label: '증빙 업로드', complete: evidenceUploaded },
    { label: '증빙 승인', complete: evidenceApproved },
    { label: '지급 요청 생성', complete: requestedStep },
    { label: '대표 승인', complete: approvedStep },
  ]
  const missingChecklist = checklist.filter((item) => !item.complete)
  const grossAmount = isSeller
    ? settlement.currentCalculation.sellerCommissionAmount
    : settlement.currentCalculation.managerBaseShareAmount + settlement.currentCalculation.managerReimbursementTotal
  const withholdingAmount = taxItem?.totalWithholdingTaxAmount ?? (request?.withholdingTaxAmount ?? 0)
  const finalAmount = request?.amount ?? (isSeller ? settlement.currentCalculation.finalSellerPaymentAmount : settlement.currentCalculation.managerAmount)
  const stage = completedStep ? ['지급 완료', '모든 지급 절차가 완료되었습니다.']
    : approvedStep ? ['대표 승인 완료', '지급 완료 처리를 진행해주세요.']
      : request?.status === 'sent' ? ['입금 확인 대기', '셀러 입금 확인을 진행해주세요.']
      : requestedStep ? ['대표 승인 대기', '대표 승인 대기 중입니다.']
        : evidence?.reviewStatus === 'review_pending' ? ['증빙 검수 중', '허수정 검수 대기 중입니다.']
          : evidence?.reviewStatus === 'rejected' ? ['증빙 반려', '반려 사유를 확인하고 다시 업로드해주세요.']
            : evidenceApproved ? ['지급요청 준비 완료', '지급요청을 생성해주세요.']
              : evidence ? ['증빙 업로드 완료', '증빙 검수를 요청해주세요.']
                : ['증빙자료 필요', businessType === 'freelancer' ? '원천세 리스트 등록 상태를 확인해주세요.' : `${evidenceLabels[recommended]}을 업로드해주세요.`]
  const freelancerCalculation = calculateWithholding(grossSettlementAmount(settlement, target.recipientType), isSeller ? settlement.currentCalculation.sellerDeductionTotal : settlement.currentCalculation.managerDeductionTotal)
  return <section className="payment-workflow-detail">
    {requestMessage && <div aria-live="polite" className="clipboard-toast">✓ {requestMessage}</div>}
    <header className="payment-stage-hero"><button className="text-button payment-back-link" onClick={onBack}>← {backLabel === '이전 화면' ? '지급 요청 목록' : backLabel}</button><div><p>지급요청 상세</p><h1>{campaign.campaignName}</h1><strong>다음 행동: {stage[1]}</strong></div></header>
    <section className="workspace-card payment-summary-card"><div className="section-heading"><div><p className="page-eyebrow">Payment Summary</p><h2>지급요청 요약</h2></div><span className={`status-badge ${completedStep ? 'done' : 'settlement'}`}>● {stage[0]}</span></div>
      <div className="payment-summary-items">
        <SummaryItem label="공동구매" value={campaign.campaignName} />
        <SummaryItem label="셀러" value={campaign.sellerName} />
        <SummaryItem label="담당 매니저" value={campaign.managerName} />
        <SummaryItem label="사업자 유형" value={businessTypeLabels[businessType]} />
        <SummaryItem label="판매채널" value={salesChannelLabels[sellerRule?.salesChannelType ?? campaign.salesChannelType ?? 'supplier_link']} />
        <SummaryItem label="최종 지급금" value={money(grossAmount)} />
        <SummaryItem label="원천세" value={money(withholdingAmount)} />
        <SummaryItem label="실 지급금" value={money(finalAmount)} />
        <SummaryItem label="현재 상태" value={stage[0]} />
      </div>
    </section>
    <div className="payment-workflow-overview">
      <section className="workspace-card payment-timeline-card">
        <div className="section-heading"><div><p className="page-eyebrow">Payment Timeline</p><h2>지급 진행 단계</h2></div><span className="status-badge progress">● 진행중</span></div>
        <ol className="payment-stepper">{steps.map((step, index) => {
          const current = completedStep ? index === steps.length - 1 : index === currentStepIndex
          const state = step.done && !current ? '완료' : current ? '진행중' : '예정'
          return <li className={step.done && !current ? 'is-done' : current ? 'is-current' : ''} key={step.label} title={step.description} tabIndex={0} aria-label={`${step.label}, ${state}. ${step.description}`}>
            <span>{step.done && !current ? '✓' : current ? '●' : index + 1}</span><strong>{step.label}</strong>
            <small className="timeline-owner">담당 · {step.owner}</small><em className={`timeline-state is-${state}`}>{state}</em>
            <span className="timeline-tooltip" role="tooltip">{step.description}</span>
          </li>
        })}</ol>
      </section>
      <aside className="workspace-card payment-current-card">
        <p className="page-eyebrow">Current Status</p><h2>현재 상태</h2>
        <span className={`status-badge ${completedStep ? 'done' : 'progress'}`}>● {stage[0]}</span>
        <dl><div><dt>담당자</dt><dd>{currentStep.owner}</dd></div><div><dt>다음 단계</dt><dd>{nextStep?.label ?? '모든 절차 완료'}</dd></div><div><dt>예상 지급일</dt><dd>{formatKoreanDate(settlement.paymentDueDate)}</dd></div></dl>
      </aside>
    </div>
    <section className={`workspace-card payment-checklist-card ${missingChecklist.length ? 'is-blocked' : 'is-ready'}`}>
      <div className="section-heading"><div><p className="page-eyebrow">Payment Readiness</p><h2>지급 가능 여부</h2></div><span className={`status-badge ${missingChecklist.length ? 'warning' : 'done'}`}>{missingChecklist.length ? '⚠ 확인 필요' : '✓ 지급 가능'}</span></div>
      <div className="payment-checklist">{checklist.map((item) => <div className={item.complete ? 'is-complete' : ''} key={item.label}><span aria-hidden="true">{item.complete ? '✓' : '○'}</span><strong>{item.label}</strong><small>{item.complete ? '완료' : '미완료'}</small></div>)}</div>
      {missingChecklist.length ? <div className="readiness-message"><strong>아직 지급할 수 없습니다.</strong><span>필요한 작업</span><ul>{missingChecklist.map((item) => <li key={item.label}>{item.label}</li>)}</ul></div> : <p className="readiness-message"><strong>현재 지급 가능합니다.</strong></p>}
    </section>
    <section className="workspace-card"><h2>2. 정산금 계산</h2><div className="payment-detail-sections"><SummaryItem label="부가세 포함 정산금" value={money(isSeller ? settlement.currentCalculation.sellerCommissionAmount : settlement.currentCalculation.managerBaseShareAmount)} />{!isSeller && <SummaryItem label="선결제 환급" value={money(settlement.currentCalculation.managerReimbursementTotal)} />}<SummaryItem label="차감" value={money(isSeller ? settlement.currentCalculation.sellerDeductionTotal : settlement.currentCalculation.managerDeductionTotal)} /><SummaryItem label="최종 지급액" value={money(request?.amount ?? (isSeller ? settlement.currentCalculation.finalSellerPaymentAmount : settlement.currentCalculation.managerAmount))} /></div></section>
    <section className="workspace-card"><h2>3. 증빙자료</h2><p>추천 자료: <strong>{businessType === 'freelancer' ? '원천세 리스트 자동 등록 · 필요 시 기타 증빙' : evidenceLabels[recommended]}</strong></p>
      {evidence && <><button className="evidence-preview-trigger" onClick={() => setPreviewEvidence(evidence)} type="button"><div className="evidence-detail-preview">{evidence.previewUrl && evidence.fileType.startsWith('image/') ? <img src={evidence.previewUrl} alt="증빙 미리보기" /> : <div className="file-placeholder">{evidence.fileType === 'application/pdf' ? 'PDF 크게 보기' : '파일 미리보기'}</div>}<div><strong>{evidence.fileName}</strong><p>{(evidence.fileSize / 1024).toFixed(1)} KB · {evidence.uploadedBy} · {formatKoreanDateTime(evidence.uploadedAt)}</p><span className="status-badge waiting">{reviewLabels[evidence.reviewStatus]}</span>{evidence.rejectionReason && <p className="danger-text">반려 사유: {evidence.rejectionReason}</p>}</div></div></button><EvidenceAiReviewCard evidence={evidence} context={buildAiContext(evidence, grossSettlementAmount(settlement, target.recipientType), sellerRule?.salesChannelType === 'seller_checkout')} onSync={onSync} /></>}
      <WorkflowAction evidence={evidence} businessType={businessType} request={request} reasons={reasons} onUpload={upload} onRequestReview={() => { if (evidence) paymentEvidenceService.requestEvidenceReview(evidence.id); onSync() }} onCreateRequest={createRequest} onComplete={() => { if (request?.status === 'sent') paymentRequestService.markSellerRemittanceConfirmed(request.id); else if (request) paymentRequestService.markPaymentCompleted(request.id); onSync() }} />
    </section>
    <section className="workspace-card"><h2>4. 계좌 확인</h2><p>{settlement.accountConfirmed ? '✓ 지급 계좌 확인 완료' : '지급 계좌 확인이 필요합니다.'}</p></section>
    <section className="workspace-card"><h2>5. 원천세</h2>{businessType === 'freelancer' && taxItem ? <div className="payment-detail-sections"><SummaryItem label="부가세 포함 정산금" value={money(taxItem.grossSettlementAmount)} /><SummaryItem label="부가세 제외 기준금액" value={money(taxItem.withholdingBaseAmount)} /><SummaryItem label="소득세 3%" value={money(taxItem.incomeTaxAmount)} /><SummaryItem label="지방소득세 0.3%" value={money(taxItem.localIncomeTaxAmount)} /><SummaryItem label="총 원천징수액" value={money(taxItem.totalWithholdingTaxAmount)} /><SummaryItem label="최종 지급액" value={money(taxItem.finalPaymentAmount)} /><SummaryItem label="원천세 리스트" value="등록 완료" /></div> : <p>{businessType === 'freelancer' ? '지급 요청 시 원천세 리스트에 자동 등록됩니다.' : '원천세 대상이 아닙니다.'}</p>}</section>
    <section className="workspace-card"><h2>6. 지급요청 상태</h2><p>{request ? statusLabel[request.status] : '지급요청 생성 전'}</p>{reasons.length > 0 && !request && <ul className="block-reasons">{reasons.map((reason) => <li key={reason}>{reason}</li>)}</ul>}</section>
    <section className="workspace-card"><h2>7. 승인·지급 이력</h2><div className="payment-history"><p>{request?.requestedAt ? `요청 · ${request.requestedBy} · ${formatKoreanDateTime(request.requestedAt)}` : '지급요청 이력 없음'}</p>{request?.approvedAt && <p>승인 · {request.approvedBy} · {formatKoreanDateTime(request.approvedAt)}</p>}{request?.completedAt && <p>지급 완료 · {request.completedBy} · {formatKoreanDateTime(request.completedAt)}</p>}</div></section>
    <EvidencePreviewModal evidence={previewEvidence} onClose={() => setPreviewEvidence(null)} />
    {freelancerConfirmationOpen && <div className="settlement-modal-backdrop"><section aria-modal="true" className="settlement-modal payment-request-modal" role="dialog"><div className="preview-drawer__header"><div><p className="page-eyebrow">Payment Request</p><h2>원천세 등록 및 지급 신청</h2></div><button className="icon-button" onClick={() => setFreelancerConfirmationOpen(false)} type="button">×</button></div><p>해당 {isSeller ? '셀러' : '매니저'}는 개인 프리랜서입니다.</p><p>지급 신청 시 원천세 리스트에 자동으로 등록됩니다.</p><table className="payment-request-summary-table"><tbody><tr><th>{isSeller ? '셀러명' : '매니저명'}</th><td>{recipientName}</td></tr><tr><th>원천세 신고금액</th><td className="money-cell">{money(freelancerCalculation.withholdingBaseAmount)}</td></tr><tr><th>소득세</th><td className="money-cell">- {money(freelancerCalculation.incomeTaxAmount)}</td></tr><tr><th>지방소득세</th><td className="money-cell">- {money(freelancerCalculation.localIncomeTaxAmount)}</td></tr>{!isSeller && settlement.currentCalculation.managerReimbursementTotal > 0 && <tr><th>선결제 환급</th><td className="money-cell">+ {money(settlement.currentCalculation.managerReimbursementTotal)}</td></tr>}<tr><th>{isSeller ? '최종 입금액' : '최종 지급액'}</th><td className="money-cell"><strong>{money(freelancerCalculation.finalPaymentAmount + (isSeller ? 0 : settlement.currentCalculation.managerReimbursementTotal))}</strong></td></tr></tbody></table><p className="withholding-confirmation">지급 신청하시겠습니까?</p>{requestError && <p className="payment-request-error">{requestError}</p>}<div className="button-row"><button className="secondary-button" onClick={() => setFreelancerConfirmationOpen(false)} type="button">취소</button><button className="primary-button" onClick={saveRequest} type="button">네</button></div></section></div>}
  </section>
}

function SummaryItem({ label, value }: { label: string; value: string }) {
  return <div><span>{label}</span><strong>{value}</strong></div>
}

function grossSettlementAmount(settlement: NonNullable<ReturnType<typeof settlementService.getSettlementById>>, ownerType: EvidenceOwnerType) {
  return ownerType === 'seller'
    ? settlement.currentCalculation.sellerCommissionAmount
    : settlement.currentCalculation.managerBaseShareAmount
}

function buildAiContext(evidence: PaymentEvidence, grossAmount: number, isSellerPaymentWindow: boolean): EvidenceExpectedContext {
  const expectedAmount = evidence.businessType === 'simplified_business' ? Math.round(grossAmount / 1.1) : Math.round(grossAmount)
  return {
    evidenceId: evidence.id,
    campaignId: evidence.campaignId,
    settlementId: evidence.settlementId,
    ownerType: evidence.ownerType,
    ownerId: evidence.ownerId,
    businessType: evidence.businessType,
    evidenceType: evidence.evidenceType,
    expectedAmount,
    isSellerPaymentWindow,
  }
}

function EvidenceAiReviewCard({ evidence, context, onSync }: { evidence: PaymentEvidence; context: EvidenceExpectedContext; onSync: () => void }) {
  const [analyzing, setAnalyzing] = useState(false)
  const review = evidenceAiReviewService.getEvidenceAiReview(evidence.id)
  const status = analyzing ? 'analyzing' : evidence.aiReviewStatus ?? review?.comparison.status ?? 'not_analyzed'
  const analyze = async () => {
    setAnalyzing(true)
    try {
      await evidenceAiReviewService.analyzeEvidenceMock(evidence, context)
    } catch {
      // 실패 상태와 Work Item 메모는 service가 저장한다.
    } finally {
      setAnalyzing(false)
      onSync()
    }
  }
  const statusMessage = status === 'matched' ? 'AI 1차 확인: 금액 일치'
    : status === 'mismatched' ? 'AI 1차 확인: 금액 불일치'
      : status === 'needs_review' ? 'AI가 금액을 확실히 읽지 못했습니다. 직접 확인해주세요.'
        : evidenceAiReviewService.getEvidenceAiStatusLabel(status)
  return <section className={`evidence-ai-card is-${status}`}>
    <div className="section-heading"><div><p className="page-eyebrow">Mock AI Review</p><h3>{statusMessage}</h3></div><span className={`status-badge ${status === 'matched' ? 'done' : status === 'mismatched' || status === 'failed' ? 'error' : 'waiting'}`}>{evidenceAiReviewService.getEvidenceAiStatusLabel(status)}</span></div>
    <p className="ai-mock-notice">현재 AI 판독 결과는 MVP Mock 데이터이며 실제 증빙 인식 결과가 아닙니다.</p>
    <div className="payment-detail-sections">
      <SummaryItem label="문서 유형" value={review?.extraction.documentType ?? '분석 전'} />
      <SummaryItem label="공급자명" value={review?.extraction.supplierName ?? '-'} />
      <SummaryItem label="발행일" value={review?.extraction.issueDate ?? '-'} />
      <SummaryItem label="공급가액" value={review?.extraction.supplyAmount === undefined ? '-' : money(review.extraction.supplyAmount)} />
      <SummaryItem label="부가세" value={review?.extraction.vatAmount === undefined ? '-' : money(review.extraction.vatAmount)} />
      <SummaryItem label="추출된 발행금액" value={review?.comparison.extractedAmount === undefined ? '-' : money(review.comparison.extractedAmount)} />
      <SummaryItem label="정산 기준금액" value={money(review?.comparison.expectedAmount ?? context.expectedAmount)} />
      <SummaryItem label="차액" value={review?.comparison.differenceAmount === undefined ? '-' : money(review.comparison.differenceAmount)} />
      <SummaryItem label="신뢰도" value={review ? `${Math.round(review.extraction.confidence * 100)}%` : '-'} />
      <SummaryItem label="분석 시간" value={review ? formatKoreanDateTime(review.analyzedAt) : '-'} />
    </div>
    {review?.extraction.warnings.length ? <ul className="block-reasons">{review.extraction.warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul> : null}
    {review && <p>{review.comparison.reason}</p>}
    <button className="secondary-button" disabled={analyzing} onClick={analyze} type="button">{review ? '다시 분석' : 'AI 1차 확인'}</button>
  </section>
}

function WorkflowAction({ evidence, businessType, request, reasons, onUpload, onRequestReview, onCreateRequest, onComplete }: {
  evidence?: PaymentEvidence; businessType: SellerBusinessType; request?: ReturnType<typeof paymentRequestService.getPaymentRequestById>
  reasons: string[]; onUpload: (file: File) => void | Promise<void>; onRequestReview: () => void; onCreateRequest: () => void; onComplete: () => void
}) {
  if (request?.status === 'payment_completed' || request?.status === 'remittance_confirmed') return <p className="success-panel">지급 완료 · {request.completedBy} · {request.completedAt ? formatKoreanDateTime(request.completedAt) : ''}</p>
  if (request?.status === 'sent') return <button className="primary-button" onClick={onComplete}>입금 확인 완료 처리</button>
  if (request?.status === 'approved') return <button className="primary-button" onClick={onComplete}>지급 완료 처리</button>
  if (request?.status === 'approval_pending') return <><p className="payment-notice">대표 승인 대기 중</p><button className="primary-button" disabled title="대표 승인 완료 후 사용할 수 있습니다.">지급 완료 처리</button></>
  if (businessType === 'freelancer' && !request) return <><button className="primary-button" disabled={Boolean(reasons.length)} title={reasons.length ? reasons.join(' · ') : undefined} onClick={onCreateRequest}>지급요청 생성</button>{reasons.length > 0 && <small>{reasons.join(' · ')}</small>}</>
  if (!evidence || evidence.reviewStatus === 'rejected') return <><div className="button-row"><label className="primary-button evidence-file-button">{evidence?.reviewStatus === 'rejected' ? '증빙 다시 업로드' : '증빙자료 업로드'}<input hidden type="file" accept="image/*,.pdf" onChange={(event) => { const file = event.target.files?.[0]; if (file) onUpload(file) }} /></label><button className="secondary-button" disabled title="증빙 업로드 후 사용할 수 있습니다.">증빙 검수 요청</button></div>{evidence?.rejectionReason && <p className="danger-text">반려 사유: {evidence.rejectionReason}</p>}</>
  if (evidence.reviewStatus === 'uploaded') return <div className="button-row"><button className="primary-button" onClick={onRequestReview}>증빙 검수 요청</button><label className="secondary-button evidence-file-button">파일 교체<input hidden type="file" accept="image/*,.pdf" onChange={(event) => { const file = event.target.files?.[0]; if (file) onUpload(file) }} /></label></div>
  if (evidence.reviewStatus === 'review_pending') return <><p className="payment-notice">허수정 검수 대기 중</p><button className="primary-button" disabled title="증빙 승인 완료 후 사용할 수 있습니다.">지급요청 생성</button></>
  return <><button className="primary-button" disabled={Boolean(reasons.length)} title={reasons.length ? reasons.join(' · ') : undefined} onClick={onCreateRequest}>지급요청 생성</button>{reasons.length > 0 && <small>{reasons.join(' · ')}</small>}</>
}

function ManagerScheduledTab({ onSync }: { onSync: () => void }) {
  const managers = managerPaymentService.getManagers()
  const [managerId, setManagerId] = useState(managers[0]?.id ?? '')
  const [selected, setSelected] = useState<string[]>([])
  const items = managerPaymentService.getScheduledItems(managerId)
  const manager = managers.find((item) => item.id === managerId)
  const selectable = items.filter((item) => !item.reasons.length)
  const selectedItems = items.filter((item) => selected.includes(item.settlement.id))
  const gross = selectedItems.reduce((sum, item) => sum + item.settlement.currentCalculation.managerAmount + item.settlement.currentCalculation.managerDeductionTotal, 0)
  const incomeTax = selectedItems.reduce((sum, item) => sum + (item.tax?.incomeTaxAmount ?? 0), 0)
  const localTax = selectedItems.reduce((sum, item) => sum + (item.tax?.localIncomeTaxAmount ?? 0), 0)
  const finalAmount = selectedItems.reduce((sum, item) => sum + item.finalAmount, 0)
  const requests = paymentRequestService.getOperationalPaymentRequests().filter((request) => request.managerId === managerId)
  const toggle = (id: string) => setSelected((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id])
  const createBatch = () => {
    managerPaymentService.createBatch(managerId, selected, '허수정')
    setSelected([])
    onSync()
  }
  return <>
    <section className="workspace-card manager-payment-header">
      <div><p className="page-eyebrow">Manager Payment Schedule</p><h2>{manager?.name ?? '매니저'} 매니저 정산 예정 리스트</h2></div>
      <select value={managerId} onChange={(event) => { setManagerId(event.target.value); setSelected([]) }}>
        {managers.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
      </select>
    </section>
    <div className="payment-kpi-grid manager-kpis">
      {[
        ['지급 가능 건수', selectable.length],
        ['증빙 대기 건수', items.filter((item) => item.reasons.some((reason) => reason.includes('증빙'))).length],
        ['요청 중 건수', requests.filter((item) => item.status === 'approval_pending' || item.status === 'approved').length],
        ['지급 완료 건수', requests.filter((item) => item.status === 'payment_completed').length],
        ['지급 가능 총액', money(selectable.reduce((sum, item) => sum + item.finalAmount, 0))],
      ].map(([label, value]) => <article key={label}><span>{label}</span><strong>{value}</strong></article>)}
    </div>
    <div className="manager-payment-columns">
      <section className="workspace-card compact-payment-list">
        <div className="section-heading"><div><h2>셀러 지급분</h2><p>담당 Campaign의 셀러 지급 상태를 확인합니다.</p></div></div>
        {!items.length ? <div className="workspace-empty"><strong>이 매니저가 담당한 셀러 지급 예정 건이 없습니다.</strong></div> : items.map(({ settlement, campaign }) => {
          const rule = sellerSettlementService.getSellerSettlementRule(campaign.id)
          const evidence = paymentEvidenceService.getEvidenceBySettlementId(settlement.id, 'seller')
          const request = paymentRequestService.getPaymentRequestForRecipient(settlement.id, 'seller', campaign.sellerId, settlement.settlementVersion)
          return <article className="payment-list-row" key={`seller-${settlement.id}`}>
            <input aria-label={`${campaign.campaignName} 셀러 지급 선택`} disabled title="정산 담당자만 요청 가능" type="checkbox" />
            <div><strong>{campaign.campaignName}</strong><small>{campaign.sellerName} · {formatKoreanDate(campaign.startDate)} ~ {formatKoreanDate(campaign.endDate)}</small><small>정산 담당자만 요청 가능</small></div>
            <div className="payment-row-meta"><span>{rule?.businessType ?? '미확인'} · {rule?.confirmedEvidenceType ?? '미확인'}</span><span>증빙 {evidence.some((item) => item.reviewStatus === 'approved') ? '승인' : '대기'}</span><span>{request ? statusLabel[request.status] : '요청 전'}</span><strong>{money(settlement.currentCalculation.finalSellerPaymentAmount)}</strong><small>{formatKoreanDate(settlement.paymentDueDate)}</small></div>
          </article>
        })}
      </section>
      <section className="workspace-card compact-payment-list">
        <div className="section-heading"><div><h2>매니저 정산분</h2><p>Campaign별 최종 지급액 전액을 선택합니다. 부분 요청은 지원하지 않습니다.</p></div></div>
        {!items.length ? <div className="workspace-empty"><strong>지급요청 가능한 매니저 정산 건이 없습니다.</strong></div> : items.map(({ settlement, campaign, finalAmount: itemFinal, reasons, tax }) =>
          <article className={`payment-list-row ${reasons.length ? 'is-disabled' : ''}`} key={`manager-${settlement.id}`}>
            <input aria-label={`${campaign.campaignName} 매니저 지급 선택`} checked={selected.includes(settlement.id)} disabled={Boolean(reasons.length)} onChange={() => toggle(settlement.id)} type="checkbox" />
            <div><strong>{campaign.campaignName}</strong><small>{formatKoreanDate(campaign.startDate)} ~ {formatKoreanDate(campaign.endDate)}</small><small>총매출 {money(settlement.currentCalculation.grossSales)} · 배분율 {settlement.currentCalculation.managerShareRate}%</small></div>
            <div className="payment-row-meta"><span>배분 대상 {money(settlement.currentCalculation.distributableVendorCommission)}</span><span>세무 차감 {money(tax?.totalWithholdingTaxAmount ?? 0)}</span><strong>{money(itemFinal)}</strong><span>{settlement.managerPaymentRequestStatus ? statusLabel[settlement.managerPaymentRequestStatus] : '요청 전'}</span><small>{formatKoreanDate(settlement.paymentDueDate)}</small></div>
            {reasons.length > 0 && <ul className="row-block-reasons">{reasons.map((reason) => <li key={reason}>{reason}</li>)}</ul>}
          </article>)}
      </section>
    </div>
    <section className="manager-selection-summary">
      <div><span>선택 건수</span><strong>{selected.length}건</strong></div>
      <div><span>선택 전 총액</span><strong>{money(gross)}</strong></div>
      <div><span>소득세 합계</span><strong>{money(incomeTax)}</strong></div>
      <div><span>지방소득세 합계</span><strong>{money(localTax)}</strong></div>
      <div><span>총 원천징수액</span><strong>{money(incomeTax + localTax)}</strong></div>
      <div><span>최종 지급요청액</span><strong>{money(finalAmount)}</strong></div>
      <button className="primary-button" disabled={!selected.length} onClick={createBatch} type="button">선택 건 지급요청</button>
    </section>
  </>
}

type PaymentRequestFilter = 'pending' | 'approved' | 'rejected' | 'canceled' | 'paid'

function RequestTab({ requests, evidence, onSelect }: { requests: ReturnType<typeof paymentRequestService.getOperationalPaymentRequests>; evidence: PaymentEvidence[]; onSelect: (target: WorkflowTarget) => void }) {
  const [filter, setFilter] = useState<PaymentRequestFilter>('pending')
  const filteredRequests = requests.filter((request) => {
    if (filter === 'pending') return ['evidence_pending', 'request_ready', 'approval_pending', 'on_hold'].includes(request.status)
    if (filter === 'approved') return ['approved', 'sent'].includes(request.status)
    if (filter === 'rejected') return request.status === 'rejected'
    if (filter === 'canceled') return request.status === 'canceled'
    return request.status === 'payment_completed' || request.status === 'remittance_confirmed'
  })
  return <>
    <div className="payment-kpi-grid">
      {[
        ['전체 요청', requests.length], ['증빙 검수 대기', evidence.filter((item) => item.reviewStatus === 'review_pending').length],
        ['승인 대기', requests.filter((item) => item.status === 'approval_pending').length],
        ['지급 예정', requests.filter((item) => item.status === 'approved').length],
      ].map(([label, value]) => <article key={label}><span>{label}</span><strong>{value}</strong></article>)}
    </div>
    <section className="workspace-card payment-request-source-note"><div><strong>정산관리 Payment Request 연동</strong><p>정산관리에서 실제 생성된 셀러·매니저 지급요청만 표시합니다.</p></div>
      <label>상태 필터<select aria-label="지급요청 상태 필터" value={filter} onChange={(event) => setFilter(event.target.value as PaymentRequestFilter)}><option value="pending">승인 대기</option><option value="approved">승인 완료</option><option value="rejected">반려</option><option value="canceled">취소</option><option value="paid">지급 완료</option></select></label>
    </section>
    <StageRequestList requests={filteredRequests} empty={`${filter === 'pending' ? '승인 대기' : filter === 'approved' ? '승인 완료' : filter === 'rejected' ? '반려' : filter === 'canceled' ? '취소' : '지급 완료'} 지급요청이 없습니다.`} onSelect={onSelect} />
  </>
}

function EvidenceReviewDetail({ evidenceId, backLabel, onBack, onOpenPayment, onSync }: {
  evidenceId: string; backLabel: string; onBack: () => void; onOpenPayment: (target: WorkflowTarget) => void; onSync: () => void
}) {
  const [previewOpen, setPreviewOpen] = useState(false)
  const [reviewMemo, setReviewMemo] = useState('')
  const [overrideConfirmed, setOverrideConfirmed] = useState(false)
  const [overrideReason, setOverrideReason] = useState('')
  const [rejectOpen, setRejectOpen] = useState(false)
  const [rejectReason, setRejectReason] = useState('')
  const evidence = paymentEvidenceService.getAllEvidence().find((item) => item.id === evidenceId)
  if (!evidence) return <section className="workspace-card workspace-empty"><strong>증빙자료를 찾을 수 없습니다.</strong><button className="secondary-button" onClick={onBack}>← {backLabel}</button></section>
  const campaign = campaignService.getCampaignById(evidence.campaignId)
  const settlement = settlementService.getSettlementById(evidence.settlementId)
  if (!campaign || !settlement) return null
  const request = paymentRequestService.getOperationalPaymentRequests().find((item) =>
    item.settlementId === evidence.settlementId && item.recipientType === evidence.ownerType && item.recipientId === evidence.ownerId)
  const sellerRule = sellerSettlementService.getSellerSettlementRule(evidence.campaignId)
  const recommended = paymentEvidenceService.getRecommendedEvidenceType(evidence.businessType) ?? 'other'
  const gross = grossSettlementAmount(settlement, evidence.ownerType)
  const aiContext = buildAiContext(evidence, gross, evidence.ownerType === 'seller' && sellerRule?.salesChannelType === 'seller_checkout')
  const aiReview = evidenceAiReviewService.getEvidenceAiReview(evidence.id)
  const finalAmount = request?.amount ?? (evidence.ownerType === 'seller' ? settlement.currentCalculation.finalSellerPaymentAmount : settlement.currentCalculation.managerAmount)
  const history = paymentEvidenceService.getEvidenceBySettlementId(evidence.settlementId, evidence.ownerType)
    .filter((item) => item.evidenceType === evidence.evidenceType).sort((a, b) => (a.revision ?? 1) - (b.revision ?? 1))
  const reject = () => {
    paymentEvidenceService.rejectEvidence(evidence.id, rejectReason.trim(), DEFAULT_EVIDENCE_REVIEWER.name)
    setRejectOpen(false)
    setRejectReason('')
    onSync()
  }
  const approve = () => {
    if (aiReview?.comparison.status === 'mismatched' && (!overrideConfirmed || !overrideReason.trim())) return
    paymentEvidenceService.approveEvidence(evidence.id, DEFAULT_EVIDENCE_REVIEWER.name, reviewMemo.trim() || '증빙 내용 수동 확인 완료', overrideReason)
    onSync()
  }
  return <section className="payment-workflow-detail">
    <header className="payment-stage-hero"><button className="text-button" onClick={onBack}>← {backLabel}</button><div><p>Evidence Review</p><h1>{campaign.campaignName} 증빙 검수</h1><strong>{DEFAULT_EVIDENCE_REVIEWER.name} · {DEFAULT_EVIDENCE_REVIEWER.role}</strong></div></header>
    <section className="workspace-card"><h2>검수 대상</h2><div className="payment-detail-sections"><SummaryItem label="공동구매명" value={campaign.campaignName} /><SummaryItem label="지급 대상" value={evidence.ownerType === 'seller' ? '셀러' : '매니저'} /><SummaryItem label="대상자" value={evidence.ownerName} /><SummaryItem label="사업자 유형" value={evidence.businessType} /><SummaryItem label="추천 증빙" value={evidenceLabels[recommended]} /><SummaryItem label="최종 증빙" value={evidenceLabels[evidence.evidenceType]} /><SummaryItem label="계좌 확인" value={settlement.accountConfirmed ? '확인 완료' : '미확인'} /><SummaryItem label="검수 상태" value={reviewLabels[evidence.reviewStatus]} /></div></section>
    <section className="workspace-card"><h2>1. 정산 기준금액</h2><div className="payment-detail-sections"><SummaryItem label="정산 기준 금액" value={money(aiContext.expectedAmount)} /><SummaryItem label="증빙 발행 금액" value={aiReview?.comparison.extractedAmount === undefined ? 'AI 분석 또는 직접 확인 필요' : money(aiReview.comparison.extractedAmount)} /><SummaryItem label="최종 지급액" value={money(finalAmount)} /></div></section>
    <section className="workspace-card"><h2>2. 증빙 확대 미리보기</h2><button className="evidence-preview-trigger evidence-wide-trigger" onClick={() => setPreviewOpen(true)} type="button">{evidence.previewUrl && evidence.fileType.startsWith('image/') ? <img className="evidence-large-preview" src={evidence.previewUrl} alt="증빙 이미지 크게 보기" /> : <div className="file-placeholder">{evidence.fileType === 'application/pdf' ? 'PDF 크게 보기' : '현재 세션에서 미리보기를 사용할 수 없습니다.'}</div>}</button><div className="payment-detail-sections"><SummaryItem label="파일명" value={evidence.fileName} /><SummaryItem label="파일 크기" value={`${(evidence.fileSize / 1024).toFixed(1)} KB`} /><SummaryItem label="업로드자" value={evidence.uploadedBy} /><SummaryItem label="업로드일" value={formatKoreanDateTime(evidence.uploadedAt)} /></div></section>
    <section className="workspace-card"><h2>3. AI 1차 확인 결과</h2><EvidenceAiReviewCard evidence={evidence} context={aiContext} onSync={onSync} /></section>
    <section className="workspace-card"><h2>4. 허수정 최종 검수</h2><p>AI 결과와 관계없이 허수정 담당자의 최종 승인 또는 반려가 필수입니다.</p>
      {evidence.reviewStatus === 'review_pending' && <>
        <label className="review-field">검수 메모<textarea value={reviewMemo} onChange={(event) => setReviewMemo(event.target.value)} placeholder="확인 내용과 판단 근거를 입력해주세요." /></label>
        {aiReview?.comparison.status === 'mismatched' && <div className="exception-approval-panel"><label><input checked={overrideConfirmed} onChange={(event) => setOverrideConfirmed(event.target.checked)} type="checkbox" /> 금액 불일치를 확인했으며 예외 승인을 진행합니다.</label><ReasonInput autoFocus={false} onChange={(event) => setOverrideReason(event.target.value)} placeholder="예외 승인 사유를 입력해주세요." value={overrideReason} /></div>}
        <div className="button-row"><button className="primary-button" disabled={aiReview?.comparison.status === 'mismatched' && (!overrideConfirmed || !overrideReason.trim())} onClick={approve}>검수 승인</button><button className="danger-button" onClick={() => setRejectOpen(true)}>반려</button></div>
      </>}
      {evidence.reviewStatus !== 'review_pending' && <p className="payment-notice">{reviewLabels[evidence.reviewStatus]} · {evidence.reviewedBy ?? '미검수'} {evidence.reviewMemo ? `· ${evidence.reviewMemo}` : ''}{evidence.overrideReason ? ` · 예외 승인: ${evidence.overrideReason}` : ''}</p>}
    </section>
    <section className="workspace-card"><h2>5. 검수 이력</h2><div className="payment-history">{history.map((item) => <p key={item.id}>revision {item.revision ?? 1} · {reviewLabels[item.reviewStatus]} · {item.reviewedBy ?? '미검수'} {item.reviewedAt ? `· ${formatKoreanDateTime(item.reviewedAt)}` : ''} {item.rejectionReason ? `· ${item.rejectionReason}` : ''} {item.overrideReason ? `· 예외 승인: ${item.overrideReason}` : ''}</p>)}</div></section>
    <div className="button-row evidence-review-actions">
      <button className="secondary-button" onClick={() => onOpenPayment({ settlementId: evidence.settlementId, recipientType: evidence.ownerType })}>지급요청 상세 보기</button>
      <button className="text-button" onClick={onBack}>← {backLabel}</button>
    </div>
    <EvidencePreviewModal evidence={previewOpen ? evidence : null} onClose={() => setPreviewOpen(false)} />
    <ReasonModal actionLabel="반려" description="금액·상호·사업자번호·증빙 유형 등을 확인한 반려 사유를 남겨주세요." onChange={setRejectReason} onClose={() => { setRejectOpen(false); setRejectReason('') }} onSubmit={reject} open={rejectOpen} placeholder="증빙자료 반려 사유를 입력해주세요." title="증빙자료를 반려하시겠습니까?" value={rejectReason} />
  </section>
}

function EvidenceTab({ evidence, onSync, onSelect }: { evidence: PaymentEvidence[]; onSync: () => void; onSelect: (id: string) => void }) {
  const [previewEvidence, setPreviewEvidence] = useState<PaymentEvidence | null>(null)
  const [rejectTarget, setRejectTarget] = useState<string | null>(null)
  const [rejectReason, setRejectReason] = useState('')
  const savedFilters = JSON.parse(sessionStorage.getItem('t3_evidence_review_filters') ?? '{}') as Record<string, string>
  const [owner, setOwner] = useState(savedFilters.owner ?? '')
  const [documentType, setDocumentType] = useState(savedFilters.documentType ?? '')
  const [review, setReview] = useState(savedFilters.review ?? 'review_pending')
  const [uploadedDate, setUploadedDate] = useState(savedFilters.uploadedDate ?? '')
  const [manager, setManager] = useState(savedFilters.manager ?? '')
  useEffect(() => {
    sessionStorage.setItem('t3_evidence_review_filters', JSON.stringify({ owner, documentType, review, uploadedDate, manager }))
  }, [owner, documentType, review, uploadedDate, manager])
  const managers = managerPaymentService.getManagers()
  const filtered = evidence.filter((item) => {
    const campaign = campaignService.getCampaignById(item.campaignId)
    return (!owner || item.ownerType === owner) && (!documentType || item.evidenceType === documentType) &&
      (!review || item.reviewStatus === review) && (!uploadedDate || item.uploadedAt.startsWith(uploadedDate)) &&
      (!manager || campaign?.managerId === manager)
  })
  const today = new Date().toISOString().slice(0, 10)
  const reviewKpis = [
    ['전체 검수 대기', evidence.filter((item) => item.reviewStatus === 'review_pending').length],
    ['셀러 증빙 대기', evidence.filter((item) => item.ownerType === 'seller' && item.reviewStatus === 'review_pending').length],
    ['매니저 증빙 대기', evidence.filter((item) => item.ownerType === 'manager' && item.reviewStatus === 'review_pending').length],
    ['오늘 업로드', evidence.filter((item) => item.uploadedAt.startsWith(today)).length],
    ['반려', evidence.filter((item) => item.reviewStatus === 'rejected').length],
    ['승인 완료', evidence.filter((item) => item.reviewStatus === 'approved').length],
  ] as const
  return <>
    <div className="payment-kpi-grid evidence-review-kpis">{reviewKpis.map(([label, value]) => <article key={label}><span>{label}</span><strong>{value}</strong></article>)}</div>
    <section className="workspace-card"><div className="section-heading"><div><h2>증빙 검수 관리자 화면</h2><p>허수정 담당자가 업로드된 셀러·매니저 증빙만 검수합니다. 업로드와 지급 처리는 지급요청 상세에서 진행합니다.</p></div><strong>{filtered.length}건</strong></div>
      <div className="evidence-admin-filters"><select value={owner} onChange={(e) => setOwner(e.target.value)}><option value="">셀러·매니저 전체</option><option value="seller">셀러</option><option value="manager">매니저</option></select><select value={documentType} onChange={(e) => setDocumentType(e.target.value)}><option value="">증빙 유형 전체</option>{Object.entries(evidenceLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select><select value={review} onChange={(e) => setReview(e.target.value)}><option value="">검수 상태 전체</option>{Object.entries(reviewLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select><input aria-label="업로드일" type="date" value={uploadedDate} onChange={(e) => setUploadedDate(e.target.value)} /><select value={manager} onChange={(e) => setManager(e.target.value)}><option value="">담당 매니저 전체</option>{managers.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></div>
      <div className="evidence-review-grid">{filtered.map((item) => <article className="evidence-card" key={item.id}>
        <button className="evidence-thumbnail-button" onClick={() => setPreviewEvidence(item)} type="button">{item.previewUrl && item.fileType.startsWith('image/') ? <img src={item.previewUrl} alt={`${item.ownerName} 증빙 크게 보기`} /> : <div className="file-placeholder">{item.fileType === 'application/pdf' ? 'PDF 크게 보기' : '파일 미리보기'}</div>}</button>
        <div><span className={`status-badge ${item.reviewStatus === 'approved' ? 'done' : item.reviewStatus === 'rejected' ? 'error' : 'waiting'}`}>{reviewLabels[item.reviewStatus]}</span><h3>{item.ownerName} · {item.ownerType === 'seller' ? '셀러' : '매니저'}</h3><p>{campaignService.getCampaignById(item.campaignId)?.campaignName} · 담당 매니저 {campaignService.getCampaignById(item.campaignId)?.managerName}</p><p>{item.businessType} · {evidenceLabels[item.evidenceType]} · {item.fileName}</p><small>{item.uploadedBy} · {formatKoreanDateTime(item.uploadedAt)} · 지급 예정일 {formatKoreanDate(settlementService.getSettlementById(item.settlementId)?.paymentDueDate)}</small>{item.rejectionReason && <p className="danger-text">반려: {item.rejectionReason}</p>}</div>
        <div className="button-row">
          {item.reviewStatus === 'review_pending' && <><button className="secondary-button" disabled={item.aiReviewStatus === 'mismatched'} title={item.aiReviewStatus === 'mismatched' ? '상세에서 예외 승인 사유를 입력해주세요.' : undefined} onClick={() => { paymentEvidenceService.approveEvidence(item.id); onSync() }}>승인</button><button className="danger-button" onClick={() => setRejectTarget(item.id)}>반려</button></>}
          <button className="text-button" onClick={() => onSelect(item.id)}>상세 보기</button>
        </div>
      </article>)}</div>
      {!filtered.length && <div className="workspace-empty"><strong>검수할 증빙자료가 없습니다.</strong><p>지급요청 상세에서 업로드 및 검수 요청된 자료가 표시됩니다.</p></div>}
    </section>
    <EvidencePreviewModal evidence={previewEvidence} onClose={() => setPreviewEvidence(null)} />
    <ReasonModal actionLabel="반려" onChange={setRejectReason} onClose={() => { setRejectTarget(null); setRejectReason('') }} onSubmit={() => { if (!rejectTarget) return; paymentEvidenceService.rejectEvidence(rejectTarget, rejectReason.trim()); setRejectTarget(null); setRejectReason(''); onSync() }} open={Boolean(rejectTarget)} placeholder="증빙자료 반려 사유를 입력해주세요." title="증빙자료를 반려하시겠습니까?" value={rejectReason} />
  </>
}

function WithholdingTab({ assertion, onSync }: { assertion: ReturnType<typeof runWithholdingAssertions>; onSync: () => void }) {
  const [month, setMonth] = useState('')
  const [owner, setOwner] = useState('')
  const [status, setStatus] = useState('')
  const [copyToast, setCopyToast] = useState<{ message: string; error?: boolean } | null>(null)
  useEffect(() => {
    if (!copyToast) return
    const timeout = window.setTimeout(() => setCopyToast(null), 2000)
    return () => window.clearTimeout(timeout)
  }, [copyToast])
  const items = withholdingTaxService.getItems().filter((item) => (!month || item.paymentMonth === month) && (!owner || item.ownerType === owner) && (!status || item.status === status))
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(JSON.stringify(withholdingTaxService.toCsvRows(items), null, 2))
      setCopyToast({ message: '클립보드로 복사되었습니다.' })
    } catch { setCopyToast({ message: '복사하지 못했습니다. 다시 시도해주세요.', error: true }) }
  }
  return <>
    {copyToast && <div aria-live="polite" className={`clipboard-toast ${copyToast.error ? 'is-error' : ''}`}>{copyToast.error ? '!' : '✓'} {copyToast.message}</div>}
    <div className="payment-kpi-grid tax-kpis">{[
      ['이번 달 등록 건수', items.length], ['신고 준비', items.filter((i) => i.status === 'ready').length],
      ['업로드 완료', items.filter((i) => i.status === 'uploaded').length], ['신고 완료', items.filter((i) => i.status === 'reported').length],
      ['납부 완료', items.filter((i) => i.status === 'paid').length], ['수정 필요', items.filter((i) => i.status === 'revision_required').length],
    ].map(([label, value]) => <article key={label}><span>{label}</span><strong>{value}</strong></article>)}</div>
    <section className="workspace-card">
      <div className="section-heading"><div><h2>프리랜서 3.3% 원천세 리스트</h2><p>홈택스 형식이 아닌 내부 검토용 MVP 데이터입니다.</p></div><div className="button-row"><button className="secondary-button" onClick={copy}>클립보드 복사</button><button className="secondary-button" onClick={() => window.alert('회사 홈택스 템플릿 확보 후 다운로드 형식을 연결합니다.')}>다운로드 placeholder</button></div></div>
      <div className="tax-filters"><input type="month" value={month} onChange={(e) => setMonth(e.target.value)} /><select value={owner} onChange={(e) => setOwner(e.target.value)}><option value="">셀러·매니저 전체</option><option value="seller">셀러</option><option value="manager">매니저</option></select><select value={status} onChange={(e) => setStatus(e.target.value)}><option value="">상태 전체</option>{Object.entries(taxStatusLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></div>
      <div className="responsive-table tax-table"><table><thead><tr><th>지급월</th><th>지급일</th><th>공동구매</th><th>구분</th><th>셀러 또는 매니저</th><th>부가세 포함 정산금</th><th>부가세 제외 기준금액</th><th>소득세 3%</th><th>지방소득세 0.3%</th><th>총 원천징수액</th><th>최종 지급액</th><th>상태</th><th>담당자</th><th>수동 처리</th></tr></thead>
      <tbody>{items.map((item) => <tr key={item.id}><td>{item.paymentMonth}</td><td>{formatKoreanDate(item.paymentDate)}</td><td>{campaignService.getCampaignById(item.campaignId)?.campaignName}</td><td>{item.ownerType === 'seller' ? '셀러' : '매니저'}</td><td>{item.ownerName}</td><td className="money-cell">{money(item.grossSettlementAmount)}</td><td className="money-cell">{money(item.withholdingBaseAmount)}</td><td className="money-cell">{money(item.incomeTaxAmount)}</td><td className="money-cell">{money(item.localIncomeTaxAmount)}</td><td className="money-cell">{money(item.totalWithholdingTaxAmount)}</td><td className="money-cell"><strong>{money(item.finalPaymentAmount)}</strong></td><td>{taxStatusLabels[item.status]}</td><td>{item.updatedBy}</td><td><select value={item.status} onChange={(e) => { withholdingTaxService.updateStatus(item.id, e.target.value as WithholdingTaxStatus); onSync() }}>{['ready', 'uploaded', 'reported', 'paid'].map((value) => <option key={value} value={value}>{taxStatusLabels[value as WithholdingTaxStatus]}</option>)}</select></td></tr>)}</tbody></table></div>
    </section>
    <section className={`calculation-log ${assertion.passed ? 'is-valid' : 'is-invalid'}`}><h3>사례 A 계산 로그 · {assertion.passed ? '검증 통과' : '검증 실패'}</h3>{assertion.calculation.log.map((line) => <code key={line}>{line}</code>)}</section>
  </>
}

// 이전 상세 운영 도구는 직접 URL 호환을 위해 유지하지만 새 지급승인 기본 화면에서는 렌더링하지 않습니다.
void ManagerScheduledTab
void RequestTab
void EvidenceTab
void WithholdingTab
