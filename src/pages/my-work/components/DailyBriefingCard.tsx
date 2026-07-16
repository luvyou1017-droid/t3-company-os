type DailyBriefingCardProps = {
  message: string
  onImportantOnly: () => void
  onRefresh: () => void
}

export function DailyBriefingCard({ message, onImportantOnly, onRefresh }: DailyBriefingCardProps) {
  return (
    <section className="daily-briefing-card">
      <div>
        <p className="page-eyebrow">AI 운영비서 mock</p>
        <h3>오늘의 운영 브리핑</h3>
        <p>{message}</p>
      </div>
      <div className="action-row">
        <button className="secondary-button" onClick={onRefresh} type="button">브리핑 새로 만들기</button>
        <button className="primary-button" onClick={onImportantOnly} type="button">중요 업무만 보기</button>
      </div>
    </section>
  )
}
