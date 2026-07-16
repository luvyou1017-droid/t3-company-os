import { useMemo, useState } from 'react'
import { sampleService } from '../../../features/samples/services/sampleService'
import type { SampleRequest } from '../../../features/samples/types'
import { SampleCostOwnerBadge, SampleStatusBadge } from '../../sample-management/components/SampleBadges'
import { CreateSampleModal } from '../../sample-management/components/CreateSampleModal'

export function CampaignSampleTab({ campaignId }: { campaignId: string }) {
  const [samples, setSamples] = useState(() => sampleService.listSamples())
  const [creating, setCreating] = useState(false)
  const campaignSamples = useMemo(() => samples.filter((sample) => sample.campaignId === campaignId), [samples, campaignId])

  const createSample = (sample: SampleRequest) => {
    sampleService.createSample({ ...sample, campaignId })
    setSamples(sampleService.listSamples())
    setCreating(false)
  }

  return (
    <section className="detail-card">
      <div className="checklist-head"><div><h3>샘플</h3><p>샘플 관리 목록과 같은 mock 데이터 소스를 사용합니다.</p></div><button className="primary-button" onClick={() => setCreating(true)} type="button">새 샘플 요청</button></div>
      <div className="comparison-table-wrap">
        <table className="comparison-table">
          <thead><tr><th>상품</th><th>옵션</th><th>유상·무상</th><th>비용 부담자</th><th>배송 상태</th><th>회수 여부</th><th>정산 반영 여부</th><th></th></tr></thead>
          <tbody>{campaignSamples.map((sample) => <tr key={sample.id}><td>{sample.productName}</td><td>{sample.optionName}</td><td>{sample.paymentType}</td><td><SampleCostOwnerBadge owner={sample.costOwner} /></td><td><SampleStatusBadge status={sample.status} /></td><td>{sample.returnRequired ? sample.returnedAt ? '회수 완료' : '회수 필요' : '불필요'}</td><td>{sample.settlementReflected ? '완료' : '대기'}</td><td><button className="secondary-button" type="button">샘플 상세 보기</button></td></tr>)}</tbody>
        </table>
      </div>
      {creating && <CreateSampleModal onClose={() => setCreating(false)} onCreate={createSample} />}
    </section>
  )
}
