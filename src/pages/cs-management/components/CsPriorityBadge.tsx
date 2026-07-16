import type { CsPriority } from '../../../features/cs/types'

const labels: Record<CsPriority, string> = { urgent: '긴급', high: '높음', medium: '보통', low: '낮음' }

export function CsPriorityBadge({ priority }: { priority: CsPriority }) {
  return <span className={`work-priority work-priority--${priority}`}>● {labels[priority]}</span>
}
