import { getDataProviderMode } from '../lib/dataProvider'
import { supabase } from '../lib/supabase'
import type { EvidenceOwnerType } from '../types/paymentEvidence'
import { toDatabaseUuid } from '../utils/databaseId'

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
  if (message.toLowerCase().includes('permission') || message.toLowerCase().includes('policy') || message.toLowerCase().includes('row-level security')) return new Error('증빙파일을 업로드할 권한이 없습니다. 매니저는 본인이 담당한 공동구매 정산 건의 매니저 증빙만 등록할 수 있습니다. 담당자 지정이 맞는지 확인해주세요.')
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
    return `campaigns/${toDatabaseUuid(context.campaignId)}/settlements/${toDatabaseUuid(context.settlementId)}/${context.ownerType}/${toDatabaseUuid(context.ownerId)}/${toDatabaseUuid(context.evidenceId)}/${safeFileName(fileName)}`
  },
  buildPilotStoragePath(testRunId: string, campaignId: string, settlementId: string, evidenceId: string, fileName: string) {
    return `test-runs/${testRunId}/campaigns/${campaignId}/settlements/${settlementId}/${evidenceId}/${safeFileName(fileName)}`
  },
  async uploadPilotEvidenceFile(file: File, context: { testRunId: string; campaignId: string; settlementId: string; evidenceId: string }) {
    const validation = this.validateEvidenceFile(file)
    if (!validation.valid) throw new Error(validation.error)
    if (!supabase) throw new Error('Supabase 환경변수가 없어 실제 Storage 업로드를 실행할 수 없습니다.')
    const path = this.buildPilotStoragePath(context.testRunId, context.campaignId, context.settlementId, context.evidenceId, file.name)
    const { error } = await supabase.storage.from(PAYMENT_EVIDENCE_BUCKET).upload(path, file, { contentType: file.type, upsert: true })
    if (error) throw storageError(error)
    return { bucket: PAYMENT_EVIDENCE_BUCKET, path, previewUrl: await this.getEvidenceSignedUrl(path), mode: 'supabase' as const }
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
