import { formatFileSize } from '../../../features/cs/csUtils'
import type { CsAttachment } from '../../../features/cs/types'

type CsAttachmentPreviewProps = {
  attachment: CsAttachment
  onRemove: (id: string) => void
}

export function CsAttachmentPreview({ attachment, onRemove }: CsAttachmentPreviewProps) {
  return (
    <article className="cs-attachment-preview">
      <div className="cs-attachment-preview__media">
        {attachment.fileType === 'image' && attachment.previewUrl ? (
          <img alt="" src={attachment.previewUrl} />
        ) : attachment.fileType === 'video' && attachment.previewUrl ? (
          <video controls src={attachment.previewUrl} />
        ) : (
          <span>{attachment.fileType === 'image' ? '이미지' : '영상'}</span>
        )}
      </div>
      <div>
        <strong>{attachment.fileName}</strong>
        <span>{attachment.mimeType}</span>
        <span>{formatFileSize(attachment.fileSize)}</span>
      </div>
      <button className="secondary-button" onClick={() => onRemove(attachment.id)} type="button">
        삭제
      </button>
    </article>
  )
}
