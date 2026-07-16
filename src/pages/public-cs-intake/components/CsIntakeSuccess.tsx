import type { CsCase } from '../../../features/cs/types'

type CsIntakeSuccessProps = {
  csCase: CsCase
  onNew: () => void
}

export function CsIntakeSuccess({ csCase, onNew }: CsIntakeSuccessProps) {
  const imageCount = csCase.attachments.filter((item) => item.fileType === 'image').length
  const videoCount = csCase.attachments.filter((item) => item.fileType === 'video').length

  return (
    <main className="public-cs-page">
      <section className="public-success-card">
        <h1>CS 접수가 완료되었습니다.</h1>
        <dl>
          <div><dt>접수번호</dt><dd>{csCase.caseNumber}</dd></div>
          <div><dt>문의 유형</dt><dd>{csCase.csType}</dd></div>
          <div><dt>첨부</dt><dd>이미지 {imageCount}개, 영상 {videoCount}개</dd></div>
          <div><dt>접수 시간</dt><dd>{csCase.receivedAt}</dd></div>
        </dl>
        <p>담당자가 확인 후 연락드리겠습니다.</p>
        <div className="action-row">
          <button className="primary-button" type="button">접수 내용 확인</button>
          <button className="secondary-button" onClick={onNew} type="button">추가 문의 접수</button>
        </div>
      </section>
    </main>
  )
}
