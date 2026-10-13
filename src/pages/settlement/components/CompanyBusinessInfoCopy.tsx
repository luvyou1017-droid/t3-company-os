import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { copyCompanyBusinessImage, loadCompanyBusinessImage } from '../../../shared/services/companyBusinessImageService'

export function CompanyBusinessInfoCopy() {
  const [notice, setNotice] = useState('')
  const [imageFallback, setImageFallback] = useState(false)
  const [imageUrl, setImageUrl] = useState('')
  const [busy,setBusy]=useState(false)
  const [copyError,setCopyError]=useState(false)
  useEffect(()=>{
    if(!notice || imageFallback || busy)return
    const timer=window.setTimeout(()=>setNotice(''),2000)
    return ()=>window.clearTimeout(timer)
  },[notice,imageFallback,busy])
  useEffect(()=>()=>{if(imageUrl)URL.revokeObjectURL(imageUrl)},[imageUrl])
  const showImage=async()=> {
    try { const blob=await loadCompanyBusinessImage();setImageUrl(URL.createObjectURL(blob));setImageFallback(true) }
    catch(error){setNotice(error instanceof Error?error.message:'이미지를 불러오지 못했습니다.')}
  }
  const copyImage=async()=> {
    if(busy)return
    setBusy(true);setNotice('');setCopyError(false)
    try {
      // Start clipboard.write within the click gesture, including on Safari.
      await copyCompanyBusinessImage()
      setNotice('사업자등록증 + 통장사본 원본 이미지를 복사했습니다. 대화창에 붙여넣어주세요.')
      setImageFallback(false)
    } catch {
      setCopyError(true)
      setNotice('자동 이미지 복사를 사용할 수 없습니다. 원본 이미지를 저장해서 첨부해주세요.')
      await showImage()
    } finally {setBusy(false)}
  }
  return <>
    <button className="primary-button" type="button" disabled={busy} onClick={() => void copyImage()}>{busy?'이미지 복사 중…':'사업자 정보 복사하기'}</button>
    {notice && !imageFallback && typeof document!=='undefined' && createPortal(<div role="status" aria-live="polite" className={`clipboard-toast ${copyError?'is-error':''}`} style={{maxWidth:'85vw',whiteSpace:'normal'}}>{copyError?'!':'✓'} {notice}</div>,document.body)}
    {imageFallback && <div className="settlement-modal-backdrop" onMouseDown={event=>{if(event.currentTarget===event.target)setImageFallback(false)}}><section className="settlement-readiness-modal" role="dialog" aria-modal="true" aria-label="사업자등록증 및 통장사본 이미지">
      <h2>사업자등록증 + 통장사본</h2><p role="status">{notice}</p>
      <img src={imageUrl} alt="주식회사 솔루션파트너스 사업자등록증과 통장사본 원본" style={{width:'100%',maxHeight:'60vh',objectFit:'contain'}} />
      <div className="action-row"><button className="primary-button" type="button" disabled={busy} onClick={()=>void copyImage()}>이미지 다시 복사</button><a className="secondary-button" href={imageUrl} download="솔루션파트너스_사업자등록증_통장사본.png">원본 이미지 저장</a><button className="secondary-button" type="button" onClick={()=>setImageFallback(false)}>닫기</button></div>
    </section></div>}

  </>
}
