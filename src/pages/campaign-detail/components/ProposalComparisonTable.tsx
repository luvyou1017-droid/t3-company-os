import type { ProposalCondition } from '../../../features/campaignDetail/types'

type ProposalComparisonTableProps = {
  conditions: ProposalCondition[]
}

export function ProposalComparisonTable({ conditions }: ProposalComparisonTableProps) {
  return (
    <div className="comparison-table-wrap">
      <table className="comparison-table">
        <thead>
          <tr>
            <th>항목</th>
            <th>제안 조건</th>
            <th>확정 조건</th>
            <th>비교</th>
          </tr>
        </thead>
        <tbody>
          {conditions.map((condition) => {
            const isSame = condition.proposedValue === condition.confirmedValue

            return (
              <tr key={condition.label}>
                <td>{condition.label}</td>
                <td>{condition.proposedValue}</td>
                <td>{condition.confirmedValue}</td>
                <td>
                  <span className={isSame ? 'compare-badge compare-badge--same' : 'compare-badge compare-badge--changed'}>
                    {isSame ? '일치' : '변경'}
                  </span>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
