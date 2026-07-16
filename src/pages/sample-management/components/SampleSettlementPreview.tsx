import { calculateSampleSettlementTarget } from '../../../features/samples/sampleUtils'
import type { SampleRequest } from '../../../features/samples/types'

export function SampleSettlementPreview({ sample }: { sample: SampleRequest }) {
  return <p className={sample.costOwner === '미정' ? 'mock-notice' : 'mock-status'}>{calculateSampleSettlementTarget(sample)}</p>
}
