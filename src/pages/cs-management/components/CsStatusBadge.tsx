import type { CsStatus } from '../../../features/cs/types'

export function CsStatusBadge({ status }: { status: CsStatus }) {
  const tone = status === '처리 완료' ? 'complete' : status.includes('대기') ? 'settlement' : status === '신규' ? 'warning' : 'progress'
  return <span className={`campaign-status campaign-status--${tone}`}>{status}</span>
}
