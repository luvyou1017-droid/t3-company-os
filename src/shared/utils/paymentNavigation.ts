export type PaymentNavigationSource = { from: string; label: string }

export function openPaymentDetail(settlementId: string, recipientType: 'seller' | 'manager', source?: PaymentNavigationSource) {
  const current = `${window.location.pathname}${window.location.search}`
  const state = source ?? { from: current, label: current.startsWith('/campaigns/') ? '공동구매 상세' : '지급 요청 목록' }
  window.history.pushState(state, '', `/payments/detail?settlementId=${encodeURIComponent(settlementId)}&recipientType=${recipientType}`)
  window.dispatchEvent(new PopStateEvent('popstate', { state }))
}

export function openEvidenceReviewDetail(evidenceId: string) {
  const state = { from: '/payments?tab=evidence-review', label: '증빙 검수' }
  window.history.pushState(state, '', `/payments/evidence-review/${encodeURIComponent(evidenceId)}`)
  window.dispatchEvent(new PopStateEvent('popstate', { state }))
}
