type CampaignPlaceholderTabProps = {
  title: string
}

export function CampaignPlaceholderTab({ title }: CampaignPlaceholderTabProps) {
  return (
    <section className="detail-card placeholder-tab">
      <h3>{title}</h3>
      <p>이 영역은 다음 단계에서 구현됩니다.</p>
      <div className="placeholder-summary">
        <span>연결 데이터 준비</span>
        <span>권한 정책 필요</span>
        <span>이력 저장 필요</span>
      </div>
    </section>
  )
}
