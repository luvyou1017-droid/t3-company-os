import type { CampaignLinkInfo } from '../../../features/campaignDetail/types'

type CampaignLinkOrderTabProps = {
  linkInfo: CampaignLinkInfo
  notice: string
  onMockAction: (message: string) => void
  onToggleReviewItem: (key: keyof CampaignLinkInfo['reviewChecklist']) => void
  onUpdate: (nextLinkInfo: CampaignLinkInfo) => void
}

export function CampaignLinkOrderTab({
  linkInfo,
  notice,
  onMockAction,
  onToggleReviewItem,
  onUpdate,
}: CampaignLinkOrderTabProps) {
  const infoRows = [
    ['링크 주체', linkInfo.linkOwner],
    ['판매 링크', linkInfo.salesLink],
    ['외부 발주 프로그램 링크', linkInfo.externalOrderLink],
    ['링크 요청자', linkInfo.linkRequester],
    ['링크 요청일', linkInfo.requestedAt],
    ['링크 수신일', linkInfo.receivedAt],
    ['링크 검수자', linkInfo.reviewer],
    ['셀러 전달일', linkInfo.deliveredToSellerAt],
  ]

  return (
    <div className="detail-grid">
      <section className="detail-card">
        <h3>링크·발주 정보</h3>
        <dl className="detail-info-list">
          {infoRows.map(([label, value]) => (
            <div key={label}>
              <dt>{label}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="detail-card">
        <h3>검수 체크리스트</h3>
        <div className="link-checklist">
          {Object.entries(linkInfo.reviewChecklist).map(([key, checked]) => (
            <label className="checklist-item" key={key}>
              <input
                checked={checked}
                onChange={() => onToggleReviewItem(key as keyof CampaignLinkInfo['reviewChecklist'])}
                type="checkbox"
              />
              <span>{key}</span>
            </label>
          ))}
        </div>

        <div className="action-row">
          <button className="secondary-button" onClick={() => onMockAction('링크 열기는 다음 단계에서 실제 링크로 연결됩니다.')} type="button">
            링크 열기
          </button>
          <button className="secondary-button" onClick={() => onMockAction('판매 링크가 복사된 것으로 mock 처리했습니다.')} type="button">
            링크 복사
          </button>
          <button className="secondary-button" onClick={() => onMockAction('MD에게 수정 요청 상태로 mock 처리했습니다.')} type="button">
            MD에게 수정 요청
          </button>
          <button
            className="primary-button"
            onClick={() => onUpdate({ ...linkInfo, reviewCompleted: true })}
            type="button"
          >
            검수 완료
          </button>
          <button
            className="primary-button"
            onClick={() => onUpdate({ ...linkInfo, sellerDelivered: true })}
            type="button"
          >
            셀러 전달 완료
          </button>
        </div>

        <p className="mock-status">
          검수 {linkInfo.reviewCompleted ? '완료' : '대기'} · 셀러 전달{' '}
          {linkInfo.sellerDelivered ? '완료' : '대기'}
        </p>
        {notice && <p className="mock-notice">{notice}</p>}
      </section>
    </div>
  )
}
