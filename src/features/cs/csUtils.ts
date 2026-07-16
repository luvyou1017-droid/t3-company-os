import type { CsAttachment, CsCase, CsIntakeFormData, CsPriority, CsType } from './types'

export function generateCsCaseNumber(existingCount: number) {
  return `CS-2026-${String(128 + existingCount).padStart(6, '0')}`
}

export function formatNow() {
  return '2026.07.15 14:12'
}

export function maskPhoneNumber(phone: string) {
  return phone.replace(/(\d{3})-?(\d{3,4})-?(\d{4})/, '$1-****-$3')
}

export function formatFileSize(size: number) {
  if (size >= 1024 * 1024) return `${(size / 1024 / 1024).toFixed(1)}MB`
  return `${Math.ceil(size / 1024)}KB`
}

export function calculateElapsedTime(csCase: CsCase) {
  if (csCase.status === '처리 완료') return '완료'
  return csCase.receivedAt.includes('10:20') ? '3시간 52분' : '방금 접수'
}

export function calculateCsPriority(csCase: Pick<CsCase, 'csType' | 'attachments' | 'description' | 'status'>): CsPriority {
  const hasVideo = csCase.attachments.some((attachment) => attachment.fileType === 'video')
  const text = csCase.description
  if (text.includes('안전') || text.includes('다량') || (csCase.csType === '불량·교환' && hasVideo)) return 'urgent'
  if (['배송 누락', '오발송', '불량·교환', '반품·환불'].includes(csCase.csType)) return 'high'
  if (csCase.attachments.length > 0) return 'high'
  if (csCase.csType === '배송 지연' && text.includes('2일')) return 'high'
  if (['상품 문의', '기타'].includes(csCase.csType)) return 'medium'
  return 'low'
}

export function getAttachmentRequirement(csType: CsType | '', description: string) {
  if (csType === '불량·교환') {
    return { required: true, imageOnly: false, guide: '상품 전체와 문제가 발생한 부분이 함께 보이도록 촬영해주세요.' }
  }
  if (csType === '배송 누락') {
    return { required: false, imageOnly: false, guide: '받으신 박스와 구성품 전체가 보이도록 촬영해주세요.' }
  }
  if (csType === '오발송') {
    return { required: true, imageOnly: true, guide: '배송받은 상품명과 옵션을 확인할 수 있도록 촬영해주세요.' }
  }
  if (csType === '반품·환불' && (description.includes('불량') || description.includes('파손'))) {
    return { required: true, imageOnly: false, guide: '불량 또는 파손 상태를 확인할 수 있도록 촬영해주세요.' }
  }
  return { required: false, imageOnly: false, guide: '제품 작동 문제나 소리, 움직임과 관련된 문제는 영상으로 첨부해주세요.' }
}

export function validateAttachment(file: File, currentAttachments: CsAttachment[]) {
  const imageTypes = ['image/jpeg', 'image/png', 'image/webp']
  const videoTypes = ['video/mp4', 'video/quicktime', 'video/webm']
  const isImage = imageTypes.includes(file.type)
  const isVideo = videoTypes.includes(file.type)
  if (!isImage && !isVideo) return 'jpg, jpeg, png, webp, mp4, mov, webm 파일만 첨부할 수 있습니다.'
  if (currentAttachments.length >= 5) return '첨부 파일은 최대 5개까지 등록할 수 있습니다.'
  if (isVideo && currentAttachments.some((attachment) => attachment.fileType === 'video')) return '영상은 최대 1개까지 첨부할 수 있습니다.'
  if (isImage && file.size > 10 * 1024 * 1024) return '이미지는 한 장당 10MB 이하로 첨부해주세요.'
  if (isVideo && file.size > 100 * 1024 * 1024) return '영상은 100MB 이하로 첨부해주세요.'
  return ''
}

export function isIntakeValid(form: CsIntakeFormData, attachments: CsAttachment[]) {
  const required = [form.customerName, form.customerPhone, form.productName, form.optionName, form.csType, form.description]
  const attachmentRule = getAttachmentRequirement(form.csType, form.description)
  return required.every(Boolean) && form.privacyConsent && (!attachmentRule.required || attachments.length > 0)
}
