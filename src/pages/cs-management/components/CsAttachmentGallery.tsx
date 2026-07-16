import { formatFileSize } from '../../../features/cs/csUtils'
import type { CsAttachment } from '../../../features/cs/types'

export function CsAttachmentGallery({ attachments }: { attachments: CsAttachment[] }) {
  return (
    <section className="cs-attachment-gallery">
      <h3>첨부 파일</h3>
      {attachments.length === 0 ? <p className="muted-text">첨부 파일이 없습니다.</p> : attachments.map((attachment) => (
        <article className="cs-attachment-preview" key={attachment.id}>
          <div className="cs-attachment-preview__media">
            {attachment.fileType === 'image' && attachment.previewUrl ? <img alt="" src={attachment.previewUrl} /> : attachment.fileType === 'video' && attachment.previewUrl ? <video controls src={attachment.previewUrl} /> : <span>{attachment.fileType}</span>}
          </div>
          <div><strong>{attachment.fileName}</strong><span>{formatFileSize(attachment.fileSize)}</span><span>{attachment.uploadedAt}</span></div>
          <button className="secondary-button" type="button">전체 화면 보기 placeholder</button>
        </article>
      ))}
    </section>
  )
}
