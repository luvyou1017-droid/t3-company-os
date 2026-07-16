import { getSampleStatusTone } from '../../../features/samples/sampleUtils'
import type { SampleCostOwner, SampleStatus } from '../../../features/samples/types'

export function SampleStatusBadge({ status }: { status: SampleStatus }) {
  return <span className={`campaign-status campaign-status--${getSampleStatusTone(status)}`}>{status}</span>
}

export function SampleCostOwnerBadge({ owner }: { owner: SampleCostOwner }) {
  const tone = owner === '미정' ? 'muted' : owner === '회사' || owner === '셀러' ? 'settlement' : 'progress'
  return <span className={`campaign-status campaign-status--${tone}`}>{owner}</span>
}
