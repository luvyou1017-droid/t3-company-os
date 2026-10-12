import type { PaymentRequest } from '../types/sellerSettlement'

export function planPaymentBatchApproval(ids: string[], requests: PaymentRequest[], issues: (request: PaymentRequest) => string[]) {
  const unique = [...new Set(ids)]
  if (!unique.length || unique.length > 100) throw new Error('승인할 지급요청을 1~100건 선택해주세요.')
  const rows = unique.map(id => {
    const matches = requests.filter(item => item.id === id)
    const request = matches[0]
    const reasons = matches.length !== 1 ? ['지급요청 ID 누락 또는 중복'] : request.status !== 'approval_pending' ? ['대표 승인 대기 상태가 아님'] : issues(request).filter(reason => reason !== '대표 승인 필요')
    return { id, request, reasons }
  })
  const ready = rows.filter(row => row.reasons.length === 0)
  return { rows, ready, total: ready.reduce((sum, row) => sum + row.request.finalPaymentAmount, 0) }
}

export function approvePlannedRequests(requests: PaymentRequest[], readyIds: string[], actor: string, at: string) {
  const ids = new Set(readyIds)
  return requests.map(request => ids.has(request.id) && request.status === 'approval_pending' ? { ...request, status: 'approved' as const, approvedBy: actor, approvedAt: at } : request)
}
