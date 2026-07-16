import type { Proposal } from '../../../features/campaignDetail/types'
import { ProposalComparisonTable } from './ProposalComparisonTable'

type CampaignProposalTabProps = {
  proposal: Proposal
  notice: string
  onMockAction: (message: string) => void
}

export function CampaignProposalTab({ proposal, notice, onMockAction }: CampaignProposalTabProps) {
  return (
    <div className="detail-grid detail-grid--proposal">
      <section className="detail-card proposal-card">
        <h3>제안서 카드</h3>
        <div className="proposal-image-placeholder">제안서 이미지 placeholder</div>
        <dl className="detail-info-list">
          <div>
            <dt>제안서명</dt>
            <dd>{proposal.title}</dd>
          </div>
          <div>
            <dt>작성자</dt>
            <dd>{proposal.author}</dd>
          </div>
          <div>
            <dt>작성일</dt>
            <dd>{proposal.createdAt}</dd>
          </div>
        </dl>
        <div className="action-row">
          {['제안서 미리보기', '원본 열기', '새 버전 만들기', '일정 조건과 비교'].map((label) => (
            <button
              className={label === '일정 조건과 비교' ? 'primary-button' : 'secondary-button'}
              key={label}
              onClick={() => onMockAction(`${label} 기능은 다음 단계에서 연결됩니다.`)}
              type="button"
            >
              {label}
            </button>
          ))}
        </div>
        {notice && <p className="mock-notice">{notice}</p>}
      </section>

      <section className="detail-card">
        <h3>제안 조건과 확정 조건 비교</h3>
        <ProposalComparisonTable conditions={proposal.conditions} />
      </section>
    </div>
  )
}
