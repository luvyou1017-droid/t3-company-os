import { useEffect, useState } from 'react'
import type { PaymentEvidence } from '../../../shared/types/paymentEvidence'

type Props = {
  evidence: PaymentEvidence | null
  onClose: () => void
}

export function EvidencePreviewModal({ evidence, onClose }: Props) {
  const [scale, setScale] = useState<'fit' | 'original' | number>('fit')
  const [rotation, setRotation] = useState(0)

  useEffect(() => {
    if (!evidence) return
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose() }
    document.addEventListener('keydown', closeOnEscape)
    return () => document.removeEventListener('keydown', closeOnEscape)
  }, [evidence, onClose])

  if (!evidence) return null
  const isPdf = evidence.fileType === 'application/pdf'
  const isImage = ['image/png', 'image/jpeg', 'image/webp'].includes(evidence.fileType)
  return <div className="evidence-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
    <section aria-label={`${evidence.fileName} 크게 보기`} aria-modal="true" className="evidence-preview-modal" role="dialog">
      <header>
        <div><strong>{evidence.fileName}</strong><small>{evidence.uploadedBy} · {new Date(evidence.uploadedAt).toLocaleString('ko-KR')}</small></div>
        <div className="button-row evidence-viewer-controls">
          {isImage && <>
            <button onClick={() => setScale('fit')} type="button">화면 맞춤</button>
            <button onClick={() => setScale((current) => Math.min(4, (typeof current === 'number' ? current : 1) + .25))} type="button">확대 +</button>
            <button onClick={() => setScale((current) => Math.max(.25, (typeof current === 'number' ? current : 1) - .25))} type="button">축소 −</button>
            <button onClick={() => setScale('original')} type="button">원본 크기</button>
            <button onClick={() => setRotation((current) => (current + 90) % 360)} type="button">90° 회전</button>
          </>}
          <button className="modal-close-button" onClick={onClose} type="button">닫기</button>
        </div>
      </header>
      <div className="evidence-viewer-canvas">
        {isImage && evidence.previewUrl && <img
          alt={`${evidence.fileName} 증빙 원본`}
          className={scale === 'fit' ? 'is-fit' : scale === 'original' ? 'is-original' : ''}
          src={evidence.previewUrl}
          style={{ transform: `rotate(${rotation}deg)${typeof scale === 'number' ? ` scale(${scale})` : ''}` }}
        />}
        {isPdf && evidence.previewUrl && <iframe src={evidence.previewUrl} title={`${evidence.fileName} PDF 미리보기`} />}
        {(!evidence.previewUrl || (!isImage && !isPdf)) && <div className="workspace-empty"><strong>현재 세션에서 미리보기를 사용할 수 없습니다.</strong><p>파일 메타데이터는 유지되지만 실제 파일은 서버에 저장되지 않습니다.</p></div>}
      </div>
    </section>
  </div>
}
