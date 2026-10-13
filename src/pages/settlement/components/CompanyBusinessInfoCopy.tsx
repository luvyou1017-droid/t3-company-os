import { useState } from 'react'
import { companyBusinessMessage } from '../../../shared/utils/companyBusinessMessage'

export function CompanyBusinessInfoCopy() {
  const [notice, setNotice] = useState('')
  const [manualCopy, setManualCopy] = useState(false)
  const message = companyBusinessMessage()
  const copy = async () => {
    try {
      if (!navigator.clipboard?.writeText) throw new Error('Clipboard unavailable')
      await navigator.clipboard.writeText(message)
      setNotice('사업자 정보와 계산서 발행 요청 문구를 복사했습니다.')
      setManualCopy(false)
    } catch {
      setNotice('자동 복사를 사용할 수 없습니다. 아래 문구를 선택하여 복사해주세요.')
      setManualCopy(true)
    }
  }
  return <>
    <button className="primary-button" type="button" onClick={() => void copy()}>사업자 정보 복사하기</button>
    {notice && !manualCopy && <span role="status">{notice}</span>}
    {manualCopy && <div className="settlement-modal-backdrop" onMouseDown={event => { if (event.currentTarget === event.target) setManualCopy(false) }}>
      <section className="settlement-readiness-modal" role="dialog" aria-modal="true" aria-label="사업자 정보 복사">
        <h2>사업자 정보 복사하기</h2><p role="status">{notice}</p>
        <textarea aria-label="사업자 정보 및 계산서 발행 요청 문구" readOnly rows={18} value={message} onFocus={event => event.currentTarget.select()} style={{ width: '100%' }} />
        <div className="action-row"><button className="primary-button" type="button" onClick={() => void copy()}>다시 복사</button><button className="secondary-button" type="button" onClick={() => setManualCopy(false)}>닫기</button></div>
      </section>
    </div>}
  </>
}
