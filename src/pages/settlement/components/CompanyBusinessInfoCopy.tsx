import { useEffect, useState } from 'react'
import { companyBusinessMessage } from '../../../shared/utils/companyBusinessMessage'
import { copyCompanyBusinessImage, loadCompanyBusinessImage } from '../../../shared/services/companyBusinessImageService'

export function CompanyBusinessInfoCopy() {
  const [notice, setNotice] = useState('')
  const [manualCopy, setManualCopy] = useState(false)
  const [imageFallback, setImageFallback] = useState(false)
  const [imageUrl, setImageUrl] = useState('')
  const [busy,setBusy]=useState(false)
  const message = companyBusinessMessage()
  useEffect(()=>()=>{if(imageUrl)URL.revokeObjectURL(imageUrl)},[imageUrl])
  const showImage=async()=> {
    try { const blob=await loadCompanyBusinessImage();setImageUrl(URL.createObjectURL(blob));setImageFallback(true) }
    catch(error){setNotice(error instanceof Error?error.message:'이미지를 불러오지 못했습니다.')}
  }
  const copyImage=async()=> {
    if(busy)return
    setBusy(true);setNotice('')
    try {
      // Start clipboard.write within the click gesture, including on Safari.
      await copyCompanyBusinessImage()
      setNotice('사업자등록증 + 통장사본 원본 이미지를 복사했습니다. 대화창에 붙여넣어주세요.')
      setImageFallback(false)
    } catch {
      setNotice('자동 이미지 복사를 사용할 수 없습니다. 원본 이미지를 저장해서 첨부해주세요.')
      await showImage()
    } finally {setBusy(false)}
  }
  const copyMessage = async () => {
    try {
      if (!navigator.clipboard?.writeText) throw new Error('Clipboard unavailable')
      await navigator.clipboard.writeText(message)
      setNotice('계산서 발행 요청 문구를 복사했습니다.')
      setManualCopy(false)
    } catch {
      setNotice('자동 복사를 사용할 수 없습니다. 아래 문구를 선택하여 복사해주세요.')
      setManualCopy(true)
    }
  }
  return <>
    <button className="primary-button" type="button" disabled={busy} onClick={() => void copyImage()}>{busy?'이미지 복사 중…':'사업자 정보 복사하기'}</button>
    <button className="secondary-button" type="button" onClick={() => void copyMessage()}>발행 요청 문구 복사</button>
    {notice && !manualCopy && !imageFallback && <span role="status">{notice}</span>}
    {imageFallback && <div className="settlement-modal-backdrop" onMouseDown={event=>{if(event.currentTarget===event.target)setImageFallback(false)}}><section className="settlement-readiness-modal" role="dialog" aria-modal="true" aria-label="사업자등록증 및 통장사본 이미지">
      <h2>사업자등록증 + 통장사본</h2><p role="status">{notice}</p>
      <img src={imageUrl} alt="주식회사 솔루션파트너스 사업자등록증과 통장사본 원본" style={{width:'100%',maxHeight:'60vh',objectFit:'contain'}} />
      <div className="action-row"><button className="primary-button" type="button" disabled={busy} onClick={()=>void copyImage()}>이미지 다시 복사</button><a className="secondary-button" href={imageUrl} download="솔루션파트너스_사업자등록증_통장사본.png">원본 이미지 저장</a><button className="secondary-button" type="button" onClick={()=>setImageFallback(false)}>닫기</button></div>
    </section></div>}
    {manualCopy && <div className="settlement-modal-backdrop" onMouseDown={event => { if (event.currentTarget === event.target) setManualCopy(false) }}>
      <section className="settlement-readiness-modal" role="dialog" aria-modal="true" aria-label="계산서 발행 요청 문구 복사">
        <h2>발행 요청 문구 복사</h2><p role="status">{notice}</p>
        <textarea aria-label="사업자 정보 및 계산서 발행 요청 문구" readOnly rows={18} value={message} onFocus={event => event.currentTarget.select()} style={{ width: '100%' }} />
        <div className="action-row"><button className="primary-button" type="button" onClick={() => void copyMessage()}>다시 복사</button><button className="secondary-button" type="button" onClick={() => setManualCopy(false)}>닫기</button></div>
      </section>
    </div>}
  </>
}
