import { useMemo } from 'react'
import type {
  CampaignChecklistGroup,
  CampaignChecklistItem,
} from '../../../features/campaignDetail/types'

const groups: CampaignChecklistGroup[] = [
  'D-14',
  'D-13',
  'D-12',
  'D-11',
  'D-10',
  'D-7',
  'D-5 ~ D-3',
  'D-1',
  'D-DAY',
  '진행 중',
  '종료 다음 날',
  'D+14',
  'D+21 ~ D+28',
]

type CampaignChecklistTabProps = {
  checklist: CampaignChecklistItem[]
  onToggle: (id: string) => void
}

export function CampaignChecklistTab({ checklist, onToggle }: CampaignChecklistTabProps) {
  const completedCount = checklist.filter((item) => item.completed).length
  const completionRate = Math.round((completedCount / checklist.length) * 100)

  const groupedChecklist = useMemo(
    () =>
      groups.map((group) => ({
        group,
        items: checklist.filter((item) => item.group === group),
      })),
    [checklist],
  )

  return (
    <section className="detail-card">
      <div className="checklist-head">
        <div>
          <h3>자동 생성 체크리스트</h3>
          <p>판매 시작일과 종료일 기준으로 운영 업무를 묶어 관리합니다.</p>
        </div>
        <strong>{completedCount} / {checklist.length} · {completionRate}%</strong>
      </div>

      <div className="checklist-groups">
        {groupedChecklist.map(({ group, items }) => (
          <section className="checklist-group" key={group}>
            <h4>{group}</h4>
            {items.length === 0 ? (
              <p className="muted-text">이번 mock에는 등록된 업무가 없습니다.</p>
            ) : (
              <div className="checklist-items">
                {items.map((item) => (
                  <label className="checklist-item" key={item.id}>
                    <input checked={item.completed} onChange={() => onToggle(item.id)} type="checkbox" />
                    <span>{item.title}</span>
                  </label>
                ))}
              </div>
            )}
          </section>
        ))}
      </div>
    </section>
  )
}
