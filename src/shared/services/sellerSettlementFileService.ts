import { supabase } from '../lib/supabase'
import { toDatabaseUuid } from '../utils/databaseId'

export const SELLER_DOCUMENTS_BUCKET = 'seller-documents'
export const SELLER_EXCEL_LINK_TTL_SECONDS = 14 * 24 * 60 * 60
const MAX_SELLER_EXCEL_SIZE = 25 * 1024 * 1024

function safeFileName(name: string) {
  return name.normalize('NFKC').replace(/[^a-zA-Z0-9._-]/g, '_') || `sales-data-${Date.now()}.xlsx`
}

function storageError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error)
  if (/bucket.*not found|does not exist/i.test(message)) return new Error('셀러 구매내역 저장공간 설정이 필요합니다.')
  if (/mime|content.?type/i.test(message)) return new Error('엑셀 공유 권한 설정이 아직 적용되지 않았습니다.')
  if (/permission|policy|row-level security|unauthorized/i.test(message)) return new Error('원본 엑셀을 공유할 권한이 없습니다. 대표 또는 정산 담당자 계정으로 확인해주세요.')
  return new Error(`원본 엑셀 저장에 실패했습니다. (${message})`)
}

export const sellerSettlementFileService = {
  validate(file: File) {
    if (!/\.(xlsx|xls|csv)$/i.test(file.name)) return { valid: false as const, error: '엑셀 또는 CSV 파일만 등록할 수 있습니다.' }
    if (file.size > MAX_SELLER_EXCEL_SIZE) return { valid: false as const, error: '파일 크기는 25MB 이하여야 합니다.' }
    return { valid: true as const }
  },

  async uploadOriginal(file: File, context: { campaignId: string; salesDataImportId: string; previousPath?: string }) {
    const validation = this.validate(file)
    if (!validation.valid) throw new Error(validation.error)
    if (!supabase) throw new Error('데이터베이스 연결을 확인해주세요.')
    const path = `settlement-exports/campaigns/${toDatabaseUuid(context.campaignId)}/sales-imports/${toDatabaseUuid(context.salesDataImportId)}/${crypto.randomUUID()}-${safeFileName(file.name)}`
    const contentType = file.type || (/\.csv$/i.test(file.name) ? 'text/csv' : /\.xls$/i.test(file.name) ? 'application/vnd.ms-excel' : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    const { error } = await supabase.storage.from(SELLER_DOCUMENTS_BUCKET).upload(path, file, { contentType, upsert: false })
    if (error) throw storageError(error)
    if (context.previousPath) void supabase.storage.from(SELLER_DOCUMENTS_BUCKET).remove([context.previousPath])
    return path
  },

  async createShareLink(path: string) {
    if (!supabase) throw new Error('데이터베이스 연결을 확인해주세요.')
    const { data, error } = await supabase.storage.from(SELLER_DOCUMENTS_BUCKET).createSignedUrl(path, SELLER_EXCEL_LINK_TTL_SECONDS, { download: true })
    if (error) throw storageError(error)
    return {
      url: data.signedUrl,
      expiresAt: new Date(Date.now() + SELLER_EXCEL_LINK_TTL_SECONDS * 1000).toISOString(),
    }
  },
}
