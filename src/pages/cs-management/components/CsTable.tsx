import { calculateElapsedTime, maskPhoneNumber } from '../../../features/cs/csUtils'
import type { CsCase } from '../../../features/cs/types'
import { CsPriorityBadge } from './CsPriorityBadge'
import { CsStatusBadge } from './CsStatusBadge'

type CsTableProps = {
  cases: CsCase[]
  onSelect: (csCase: CsCase) => void
}

export function CsTable({ cases, onSelect }: CsTableProps) {
  return (
    <>
      <div className="schedule-table-wrap cs-table-wrap">
        <table className="schedule-table">
          <thead>
            <tr>
              <th>접수번호</th><th>접수 시간</th><th>공동구매</th><th>문의 유형</th><th>고객</th><th>첨부</th><th>담당자</th><th>우선순위</th><th>상태</th><th>경과 시간</th>
            </tr>
          </thead>
          <tbody>
            {cases.map((csCase) => (
              <tr key={csCase.id} onClick={() => onSelect(csCase)}>
                <td><strong>{csCase.caseNumber}</strong></td>
                <td>{csCase.receivedAt}</td>
                <td>{csCase.campaignName}</td>
                <td>{csCase.csType}</td>
                <td><strong>{csCase.customerName}</strong><span>{maskPhoneNumber(csCase.customerPhone)}</span></td>
                <td>이미지 {csCase.attachments.filter((item) => item.fileType === 'image').length} · 영상 {csCase.attachments.filter((item) => item.fileType === 'video').length}</td>
                <td>{csCase.assigneeName}</td>
                <td><CsPriorityBadge priority={csCase.priority} /></td>
                <td><CsStatusBadge status={csCase.status} /></td>
                <td>{calculateElapsedTime(csCase)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="schedule-mobile-list">
        {cases.map((csCase) => (
          <button className="schedule-mobile-card" key={csCase.id} onClick={() => onSelect(csCase)} type="button">
            <div className="schedule-mobile-card__top"><strong>{csCase.caseNumber}</strong><span>{calculateElapsedTime(csCase)}</span></div>
            <CsStatusBadge status={csCase.status} />
            <dl><div><dt>공동구매</dt><dd>{csCase.campaignName}</dd></div><div><dt>고객</dt><dd>{csCase.customerName} / {maskPhoneNumber(csCase.customerPhone)}</dd></div><div><dt>문의</dt><dd>{csCase.csType}</dd></div></dl>
          </button>
        ))}
      </div>
    </>
  )
}
