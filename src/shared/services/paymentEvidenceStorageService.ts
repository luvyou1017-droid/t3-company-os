import { getDataProviderMode } from '../lib/dataProvider'
import { supabase } from '../lib/supabase'
import type { EvidenceOwnerType } from '../types/paymentEvidence'

export const PAYMENT_EVIDENCE_BUCKET = 'payment-evidence'
export const MAX_PAYMENT_EVIDENCE_FILE_SIZE = 10 * 1024 * 1024
export const PAYMENT_EVIDENCE_ALLOWED_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'application/pdf'] as const

type UploadContext = {
  campaignId: string
  settlementId: string
  ownerType: EvidenceOwnerType
  ownerId: string
  evidenceId: string
}

function safeFileName(name: string) {
  return name.normalize('NFKC').replace(/[^a-zA-Z0-9._-]/g, '_')
}

function storageError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error)
  if (message.toLowerCase().includes('jwt')) return new Error('세션이 만료되었습니다. 다시 로그인해주세요.')
  if (message.toLowerCase().includes('permission') || message.toLowerCase().includes('policy')) return new Error('증빙파일 접근 권한이 없습니다.')
  return new Error(`증빙파일 업로드에 실패했습니다. 네트워크 연결을 확인해주세요. (${message})`)
}

export const paymentEvidenceStorageService = {
  validateEvidenceFile(file: File) {
    if (!PAYMENT_EVIDENCE_ALLOWED_TYPES.includes(file.type as typeof PAYMENT_EVIDENCE_ALLOWED_TYPES[number])) {
      return { valid: false, error: 'PNG, JPEG, WebP 또는 PDF 파일만 업로드할 수 있습니다.' }
    }
    if (file.size > MAX_PAYMENT_EVIDENCE_FILE_SIZE) return { valid: false, error: '파일 크기는 10MB 이하여야 합니다.' }
    return { valid: true as const }
  },
  buildStoragePath(context: UploadContext, fileName: string) {
    return `campaigns/${context.campaignId}/settlements/${context.settlementId}/${context.ownerType}/${context.ownerId}/${context.evidenceId}/${safeFileName(fileName)}`
  },
  async uploadEvidenceFile(file: File, context: UploadContext) {
    const validation = this.validateEvidenceFile(file)
    if (!validation.valid) throw new Error(validation.error)
    if (getDataProviderMode() === 'local') {
      return { bucket: undefined, path: undefined, previewUrl: URL.createObjectURL(file), mode: 'local' as const }
    }
    if (!supabase) throw new Error('데이터베이스 연결에 실패했습니다.')
    const path = this.buildStoragePath(context, file.name)
    const { error } = await supabase.storage.from(PAYMENT_EVIDENCE_BUCKET).upload(path, file, { contentType: file.type, upsert: false })
    if (error) throw storageError(error)
    return { bucket: PAYMENT_EVIDENCE_BUCKET, path, previewUrl: await this.getEvidenceSignedUrl(path), mode: 'supabase' as const }
  },
  async getEvidenceSignedUrl(path: string, expiresIn = 900) {
    if (!supabase) throw new Error('Supabase가 설정되지 않았습니다.')
    const { data, error } = await supabase.storage.from(PAYMENT_EVIDENCE_BUCKET).createSignedUrl(path, expiresIn)
    if (error) throw storageError(error)
    return data.signedUrl
  },
  async deleteEvidenceFile(path: string) {
    if (!supabase) return
    const { error } = await supabase.storage.from(PAYMENT_EVIDENCE_BUCKET).remove([path])
    if (error) throw storageError(error)
  },
  async getEvidencePreviewUrl(storagePath?: string, localPreviewUrl?: string) {
    if (storagePath && supabase) return this.getEvidenceSignedUrl(storagePath)
    return localPreviewUrl
  },
}
