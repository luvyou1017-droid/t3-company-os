type DailyBriefingCardProps = {
  message: string
  onImportantOnly: () => void
  onRefresh: () => void
  onCopy: () => void
  copyStatus: string
}

export function DailyBriefingCard({ message, onImportantOnly, onRefresh, onCopy, copyStatus }: DailyBriefingCardProps) {
  return (
    <section className="daily-briefing-card">
      <div>
        <p className="page-eyebrow">실제 등록 업무 기준</p>
        <h3>오늘의 운영 브리핑</h3>
        <p style={{ whiteSpace: 'pre-line' }}>{message}</p>
      </div>
      <div className="action-row">
        <button className="secondary-button" onClick={onRefresh} type="button">브리핑 새로 만들기</button>
        <button className="secondary-button" onClick={onCopy} type="button">카카오톡용 업무 안내 복사</button>
        <button className="primary-button" onClick={onImportantOnly} type="button">중요 업무만 보기</button>
      </div>
      {copyStatus && <p role="status">{copyStatus}</p>}
    </section>
  )
}
