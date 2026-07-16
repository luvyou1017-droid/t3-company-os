import { formatNow, validateAttachment } from '../../../features/cs/csUtils'
import type { CsAttachment } from '../../../features/cs/types'
import { CsAttachmentPreview } from './CsAttachmentPreview'

type CsAttachmentUploaderProps = {
  attachments: CsAttachment[]
  error: string
  onChange: (attachments: CsAttachment[]) => void
  onError: (message: string) => void
}

export function CsAttachmentUploader({ attachments, error, onChange, onError }: CsAttachmentUploaderProps) {
  const handleFiles = (files: FileList | null) => {
    if (!files) return
    let nextAttachments = [...attachments]

    Array.from(files).forEach((file) => {
      const message = validateAttachment(file, nextAttachments)
      if (message) {
        onError(message)
        return
      }

      const fileType = file.type.startsWith('image/') ? 'image' : 'video'
      nextAttachments = [
        ...nextAttachments,
        {
          id: crypto.randomUUID(),
          csCaseId: 'pending',
          fileName: file.name,
          fileType,
          mimeType: file.type,
          fileSize: file.size,
          previewUrl: URL.createObjectURL(file),
          storagePath: `mock/cs/pending/${file.name}`,
          uploadedAt: formatNow(),
        },
      ]
    })

    onChange(nextAttachments)
  }

  return (
    <section className="public-card">
      <h3>사진·영상 첨부</h3>
      <p>이미지는 10MB 이하, 영상은 100MB 이하로 최대 5개까지 첨부할 수 있습니다. 영상은 최대 1개입니다.</p>
      <label className="file-dropzone">
        <input accept=".jpg,.jpeg,.png,.webp,.mp4,.mov,.webm" multiple onChange={(event) => handleFiles(event.target.files)} type="file" />
        <span>파일 선택 또는 다시 선택</span>
      </label>
      {error && <p className="form-error">{error}</p>}
      <div className="cs-attachment-list">
        {attachments.map((attachment) => (
          <CsAttachmentPreview
            attachment={attachment}
            key={attachment.id}
            onRemove={(id) => onChange(attachments.filter((item) => item.id !== id))}
          />
        ))}
      </div>
    </section>
  )
}
