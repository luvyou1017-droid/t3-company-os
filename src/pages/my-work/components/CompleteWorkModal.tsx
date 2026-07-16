import { useState } from 'react'
import type { WorkItem } from '../../../features/myWork/types'

type CompleteWorkModalProps = {
  item: WorkItem | null
  onClose: () => void
  onComplete: (itemId: string, memo: string, completedAt: string) => void
}

export function CompleteWorkModal({ item, onClose, onComplete }: CompleteWorkModalProps) {
  const [memo, setMemo] = useState('')
  const [completedAt, setCompletedAt] = useState('2026-07-15 11:00')
  const [needsEvidence, setNeedsEvidence] = useState(false)

  if (!item) return null

  return (
    <div className="drawer-backdrop">
      <section className="complete-modal">
        <h3>완료 처리</h3>
        <p>{item.title}</p>
        <label><span>완료 메모</span><textarea value={memo} onChange={(event) => setMemo(event.target.value)} /></label>
        <label><span>완료 시간</span><input value={completedAt} onChange={(event) => setCompletedAt(event.target.value)} /></label>
        <label className="checkbox-line"><input checked={needsEvidence} onChange={(event) => setNeedsEvidence(event.target.checked)} type="checkbox" /> 증빙 필요</label>
        <div className="file-placeholder">관련 파일 첨부 placeholder</div>
        <div className="action-row">
          <button className="primary-button" onClick={() => onComplete(item.id, memo || '완료 처리했습니다.', completedAt)} type="button">완료</button>
          <button className="secondary-button" onClick={onClose} type="button">닫기</button>
        </div>
      </section>
    </div>
  )
}
