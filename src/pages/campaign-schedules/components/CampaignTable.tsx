import { useEffect, useState } from 'react'
import { productService } from '../../../features/productMaster/services/productService'
import { campaignReadiness } from '../../../shared/utils/campaignReadiness'
import { campaignService } from '../../../shared/services/campaignService'
import { campaignProductCatalogService } from '../../../shared/services/campaignProductCatalogService'
import {
  getCampaignStatus,
} from '../../../features/campaignSchedules/scheduleStatus'
import type { CampaignSchedule } from '../../../features/campaignSchedules/types'
import { CampaignTimingBadge } from '../../../shared/components/CampaignTimingBadge'
import { LandingPageBadge } from '../../../shared/components/LandingPageBadge'
import { ManagerBadge } from '../../../shared/components/ManagerBadge'
import { CampaignMobileCard } from './CampaignMobileCard'
import { CampaignStatusBadge } from './CampaignStatusBadge'

type CampaignTableProps = {
  schedules: CampaignSchedule[]
  onSelect: (schedule: CampaignSchedule) => void
}

function getSettlementStep(schedule: CampaignSchedule) {
  if (schedule.settlementStage) return schedule.settlementStage
  if (schedule.sellerPaymentCompleted && schedule.managerPaymentCompleted) {
    return '지급 완료'
  }

  if (schedule.managerPaymentCompleted) {
    return '매니저 지급 완료'
  }

  if (schedule.sellerPaymentCompleted) {
    return '셀러 지급 완료'
  }

  if (schedule.settlementDocumentCompleted) {
    return '정산서 완성'
  }

  if (schedule.vendorSettlementCompleted) {
    return '업체 정산 완료'
  }

  return '정산 전'
}

export function CampaignTable({ schedules, onSelect }: CampaignTableProps) {
  const [, refreshCatalog] = useState(0)
  useEffect(() => { let active = true; void productService.listProducts().then(products => {
    if (active) { campaignProductCatalogService.registerProductMasters(products); refreshCatalog(value => value + 1) }
  }).catch(() => { /* Missing terms remain visibly unready. */ }); return () => { active = false } }, [])
  if (schedules.length === 0) {
    return (
      <section className="empty-state">
        <strong>조건에 맞는 일정이 없습니다.</strong>
        <p>검색어 또는 필터 조건을 변경해 주세요.</p>
      </section>
    )
  }

  return (
    <>
      <div className="schedule-table-wrap">
        <table className="schedule-table">
          <thead>
            <tr>
              <th>D-day</th>
              <th>진행 상태</th>
              <th>공동구매 일정명</th>
              <th>담당 매니저</th>
              <th>일정</th>
              <th>랜딩페이지</th>
              <th>오늘 할 일</th>
              <th>미처리 CS</th>
              <th>정산 단계</th>
              <th>남은 업무</th>
            </tr>
          </thead>
          <tbody>
            {schedules.map((schedule) => {
              const campaign = campaignService.getCampaignById(schedule.id)
              const readiness = campaign ? campaignReadiness(campaign, campaignProductCatalogService.getManagedProducts()) : undefined
              const remainingWorkCount =
                schedule.pendingTaskCount + schedule.pendingCsCount + schedule.pendingSampleCount

              return (
                <tr key={schedule.id} onClick={() => onSelect(schedule)}>
                  <td>
                    <CampaignTimingBadge endDate={schedule.endDate} startDate={schedule.startDate} />
                  </td>
                  <td>
                    <CampaignStatusBadge status={getCampaignStatus(schedule)} />
                  </td>
                  <td>
                    <strong>{schedule.campaignName}</strong><small style={{ display: 'block' }}>일정 등록 완료 · {readiness?.label}</small>
                  </td>
                  <td><ManagerBadge name={schedule.managerName} /></td>
                  <td>
                    {schedule.startDate && schedule.endDate
                      ? `${schedule.startDate} - ${schedule.endDate}`
                      : '미정'}
                  </td>
                  <td><LandingPageBadge landingPageType={schedule.landingPageType} linkOwner={schedule.linkOwner} /></td>
                  <td className="schedule-table__task">{schedule.todayTask}</td>
                  <td>{schedule.pendingCsCount}건</td>
                  <td>{getSettlementStep(schedule)}</td>
                  <td>{remainingWorkCount + (readiness?.tasks.length ?? 0)}건{readiness?.tasks.map(task => <small style={{ display: 'block' }} key={task}>{task} 1건</small>)}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <div className="schedule-mobile-list">
        {schedules.map((schedule) => (
          <CampaignMobileCard key={schedule.id} onClick={onSelect} schedule={schedule} />
        ))}
      </div>
    </>
  )
}
