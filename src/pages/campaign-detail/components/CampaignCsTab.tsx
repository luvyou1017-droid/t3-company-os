import { useMemo, useState } from 'react'
import { csService } from '../../../features/cs/services/csService'

export function CampaignCsTab({ campaignId }: { campaignId: string }) {
  const [cases] = useState(() => csService.listCases())
  const campaignCases = useMemo(() => cases.filter((csCase) => csCase.campaignId === campaignId), [campaignId, cases])

  return (
    <section className="detail-card">
      <div className="checklist-head">
        <div>
          <h3>CS</h3>
          <p>CS 관리 목록과 같은 mock 데이터 소스를 campaignId로 조회합니다.</p>
        </div>
        <strong className="result-count">{campaignCases.length}건</strong>
      </div>
      {campaignCases.length === 0 ? (
        <div className="empty-state">
          <strong>아직 등록된 CS가 없습니다.</strong>
          <p>외부 접수 또는 CS 관리에서 신규 CS를 등록하면 이곳에 표시됩니다.</p>
        </div>
      ) : (
      <div className="comparison-table-wrap">
        <table className="comparison-table">
          <thead>
            <tr><th>접수번호</th><th>유형</th><th>고객명</th><th>상태</th><th>우선순위</th><th>담당자</th><th>기한</th></tr>
          </thead>
          <tbody>
            {campaignCases.map((csCase) => (
              <tr key={csCase.id}>
                <td>{csCase.caseNumber}</td>
                <td>{csCase.csType}</td>
                <td>{csCase.customerName}</td>
                <td>{csCase.status}</td>
                <td>{csCase.priority}</td>
                <td>{csCase.assigneeName}</td>
                <td>{csCase.dueAt}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      )}
    </section>
  )
}
