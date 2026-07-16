import { useMemo } from 'react'
import type { CampaignChecklistItem, CampaignDetail } from '../../../features/campaignDetail/types'

type CampaignOverviewTabProps = {
  detail: CampaignDetail
  checklist: CampaignChecklistItem[]
}

function getChecklistRate(checklist: CampaignChecklistItem[]) {
  const completed = checklist.filter((item) => item.completed).length
  return Math.round((completed / checklist.length) * 100)
}

export function CampaignOverviewTab({ detail, checklist }: CampaignOverviewTabProps) {
  const checklistRate = useMemo(() => getChecklistRate(checklist), [checklist])

  const info = [
    ['셀러', detail.sellerName],
    ['브랜드', detail.brandName],
    ['상품', detail.productName],
    ['옵션', detail.options.join(', ')],
    ['행사 차수', detail.round],
    ['담당 매니저', detail.managerName],
    ['MD', detail.mdName],
    ['링크 주체', detail.linkOwner],
    ['셀러 사업자 유형', detail.sellerBusinessType],
    ['판매 기간', `${detail.startDate} ~ ${detail.endDate}`],
    ['정산 예정일', detail.settlementDueDate],
    ['연락처', detail.contact],
  ]

  const progress = [
    ['체크리스트 완료율', `${checklistRate}%`],
    ['링크 검수 상태', detail.linkReviewStatus],
    ['샘플 상태', detail.sampleStatus],
    ['미처리 CS 수', `${detail.pendingCsCount}건`],
    ['판매 데이터 상태', detail.salesDataStatus],
    ['정산 상태', detail.settlementStatus],
  ]

  return (
    <div className="detail-grid">
      <section className="detail-card">
        <h3>기본 정보</h3>
        <dl className="detail-info-list">
          {info.map(([label, value]) => (
            <div key={label}>
              <dt>{label}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="detail-card">
        <h3>업무 진행 현황</h3>
        <dl className="detail-info-list">
          {progress.map(([label, value]) => (
            <div key={label}>
              <dt>{label}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
      </section>
    </div>
  )
}
